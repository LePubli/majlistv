"""Shorts publics (20/10) : publication d'un extrait de l'éditeur (copie du rendu vertical), brouillon / publié, droits (créateur, éditeur de chaîne,
autre organisateur refusé), fil public (chaîne, pagination, conférence non publiée ou Kids exclue), jeton enfant refusé, vues comptées une fois par jour,
suppression (fichier compris). Prérequis : API (3055), PG (5544), S3 de test moto (5599, bucket majlis-videos)."""
import os, sys, time, uuid, requests, psycopg2, boto3

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="garage")
BUCKET = "majlis-videos"
tag = uuid.uuid4().hex[:6]; users, talks, keys = [], [], []
MP4 = os.path.join(__import__("tempfile").mkdtemp(prefix="shv-"), "short.mp4")  # vidéo verticale 9:16 de 3 s (image + son)
__import__("subprocess").run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=25:d=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                              "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", MP4], check=True)


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    cur.execute("delete from speakers where slug=%s", (f"cheikh-sh{tag}",))
    for k in keys:
        try: s3.delete_object(Bucket=BUCKET, Key=k)
        except Exception: pass


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def login(email):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test" if "admin" not in email else "AdminPassw0rd-test"}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)


def member(role=None, label="m"):
    email = f"sh-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    if role: cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]; users.append(uid)
    return login(email), uid


def talk(owner, title, speaker, pub="published", status="ready", access="free", bands="{}", adults=True):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands,show_adults)
                   values (%s,'d',%s,'upload',%s,%s,%s,%s,%s,300,%s,%s) returning id""", (title, speaker, f"talks/{tag}-{uuid.uuid4().hex[:4]}", owner, pub, status, access, bands, adults))
    t = str(cur.fetchone()[0]); talks.append(t); return t


def project(talk_id, title="Extrait", render=True):
    cur.execute("insert into editor_projects(talk_id, kind, title, timeline, short) values (%s,'short',%s,'{\"clips\":[]}','{}') returning id", (talk_id, title))
    p = str(cur.fetchone()[0])
    if render:
        key = f"editor/renders/{p}/{tag}-final.mp4"; s3.upload_file(MP4, BUCKET, key); keys.append(key)
        cur.execute("""insert into editor_renders(project_id, talk_id, kind, status, rev, timeline, plan, out_duration_s, output_key, bytes)
                       values (%s,%s,'final','ready',1,'{}','{"vertical":true}',12.5,%s,%s)""", (p, talk_id, key, os.path.getsize(MP4)))
    return p


ADM = login("admin@test.local")
ORG, oid = member("organizer", "orga"); ORG2, o2id = member("organizer", "orgb"); USR, _ = member(None, "membre"); ED, edid = member("organizer", "edit")
SPK = f"Cheikh Sh{tag}"; SLUG = f"cheikh-sh{tag}"
T1 = talk(oid, f"Patience {tag}", SPK); T2 = talk(oid, f"Gratitude {tag}", SPK, access="premium")
TDRAFT = talk(oid, f"Brouillon {tag}", SPK, pub="draft"); TKIDS = talk(oid, f"Kids {tag}", SPK, bands="{7-10}", adults=False)
P1 = project(T1, "Passage patience"); P2 = project(T2); P3 = project(TDRAFT); PK = project(TKIDS); PNO = project(T1, "Sans rendu", render=False)
cur.execute("select slug from speakers where slug=%s", (SLUG,)); 
for _ in range(10):
    requests.get(B + "/studio/channels", headers=ORG)
    cur.execute("select slug from speakers where slug=%s", (SLUG,))
    if cur.fetchone(): break
    time.sleep(1)

# --- Droits Studio
ok(requests.get(B + "/studio/shorts").status_code == 401, "Studio : visiteur refusé")
ok(requests.get(B + "/studio/shorts", headers=USR).status_code == 403, "Studio : simple membre refusé")
L = requests.get(B + "/studio/shorts", headers=ORG).json()
ok({c["projectId"] for c in L["candidates"]} >= {P1, P2, P3, PK} and PNO not in {c["projectId"] for c in L["candidates"]}, "extraits proposés : seulement ceux dont le rendu est prêt")
ok(L["shorts"] == [], "aucun short au départ")
ok(requests.get(B + "/studio/shorts", headers=ORG2).json()["candidates"] == [], "un autre organisateur ne voit pas mes extraits")
ok(requests.post(B + "/studio/shorts", headers=ORG2, json={"projectId": P1}).status_code == 404, "autre organisateur : publication refusée")
ok(requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": PNO}).status_code == 404, "extrait sans rendu : refusé")
ok(requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": "pas-un-id"}).status_code == 400, "identifiant invalide : 400")

# --- Création : brouillon puis publication
r = requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": P1, "title": f"La patience {tag}"}); ok(r.status_code == 201 and r.json()["status"] == "draft", "créé en brouillon par défaut")
S1 = r.json()["id"]
ok(requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": P1}).status_code == 409, "même extrait : pas deux fois")
cur.execute("select video_key, status, published_at from public_shorts where id=%s", (S1,)); vk, st, pa = cur.fetchone()
ok(vk == f"shorts/{S1}.mp4" and st == "draft" and pa is None, "fichier copié sous shorts/<id>.mp4, pas de date de publication")
keys.append(vk)
ok(s3.head_object(Bucket=BUCKET, Key=vk)["ContentLength"] == os.path.getsize(MP4), "copie identique au rendu")
cur.execute("select poster_key from public_shorts where id=%s", (S1,)); pk1 = cur.fetchone()[0]; keys.append(f"shorts/{S1}.jpg")
ok(pk1 == f"shorts/{S1}.jpg" and s3.get_object(Bucket=BUCKET, Key=pk1)["Body"].read()[:2] == b"\xff\xd8", "affiche JPEG tirée de la vidéo (registre 49)")
ok(requests.get(f"{B}/shorts/{S1}").status_code == 404, "brouillon : invisible du public")
ok(S1 not in [x["id"] for x in requests.get(B + "/shorts").json()], "brouillon : absent du fil")
r = requests.get(B + "/studio/shorts", headers=ORG).json(); ok(any(x["id"] == S1 and x["videoUrl"] for x in r["shorts"]) and [c for c in r["candidates"] if c["projectId"] == P1][0]["shortId"] == S1, "Studio : short listé avec aperçu, extrait marqué publié")
r = requests.put(f"{B}/studio/shorts/{S1}", headers=ORG, json={"status": "published"}); ok(r.status_code == 200 and r.json()["status"] == "published" and r.json()["publishedAt"], "publication")
S2 = requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": P2, "status": "published"}).json()["id"]; keys.append(f"shorts/{S2}.mp4")
S3 = requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": P3, "status": "published"}).json()["id"]; keys.append(f"shorts/{S3}.mp4")
SK = requests.post(B + "/studio/shorts", headers=ORG, json={"projectId": PK, "status": "published"}).json()["id"]; keys.append(f"shorts/{SK}.mp4")
ok(requests.put(f"{B}/studio/shorts/{S1}", headers=ORG2, json={"title": "Piraté"}).status_code == 404, "autre organisateur : titre refusé")
ok(requests.put(f"{B}/studio/shorts/{S1}", headers=ORG, json={"title": ""}).status_code == 400, "titre vide refusé")

# --- Fil public
feed = requests.get(B + "/shorts", params={"channel": SLUG}).json(); ids = [x["id"] for x in feed]
ok(S1 in ids and S2 in ids, "fil de la chaîne : shorts publiés, dont celui d'une conférence premium (aperçu public)")
ok(S3 not in ids, "conférence en brouillon : short masqué du public")
ok(SK not in ids, "conférence Kids (hors catalogue adulte) : short masqué")
x = [i for i in feed if i["id"] == S1][0]
ok(f"shorts/{S1}.jpg" in x["posterUrl"], "fiche publique : affiche du short, pas la miniature de la conférence")
ok(x["videoUrl"] and x["title"] == f"La patience {tag}" and x["talk"]["id"] == T1 and x["channel"]["slug"] == SLUG and x["views"] == 0 and x["duration"] == 12.5, "fiche publique complète")
ok([i["id"] for i in feed][:2] == [S2, S1], "plus récents d'abord")
ok(len(requests.get(B + "/shorts", params={"channel": SLUG, "limit": 1}).json()) == 1 and requests.get(B + "/shorts", params={"channel": SLUG, "limit": 1, "offset": 1}).json()[0]["id"] == S1, "pagination")
ok(requests.get(B + "/shorts", params={"channel": "inconnu-xyz"}).json() == [], "chaîne inconnue : liste vide")
ok(requests.get(B + "/shorts", params={"limit": 999}).status_code == 400, "limite excessive refusée")
ok(requests.get(f"{B}/shorts/{S1}").json()["id"] == S1, "fiche d'un short")
ok(requests.get(f"{B}/shorts/{S3}").status_code == 404 and requests.get(f"{B}/shorts/{SK}").status_code == 404, "fiche : brouillon et Kids introuvables")

# --- Espace Kids : seulement les shorts de conférences Kids de son âge
P, pid = member(None, "parent"); cur.execute("update users set role='admin' where id=%s", (pid,)); P = login(f"sh-parent-{tag}@test.local")
requests.put(B + "/me/kids/pin", headers=P, json={"code": "2468"})
k = requests.post(B + "/me/kids/profiles", headers=P, json={"name": "Yacine", "band": "7-10"}).json()["id"]
cur.execute("update kid_profiles set catalog_mode='all', daily_limit_min=NULL where id=%s", (k,))
K = {"authorization": "Bearer " + requests.post(f"{B}/me/kids/profiles/{k}/enter", headers=P).json()["token"]}
kf = requests.get(B + "/shorts", headers=K, params={"channel": SLUG}).json()
ok([x["id"] for x in kf] == [SK], "enfant : seulement le short de la conférence Kids de sa tranche")
ok(kf[0]["channel"] is None and kf[0]["videoUrl"], "enfant : pas de lien vers la chaîne, vidéo présente")
ok(requests.get(f"{B}/shorts/{SK}", headers=K).status_code == 200, "enfant : fiche d'un short Kids")
ok(requests.get(f"{B}/shorts/{S1}", headers=K).status_code == 404, "enfant : short d'une conférence adulte refusé")
ok(requests.post(f"{B}/shorts/{S1}/view", headers=K).status_code == 404, "enfant : vue d'un short adulte refusée")
ok(requests.post(f"{B}/shorts/{SK}/view", headers=K).json()["counted"] is True and requests.post(f"{B}/shorts/{SK}/view", headers=K).json()["counted"] is False, "enfant : vue comptée une fois par jour")
cur.execute("update kid_profiles set band='3-6' where id=%s", (k,))
ok(requests.get(B + "/shorts", headers=K, params={"channel": SLUG}).json() == [], "autre tranche d'âge : rien")
cur.execute("update kid_profiles set band='7-10', catalog_mode='selected' where id=%s", (k,))
ok(requests.get(B + "/shorts", headers=K, params={"channel": SLUG}).json() == [], "catalogue limité par le parent : conférence non autorisée, rien")
cur.execute("insert into kid_catalog(profile_id, talk_id, allowed) values (%s,%s,true)", (k, TKIDS))
ok(len(requests.get(B + "/shorts", headers=K, params={"channel": SLUG}).json()) == 1, "…autorisée par le parent : visible")
cur.execute("update kid_profiles set catalog_mode='all', daily_limit_min=5 where id=%s", (k,)); cur.execute("insert into kid_usage(profile_id, day, seconds, last_ping) values (%s, (now() at time zone 'Europe/Paris')::date, 9999, now()) on conflict (profile_id, day) do update set seconds=9999", (k,))
ok(requests.get(B + "/shorts", headers=K, params={"channel": SLUG}).json() == [], "temps du jour écoulé : rien")
cur.execute("update kid_profiles set daily_limit_min=NULL where id=%s", (k,))
cur.execute("update talks set access='premium' where id=%s", (TKIDS,))
cur.execute("update users set role='user', premium_until=NULL where id=%s", (pid,)); time.sleep(11)  # le rôle est mis en cache 10 s côté API
ok(requests.get(B + "/shorts", headers=K, params={"channel": SLUG}).json() == [], "parent sans abonnement : conférence premium masquée à l'enfant")
cur.execute("update users set role='admin' where id=%s", (pid,)); cur.execute("update talks set access='free' where id=%s", (TKIDS,))

# --- Vues : une par personne et par jour, comptées sur le short seulement
r = requests.post(f"{B}/shorts/{S1}/view"); ok(r.json()["counted"] is True, "première vue visiteur comptée")
ok(requests.post(f"{B}/shorts/{S1}/view").json()["counted"] is False, "même visiteur, même jour : pas recomptée")
ok(requests.post(f"{B}/shorts/{S1}/view", headers=USR).json()["counted"] is True, "un membre : compté à part")
ok(requests.post(f"{B}/shorts/{S1}/view", headers=USR).json()["counted"] is False, "le même membre : pas recompté")
cur.execute("update public_short_views set day = current_date - 1 where short_id=%s", (S1,))
ok(requests.post(f"{B}/shorts/{S1}/view", headers=USR).json()["counted"] is True, "le lendemain : recompté")
cur.execute("select views from public_shorts where id=%s", (S1,)); ok(cur.fetchone()[0] == 3, "compteur = 3")
cur.execute("select count(*) from talks where id=%s and false", (T1,))
ok(requests.post(f"{B}/shorts/{S3}/view").status_code == 404, "vue d'un short masqué refusée")
ok(requests.post(f"{B}/shorts/{uuid.uuid4()}/view").status_code == 404, "short inconnu : 404")

# --- Éditeur de chaîne : droits par chaîne
requests.put(f"{B}/studio/channels/{SLUG}", headers=ORG, json={"name": SPK})
cur.execute("update speakers set owner_id=%s where slug=%s", (oid, SLUG)); cur.execute("insert into channel_members(slug, user_id) values (%s,%s) on conflict do nothing", (SLUG, edid))
Le = requests.get(B + "/studio/shorts", headers=ED).json()
ok(S1 in [x["id"] for x in Le["shorts"]] and P1 in [c["projectId"] for c in Le["candidates"]], "éditeur de la chaîne : voit les shorts de la chaîne")
ok(requests.put(f"{B}/studio/shorts/{S1}", headers=ED, json={"title": f"Titre édité {tag}"}).status_code == 200, "éditeur de la chaîne : modifie le titre")
ok(requests.get(B + "/studio/shorts", headers=ADM).json()["shorts"] != [], "administrateur : voit tout")

# --- Remplacer la vidéo, repasser en brouillon
cur.execute("update editor_renders set out_duration_s=20, bytes=bytes+0 where project_id=%s", (P1,))
r = requests.post(f"{B}/studio/shorts/{S1}/refresh", headers=ORG); ok(r.status_code == 200 and r.json()["duration"] == 20, "vidéo remplacée par le dernier rendu")
ok(requests.post(f"{B}/studio/shorts/{S1}/refresh", headers=ORG2).status_code == 404, "remplacement refusé à un autre")
r = requests.put(f"{B}/studio/shorts/{S1}", headers=ORG, json={"status": "draft"}); ok(r.json()["status"] == "draft" and r.json()["publishedAt"] is None, "retour en brouillon")
ok(requests.get(f"{B}/shorts/{S1}").status_code == 404, "brouillon : de nouveau invisible")
requests.put(f"{B}/studio/shorts/{S1}", headers=ORG, json={"status": "published"})

# --- La conférence passe en brouillon : ses shorts disparaissent ; l'extrait de l'éditeur supprimé ne casse rien
cur.execute("update talks set publication='draft' where id=%s", (T2,))
ok(S2 not in [x["id"] for x in requests.get(B + "/shorts", params={"channel": SLUG}).json()], "conférence repassée en brouillon : short masqué")
cur.execute("update talks set publication='published' where id=%s", (T2,))
cur.execute("delete from editor_projects where id=%s", (P1,))
ok(requests.get(f"{B}/shorts/{S1}").json()["videoUrl"], "extrait de l'éditeur supprimé : le short reste en ligne")
ok(requests.post(f"{B}/studio/shorts/{S1}/refresh", headers=ORG).status_code == 409, "…mais plus de remplacement possible")

# --- Suppression
ok(requests.delete(f"{B}/studio/shorts/{S2}", headers=ORG2).status_code == 404, "suppression refusée à un autre")
ok(requests.delete(f"{B}/studio/shorts/{S2}", headers=ORG).json()["deleted"] is True, "supprimé")
try: s3.head_object(Bucket=BUCKET, Key=f"shorts/{S2}.mp4"); gone = False
except Exception: gone = True
ok(gone, "fichier effacé du stockage")
try: s3.head_object(Bucket=BUCKET, Key=f"shorts/{S2}.jpg"); pgone = False
except Exception: pgone = True
ok(pgone, "affiche effacée aussi")
# Suppression de la conférence par son créateur (route du site) : shorts ET fichiers effacés (registre n°48)
k1 = f"shorts/{S1}.mp4"; cur.execute("select output_key from editor_renders where talk_id=%s", (T3_ := TDRAFT,)); rk = [r[0] for r in cur.fetchall()]
ok(requests.delete(f"{B}/talks/{TDRAFT}", headers=ORG2).status_code == 404, "suppression de la conférence d'autrui refusée (fichiers gardés)")
ok(s3.head_object(Bucket=BUCKET, Key=f"shorts/{S3}.mp4")["ContentLength"] > 0, "…le fichier du short est toujours là")
ok(requests.delete(f"{B}/talks/{TDRAFT}", headers=ORG).status_code == 204, "conférence supprimée par son créateur"); talks.remove(TDRAFT)
def gone_key(k):
    try: s3.head_object(Bucket=BUCKET, Key=k); return False
    except Exception: return True
ok(gone_key(f"shorts/{S3}.mp4"), "fichier du short effacé du stockage")
ok(rk and all(gone_key(k) for k in rk), "fichiers des rendus de l'éditeur effacés aussi")
cur.execute("delete from talks where id=%s", (T1,)); talks.remove(T1)
cur.execute("select count(*) from public_shorts where id=%s", (S1,)); ok(cur.fetchone()[0] == 0, "conférence supprimée : ses shorts partent avec")

# --- Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_shorts": "false"}})
ok(requests.get(B + "/shorts").status_code in (403, 404), "fonction Shorts coupée : routes fermées")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_shorts": None}})
ok(requests.get(B + "/shorts").status_code == 200, "fonction rétablie")
cleanup(); print("TOUT OK")
