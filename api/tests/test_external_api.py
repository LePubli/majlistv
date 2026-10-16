import sys, time, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
adm = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json(); A = {"authorization": "Bearer " + adm["token"]}
def create(vid, rights, access="free", lang="fr", tr=None, url=None):
    return requests.post(B + "/talks", headers=A, json={"title": "Conf " + vid, "language": lang, "access": access, "videoUrl": url or f"https://www.youtube.com/watch?v={vid}",
                                                        "rightsConfirmed": rights, "translateTo": tr or []})
def wait(tid, statuses=("ready", "failed", "unavailable"), timeout=40):
    for _ in range(timeout * 2):
        cur.execute("select transcript_status, transcript_method, transcript_error from talks where id=%s", (tid,)); r = cur.fetchone()
        if r[0] in statuses: return r
        time.sleep(0.5)
    return r

# 1) sans accord de l'auteur : rien n'est transcrit
r = create("noRights001", False); ok(r.status_code == 201, "vidéo YouTube sans accord : créée"); t0 = r.json()["id"]
cur.execute("select transcript_status from talks where id=%s", (t0,)); ok(cur.fetchone()[0] == "unavailable", "sans accord : pas de transcription")
ok(requests.post(f"{B}/talks/{t0}/translations", headers=A, json={"lang": "en"}).json().get("code") == "rights_required", "traduction refusée sans accord")
ok(requests.post(f"{B}/talks/{t0}/transcribe", headers=A, json={}).status_code == 400, "activation sans confirmer l'accord : refus")
ok(create("noRights001", True).status_code == 409, "doublon refusé (déjà dans le catalogue)")

# 2) sous-titres de l'auteur
r = create("subsAAAAAAA", True, tr=["en", "ar"]); t1 = r.json()["id"]
st = wait(t1); ok(st[0] == "ready" and st[1] == "subtitles", f"sous-titres de l'auteur utilisés ({st})")
cur.execute("select start_ms, text from transcript_segments where talk_id=%s and lang=(select transcript_language from talks where id=%s) order by idx", (t1, t1)); segs = cur.fetchall()  # langue d'origine (le traducteur ajoute les autres)
ok(segs == [(0, "Bonjour et bienvenue."), (65000, "La patience est une lumière.")], "segments horodatés enregistrés")
cur.execute("select duration_seconds, external_thumb, description from talks where id=%s", (t1,)); d = cur.fetchone()
ok(d[0] == 3725 and d[1] == "https://img.test/subsAAAAAAA.jpg" and d[2] == "Description venue de la plateforme", "durée, miniature et description récupérées")
cur.execute("select lang from transcript_translations where talk_id=%s order by lang", (t1,)); ok([x[0] for x in cur.fetchall()] == ["ar", "en"], "traductions demandées (en, ar)")
g = requests.get(f"{B}/talks/{t1}").json()
ok(g["tracks"] == ["fr"] and g["playbackToken"] and g["video_ref"] == "subsAAAAAAA" and g["posterUrl"] == "https://img.test/subsAAAAAAA.jpg", "fiche : sous-titres, jeton, lecteur YouTube, miniature")
vtt = requests.get(f"{B}/talks/{t1}/subs/fr.vtt", params={"t": g["playbackToken"]}); ok(vtt.status_code == 200 and "00:01:05.000" in vtt.text, "fichier de sous-titres servi")
tr = requests.get(f"{B}/talks/{t1}/transcript", params={"t": g["playbackToken"], "lang": "fr"}); ok(tr.status_code == 200, "transcription cliquable servie")

# 3) pas de sous-titres -> audio + Whisper
t2 = create("audioBBBBBB", True).json()["id"]; st = wait(t2)
ok(st[0] == "ready" and st[1] == "whisper", f"audio téléchargé puis Whisper ({st})")
cur.execute("select count(*) from transcript_segments where talk_id=%s", (t2,)); ok(cur.fetchone()[0] == 2, "segments Whisper enregistrés")

# 4) audio bloqué -> sous-titres automatiques en dernier recours
t3 = create("autoCCCCCCC", True).json()["id"]; st = wait(t3)
ok(st[0] == "ready" and st[1] == "auto_captions", f"blocage audio -> sous-titres automatiques ({st})")
cur.execute("select text from transcript_segments where talk_id=%s", (t3,)); ok(cur.fetchone()[0] == "voici les sous-titres automatiques", "mots regroupés en phrase")

# 5) blocage total -> échec lisible, sans réessais inutiles
t4 = create("blockedDDDD", True).json()["id"]; st = wait(t4)
ok(st[0] == "failed" and "cookies" in st[2], f"blocage : message clair ({st[2][:60]})")
mine = requests.get(B + "/me/talks", headers=A).json(); x = next(m for m in mine if m["id"] == t4)
ok(x["transcriptError"] and x["transcriptStatus"] == "failed", "erreur visible dans l'espace organisateur")
requests.put(B + "/admin/settings", headers=A, json={"values": {"ytdlp_cookies": "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc"}})
s = requests.get(B + "/admin/settings", headers=A).json(); f = next(x for x in s["fields"] if x["key"] == "ytdlp_cookies")
ok(f["isSet"] and f["hint"] == "(2 lignes)" and "abc" not in str(s), "cookies enregistrés chiffrés, jamais réaffichés")
cur.execute("select is_secret, value like '%SID%' from app_settings where key='ytdlp_cookies'"); ok(cur.fetchone() == (True, False), "cookies chiffrés en base")
ok(requests.post(f"{B}/talks/{t4}/transcribe", headers=A, json={"rightsConfirmed": True}).status_code == 202, "relance possible après correction")

# 6) Vimeo avec sous-titres VTT
t5 = create("76979871", True, lang="en", url="https://vimeo.com/76979871").json()["id"]; st = wait(t5)
ok(st[0] == "ready" and st[1] == "subtitles", "Vimeo : sous-titres VTT")

# 7) activation a posteriori
ok(requests.post(f"{B}/talks/{t0}/transcribe", headers=A, json={"rightsConfirmed": True}).status_code == 202, "activation a posteriori avec accord")
cur.execute("select rights_confirmed, transcript_status from talks where id=%s", (t0,)); r = cur.fetchone(); ok(r[0] is True and r[1] in ("pending", "processing", "failed"), "accord enregistré, transcription lancée")

# 8) premium externe : aperçu, rien de transcrit pour les non-abonnés
t6 = create("subsPREMIUM", True, access="premium").json()["id"]; wait(t6)
g = requests.get(f"{B}/talks/{t6}").json()
ok(g["locked"] and g["preview"] and g["previewSeconds"] == 120 and "tracks" not in g and g["video_ref"] == "subsPREMIUM", "premium : aperçu 2 min, pas de transcription pour un visiteur")
ok(requests.get(f"{B}/talks/{t6}/transcript", params={"t": g["playbackToken"], "lang": "fr"}).status_code in (401, 403), "jeton d'aperçu refusé pour la transcription")
g = requests.get(f"{B}/talks/{t6}", headers=A).json(); ok(not g.get("locked") and g["tracks"] == ["fr"], "admin : accès complet")

# 9) reprise et recherche pour une vidéo externe
ok(requests.put(f"{B}/me/progress/{t1}", headers=A, json={"positionMs": 65000, "durationMs": 3725000}).status_code == 204, "reprise de lecture enregistrée (YouTube)")
ok(requests.get(f"{B}/talks/{t1}", headers=A).json()["resumeMs"] == 65000, "position retrouvée")
r = requests.get(f"{B}/search", params={"q": "patience est une lumière"}).json(); h = next((x for x in r["hits"] if x["id"] == t1), None)
ok(h and h["moments"] and h["moments"][0]["ms"] == 65000, "recherche : passage horodaté dans une vidéo YouTube")

# 10) import d'une playlist
r = requests.post(B + "/imports", headers=A, json={"url": "https://www.example.com/x"}); ok(r.status_code == 400, "adresse non YouTube/Vimeo refusée")
r = requests.post(B + "/imports", headers=A, json={"url": "https://www.youtube.com/playlist?list=PL1"}); ok(r.status_code == 202, "analyse de playlist demandée"); jid = r.json()["id"]
for _ in range(40):
    j = requests.get(f"{B}/imports/{jid}", headers=A).json()
    if j["status"] != "listing": break
    time.sleep(0.5)
ok(j["status"] == "listed" and j["title"] == "Cycle de conférences" and j["count"] == 3, f"liste prête ({j['status']}, {j.get('count')})")
already = {e["id"]: e["already"] for e in j["entries"]}; ok(already == {"subsPLAY001": False, "audioPLAY02": False, "subsAAAAAAA": True}, "vidéo déjà au catalogue signalée")
r = requests.post(f"{B}/imports/{jid}/confirm", headers=A, json={"ids": ["subsPLAY001", "subsAAAAAAA"], "language": "fr", "access": "premium", "speaker": "Intervenant X", "rightsConfirmed": True, "translateTo": ["en"]}).json()
ok(r == {"created": 1, "skipped": 1}, f"import : 1 créée, 1 doublon ignoré ({r})")
cur.execute("select title, access, speaker, rights_confirmed, transcript_status, duration_seconds, external_thumb from talks where video_ref='subsPLAY001'"); row = cur.fetchone()
ok(row[:4] == ("Épisode 1", "premium", "Intervenant X", True) and row[5] == 1800 and row[6] == "https://img.test/p1.jpg", "conférence importée avec titre, accès, intervenant, durée, miniature")
cur.execute("select count(*) from transcript_translations t join talks k on k.id=t.talk_id where k.video_ref='subsPLAY001'"); ok(cur.fetchone()[0] == 1, "traduction demandée pour la vidéo importée")
lst = requests.get(B + "/imports", headers=A).json(); ok(lst[0]["id"] == jid and lst[0]["imported"] == 1 and lst[0]["status"] == "imported", "historique des imports")
r = requests.post(f"{B}/imports/{jid}/confirm", headers=A, json={"ids": ["audioPLAY02"], "rightsConfirmed": False}).json(); ok(r == {"created": 1, "skipped": 0}, "second passage : autre vidéo, sans accord")
cur.execute("select transcript_status from talks where video_ref='audioPLAY02'"); ok(cur.fetchone()[0] == "unavailable", "sans accord : pas de transcription")
u = requests.post(B + "/auth/register", json={"email": f"z{uuid.uuid4().hex[:6]}@t.local", "password": "Passw0rd-test!", "name": "Z"}).json()
ok(requests.post(B + "/imports", headers={"authorization": "Bearer " + u["token"]}, json={"url": "https://www.youtube.com/playlist?list=PL1"}).status_code == 403, "import réservé aux organisateurs")
st = wait(next(x for x in requests.get(B + "/me/talks", headers=A).json() if x["video_ref"] == "subsPLAY001")["id"]) if False else None
print("TOUT OK")
