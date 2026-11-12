"""Import — piste audio française de la plateforme d'origine (migration 113).

  - à l'import, la piste française est demandée d'origine (audio_lang = 'fr') ; « voix d'origine » reste possible ;
  - « Récupérer la voix française » d'une vidéo déjà importée (reimport) : conditions, refus, journal ;
  - une vidéo qui porte la piste française (audio_track = 'fr') sort du doublage maison (liste du Studio, demandes des abonnés).
Nécessite l'API sur :3055, Postgres sur :5544 et un stockage configuré (S3 simulé sur :5599). Lancer : python3 api/tests/test_import_audio.py
"""
import sys, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
def login(e, p): return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test"); tag = uuid.uuid4().hex[:6]
def user(label, role):
    em = f"aud{label}-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    cur.execute("update users set role=%s where email=%s returning id", (role, em)); return login(em, "Passw0rd-test"), str(cur.fetchone()[0])
O1, o1 = user("o1", "organizer"); O2, _ = user("o2", "organizer")
requests.put(B + "/admin/settings", headers=A, json={"values": {"feat_media_import": "true"}})
if requests.post(f"{B}/talks/{uuid.uuid4()}/import", headers=O1, json={"rightsConfirmed": True}).status_code == 503:
    print("IGNORÉ  stockage non configuré sur cette API"); sys.exit(0)
def create(url, **extra):
    return requests.post(B + "/talks", headers=O1, json={"title": "Audio " + uuid.uuid4().hex[:5], "language": "en", "access": "free", "videoUrl": url,
                                                        "rightsConfirmed": True, "importVideo": True, "translateTo": [], **extra})
def last(tid): cur.execute("select status, origin, audio_lang, audio_used, reimport, source_url from media_imports where talk_id=%s order by created_at desc limit 1", (tid,)); return cur.fetchone()
def yt(): return "".join(__import__("random").choice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(11))

# 1) création avec import : piste française demandée d'origine
r = create(f"https://www.youtube.com/watch?v={yt()}"); ok(r.status_code == 201, f"vidéo YouTube + import ({r.text[:80]})"); t1 = r.json()["id"]
ok(last(t1)[:3] == ("pending", "youtube", "fr"), f"piste française demandée d'origine ({last(t1)})")
r = create(f"https://www.youtube.com/watch?v={yt()}", importAudio="original"); t2 = r.json()["id"]; ok(last(t2)[2] is None, "« voix d'origine » : aucune langue demandée")
ok(create(f"https://www.youtube.com/watch?v={yt()}", importAudio="de").status_code == 400, "langue non proposée refusée")
r = create(f"https://videos.example.org/pages/aud-{tag}"); t3 = r.json()["id"]; ok(last(t3)[1:3] == ("web", "fr"), "autre site : la demande est gardée (yt-dlp choisira)")
r = create(f"https://archive.org/details/aud-{tag}"); ok(r.status_code in (201, 400), "archive.org accepté ou introuvable")
if r.status_code == 201: ok(last(r.json()["id"])[2] is None, "archive.org : fichier servi tel quel, pas de choix de piste")

# 2) vidéo du catalogue (lue depuis YouTube) copiée chez nous : choix transmis
vid = yt()
cur.execute("""insert into talks(title, speaker, language, access, source, video_ref, video_status, organizer_id) values (%s,'S','en','free','youtube',%s,'ready',%s) returning id""",
            (f"Cat {tag}", vid, o1)); t4 = str(cur.fetchone()[0])
ok(requests.post(f"{B}/talks/{t4}/import", headers=O1, json={"rightsConfirmed": True, "audioLang": "original"}).status_code == 202 and last(t4)[2] is None, "copie avec la voix d'origine")
cur.execute("update media_imports set status='canceled' where talk_id=%s", (t4,))
ok(requests.post(f"{B}/talks/{t4}/import", headers=O1, json={"rightsConfirmed": True}).status_code == 202 and last(t4)[2] == "fr" and last(t4)[4] is False, "copie : piste française d'origine, ce n'est pas un remplacement")
g = requests.get(f"{B}/talks/{t4}/import", headers=O1).json()
ok(g["import"]["audioLang"] == "fr" and g["import"]["audioUsed"] is None and g["import"]["reimport"] is False and g["canFetchAudio"] is False, "état : langue demandée visible ; rien à récupérer tant que la vidéo n'est pas hébergée")
cur.execute("update media_imports set status='canceled' where talk_id=%s", (t4,))

# 3) « Récupérer la voix française » : vidéo déjà importée (hébergée, prête, venue de YouTube)
def hosted(origin="youtube", url=None, track=None, status="ready", prefix=None):
    cur.execute("""insert into talks(title, speaker, language, access, source, video_ref, video_status, organizer_id, imported_from, imported_origin, audio_track, media_prefix, rights_confirmed)
                   values (%s,'S','en','free','upload',%s,%s,%s,%s,%s,%s,%s,true) returning id""",
                (f"Hébergée {tag}", f"talks/{uuid.uuid4()}", status, o1, url or f"https://www.youtube.com/watch?v={yt()}", origin, track, prefix)); return str(cur.fetchone()[0])
h1 = hosted()
ok(requests.get(f"{B}/talks/{h1}/import", headers=O1).json()["canFetchAudio"] is True, "vidéo importée de YouTube : voix française récupérable")
ok(requests.post(f"{B}/talks/{h1}/import", headers=O1, json={"audioLang": "fr"}).status_code == 400, "déclaration des droits obligatoire")
ok(requests.post(f"{B}/talks/{h1}/import", headers=O2, json={"rightsConfirmed": True}).status_code == 404, "un autre organisateur : introuvable")
ok(requests.post(f"{B}/talks/{h1}/import", headers=O1, json={"rightsConfirmed": True, "audioLang": "original"}).status_code == 400, "voix d'origine sur une vidéo déjà hébergée : rien à faire")
cur.execute("select video_ref, video_status, transcript_status from talks where id=%s", (h1,)); before = cur.fetchone()
r = requests.post(f"{B}/talks/{h1}/import", headers=O1, json={"rightsConfirmed": True}); ok(r.status_code == 202 and r.json()["reimport"] is True, f"demande acceptée ({r.text[:80]})")
m = last(h1); ok(m[0] == "pending" and m[2] == "fr" and m[4] is True and "youtube.com/watch" in m[5], f"demande de remplacement ouverte ({m})")
cur.execute("select video_ref, video_status, transcript_status from talks where id=%s", (h1,)); ok(cur.fetchone() == before, "la vidéo en place n'est pas touchée par la demande")
g = requests.get(f"{B}/talks/{h1}/import", headers=O1).json(); ok(g["import"]["reimport"] is True and g["import"]["active"] and g["canFetchAudio"] is False, "pendant la demande : bouton masqué")
ok(requests.post(f"{B}/talks/{h1}/import", headers=O1, json={"rightsConfirmed": True}).status_code == 409, "une seule demande à la fois")
ok(requests.post(f"{B}/talks/{h1}/import/cancel", headers=O1).json().get("canceled") is True, "annulation")
cur.execute("select video_ref, video_status from talks where id=%s", (h1,)); ok(cur.fetchone() == before[:2], "annulation : la vidéo en place reste prête (pas « en échec »)")

# 4) refus
ok(requests.get(f"{B}/talks/{hosted(track='fr')}/import", headers=O1).json()["canFetchAudio"] is False, "déjà en français : rien à récupérer")
ok(requests.get(f"{B}/talks/{hosted(origin='archive', url='https://archive.org/details/x')}/import", headers=O1).json()["canFetchAudio"] is False, "archive.org : une seule piste")
ok(requests.get(f"{B}/talks/{hosted(status='processing')}/import", headers=O1).json()["canFetchAudio"] is False, "vidéo en cours de conversion : pas maintenant")
h5 = hosted(prefix=f"hls/x/r/{uuid.uuid4()}/")
r = requests.post(f"{B}/talks/{h5}/import", headers=O1, json={"rightsConfirmed": True}); ok(r.status_code == 409 and r.json()["code"] == "edited", "vidéo remplacée par un montage : refus expliqué")
cur.execute("insert into talks(title, speaker, language, access, source, video_ref, video_status, organizer_id) values (%s,'S','en','free','upload',%s,'ready',%s) returning id", (f"Envoyée {tag}", f"talks/{uuid.uuid4()}", o1)); up = str(cur.fetchone()[0])
ok(requests.post(f"{B}/talks/{up}/import", headers=O1, json={"rightsConfirmed": True}).status_code == 400, "vidéo envoyée par fichier : rien à importer")

# 5) doublage maison : une vidéo qui porte la piste française en sort
h6 = hosted(track="fr")
d = requests.get(f"{B}/talks/{h6}/dub")
if d.status_code == 404 and "introuvable" not in d.text.lower():
    print("IGNORÉ  module « doublage » coupé")
else:
    cur.execute("update talks set publication='published' where id in (%s,%s)", (h6, h1))
    d = requests.get(f"{B}/talks/{h6}/dub").json(); ok(d.get("native") is True and d["available"] is False and d["canRequest"] is False, f"spectateur : déjà en français, rien à demander ({d})")
    ok(requests.post(f"{B}/talks/{h6}/dub/request", headers=A).status_code == 409, "demande de version française refusée (elle l'est déjà)")
    d1 = requests.get(f"{B}/talks/{h1}/dub").json(); ok(d1.get("native") is None and d1["available"] is False, "vidéo en voix d'origine : comportement inchangé")
    lst = requests.get(f"{B}/studio/dubbing/talks", headers=A)
    if lst.status_code == 200:
        ids = [x["id"] for x in lst.json()["talks"]]; ok(h1 in ids and h6 not in ids, "Studio → Doublage : la vidéo déjà en français n'est plus proposée")
cur.execute("delete from talks where organizer_id=%s", (o1,))
print("TOUT EST OK")
