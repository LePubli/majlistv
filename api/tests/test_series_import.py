"""Import d'une série YouTube (étape B, 26/11) : analyse (adresse YouTube seule), liste simulée comme le ferait le transcripteur, saisons lues dans les titres
(plan proposé) ou départs de saison indiqués à la main, création de la série + saisons + épisodes en une fois (lus depuis YouTube), droits obligatoires + journal,
brouillon/publié, vidéos déjà au catalogue réutilisées ou ignorées, copie chez nous demandée pour certains épisodes seulement, droits d'accès.
Prérequis : API (3055), PG (5544), S3 de test moto (5599)."""
import sys, time, uuid, json, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, jobs, series = [], [], []


def cleanup():
    cur.execute("delete from talks where id in (select talk_id from series_episodes where series_id = any(%s::uuid[]))", (series,))
    cur.execute("delete from talks where video_ref like %s", (f"s{tag}%",))
    for s in series: cur.execute("delete from series where id=%s", (s,))
    for j in jobs: cur.execute("delete from import_jobs where id=%s", (j,))
    for u in users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def login(email):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)


def member(role, label):
    email = f"sr-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); users.append(cur.fetchone()[0])
    return login(email)


org, other = member("organizer", "org"), member("organizer", "other")
URL = "https://www.youtube.com/show/VLPLDoK5CcjJZA6JIO4oRpfJwz1-4DAOKisZ?sbp=Kgt4bXhPR0VFZEk3VUAB"
r = requests.post(B + "/studio/series/import", json={"url": "https://example.org/x"}, headers=org); ok(r.status_code == 400, "adresse d'un site non géré par la lecture de listes refusée")
r = requests.post(B + "/studio/series/import", json={"url": URL}, headers=org); ok(r.status_code == 202 and r.json()["status"] == "listing", "analyse de la page série lancée")
job = r.json(); jobs.append(job["id"])
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={"title": "X", "ids": [f"s{tag}0000"], "rights": True}, headers=org); ok(r.status_code == 409, "démarrage refusé tant que la liste n'est pas prête")
ok(requests.get(B + f"/studio/series/import/{job['id']}", headers=other).status_code == 404, "l'analyse d'un autre organisateur est introuvable")

titles = ["Saison 1 – Épisode 1 : Le début", "Saison 1 – Épisode 2", "Saison 1 – Épisode 3", "Saison 2 – Épisode 1", "S02E02 La suite", "Saison 3 – Épisode 1"]
ent = [{"id": f"s{tag}{i:04d}", "source": "youtube", "title": t, "duration": 7200 + i, "thumb": ""} for i, t in enumerate(titles)]
ids = [e["id"] for e in ent]
cur.execute("update import_jobs set status='listed', title='Série test', entries=%s where id=%s", (json.dumps(ent), job["id"]))
v = requests.get(B + f"/studio/series/import/{job['id']}", headers=org).json()
ok(v["count"] == 6 and v["plan"]["hasSeasons"] and [s["from"] for s in v["plan"]["seasons"]] == [1, 4, 6], "plan : 3 saisons détectées dans les titres (départs 1, 4, 6)")
ok(v["entries"][4]["season"] == 2 and v["entries"][4]["episode"] == 2, "S02E02 lu : saison 2, épisode 2")

base = {"title": "Ma série importée", "description": "d", "speaker": "Cheikh Test", "access": "premium", "ids": ids, "seasons": [{"title": "", "from": 1}, {"title": "Deux", "from": 4}, {"title": "", "from": 6}], "rights": True}
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={k: v for k, v in base.items() if k != "rights"}, headers=org); ok(r.status_code == 400, "sans case des droits : refusé")
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "seasons": [{"title": "", "from": 2}]}, headers=org); ok(r.status_code == 400, "première saison ailleurs qu'à l'épisode 1 : refusé")
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "seasons": [{"title": "", "from": 1}, {"title": "", "from": 1}]}, headers=org); ok(r.status_code == 400, "deux saisons au même départ : refusé")
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "ids": ids + [ids[0]]}, headers=org); ok(r.status_code == 400, "même vidéo deux fois : refusé")
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "ids": ids + ["zzzzzzzzzzz"]}, headers=org); ok(r.status_code == 400, "vidéo absente de la liste : refusé")
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "categoryId": 99999999}, headers=org); ok(r.status_code == 400, "catégorie inconnue refusée")
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "copyIds": ["zzzzzzzzzzz"]}, headers=org); ok(r.status_code == 400, "épisode à copier hors série : refusé")
cur.execute("select count(*) from series where title='Ma série importée'"); ok(cur.fetchone()[0] == 0, "aucune série créée par les refus")
other_h = {"authorization": other["authorization"]}
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json=base, headers=other_h); ok(r.status_code == 409, "autre organisateur : analyse introuvable pour lui")

# Un épisode déjà au catalogue chez un AUTRE organisateur est ignoré
cur.execute("select id from users where email=%s", (f"sr-other-{tag}@test.local",)); oth = cur.fetchone()[0]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,video_status) values ('Déjà là','d','x','youtube',%s,%s,'ready')", (ids[5], oth))
cur.execute("update import_jobs set status='listed' where id=%s", (job["id"],))
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "seasons": [{"title": "", "from": 1}, {"title": "Deux", "from": 4}], "copyIds": [ids[0], ids[1]], "published": False}, headers=org)
ok(r.status_code == 201, "série importée (201) : " + r.text[:200])
res = r.json(); series.append(res["seriesId"])
ok(res["episodes"] == 5 and res["created"] == 5 and len(res["skipped"]) == 1 and res["seasons"] == 2, "5 épisodes créés, 1 ignoré (déjà au catalogue chez un autre), 2 saisons")
ok(res["copyQueued"] == 2 and not res["copyErrors"], "copie chez nous demandée pour 2 épisodes seulement")

cur.execute("select title, has_seasons, access, published, import_url, imported_by_name, rights_at is not null, rights_text <> '' from series where id=%s", (res["seriesId"],)); row = cur.fetchone()
ok(row[0] == "Ma série importée" and row[1] and row[2] == "premium" and not row[3] and row[4] == URL and row[6] and row[7], "série : saisons, accès, brouillon, adresse et droits conservés")
cur.execute("select count(*), count(distinct season_id) from series_episodes where series_id=%s", (res["seriesId"],)); ok(cur.fetchone() == (5, 2), "5 épisodes répartis dans 2 saisons")
cur.execute("""select s.position, count(*) from series_episodes e join seasons s on s.id=e.season_id where e.series_id=%s group by 1 order by 1""", (res["seriesId"],)); ok(cur.fetchall() == [(1, 3), (2, 2)], "saison 1 = 3 épisodes, saison 2 = 2 épisodes")
cur.execute("select t.title, t.source, t.access, t.publication, t.transcript_status, e.position from talks t join series_episodes e on e.talk_id=t.id where e.series_id=%s order by e.position", (res["seriesId"],)); rows = cur.fetchall()
ok(rows[0][0].startswith("Saison 1") and rows[4][5] == 5, "épisodes dans l'ordre de la liste")
ok(all(r[1] == "youtube" and r[2] == "premium" and r[3] == "draft" and r[4] == "unavailable" for r in rows), "lus depuis YouTube, accès hérité de la série, brouillons, sans transcription")
cur.execute("select count(*) from media_imports m join talks t on t.id=m.talk_id where t.video_ref = any(%s) and m.status='pending' and m.rights_text <> ''", ([ids[0], ids[1]],)); ok(cur.fetchone()[0] == 2, "2 demandes de copie en attente, avec journal des droits")
cur.execute("select count(*) from media_imports m join talks t on t.id=m.talk_id where t.video_ref = any(%s)", ([ids[2], ids[3], ids[4]],)); ok(cur.fetchone()[0] == 0, "les autres épisodes ne sont pas copiés")
r = requests.get(B + f"/series/{res['seriesId']}"); ok(r.status_code in (404, 403), "série en brouillon : invisible du public")
r = requests.get(B + f"/series/{res['seriesId']}/manage", headers=org); ok(r.status_code == 200, "série visible dans la gestion Studio")

# Deuxième import de la même liste : les épisodes déjà en série sont ignorés, rien n'est créé
cur.execute("update import_jobs set status='listed' where id=%s", (job["id"],))
r = requests.post(B + f"/studio/series/import/{job['id']}/start", json={**base, "title": "Doublon", "seasons": []}, headers=org); ok(r.status_code == 409 and r.json()["code"] == "nothing", "re-import : tout est déjà en série, rien de créé")
cur.execute("select count(*) from series where title='Doublon'"); ok(cur.fetchone()[0] == 0, "pas de série vide laissée")

# Sans saisons, publié tout de suite, vidéo déjà au catalogue chez moi réutilisée
cur.execute("select id from users where email=%s", (f"sr-org-{tag}@test.local",)); me = cur.fetchone()[0]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,video_status) values ('Déjà à moi','d','x','youtube',%s,%s,'ready')", (f"s{tag}re01", me))
ent2 = [{"id": f"s{tag}re01", "source": "youtube", "title": "Intro", "duration": 60, "thumb": ""}, {"id": f"s{tag}re02", "source": "youtube", "title": "Suite", "duration": 61, "thumb": ""}]
r = requests.post(B + "/studio/series/import", json={"url": "https://www.youtube.com/playlist?list=PLabc"}, headers=org); j2 = r.json(); jobs.append(j2["id"])
cur.execute("update import_jobs set status='listed', title='Liste 2', entries=%s where id=%s", (json.dumps(ent2), j2["id"]))
v2 = requests.get(B + f"/studio/series/import/{j2['id']}", headers=org).json(); ok(not v2["plan"]["hasSeasons"] and v2["entries"][0]["already"], "sans « Saison N » dans les titres : aucun découpage proposé ; vidéo déjà au catalogue signalée")
r = requests.post(B + f"/studio/series/import/{j2['id']}/start", json={"title": "Sans saisons", "ids": [e["id"] for e in ent2], "published": True, "transcribe": True, "rights": True}, headers=org)
ok(r.status_code == 201 and r.json()["reused"] == 1 and r.json()["created"] == 1 and r.json()["seasons"] == 0, "série sans saisons : 1 vidéo réutilisée, 1 créée")
series.append(r.json()["seriesId"])
cur.execute("select has_seasons, published from series where id=%s", (r.json()["seriesId"],)); ok(cur.fetchone() == (False, True), "série publiée, sans saisons")
cur.execute("select t.publication, t.transcript_status from talks t where t.video_ref=%s", (ent2[1]["id"],)); ok(cur.fetchone() == ("published", "pending"), "nouvel épisode publié, transcription demandée")

# --- Étape C : autres plateformes et liste d'adresses ---
for u in ("https://vimeo.com/showcase/123456", "https://www.dailymotion.com/playlist/x7abcd", "https://archive.org/details/ma-collection"):
    r = requests.post(B + "/studio/series/import", json={"url": u}, headers=org); ok(r.status_code == 202, "adresse acceptée : " + u.split("/")[2]); jobs.append(r.json()["id"])
r = requests.post(B + "/studio/series/import", json={"url": "https://example.org/liste"}, headers=org); ok(r.status_code == 400, "autre site : orienté vers « Liste d'adresses »")
r = requests.post(B + "/studio/series/import-urls", json={"urls": ["not a url", "ftp://x.org/a.mp4", "http://127.0.0.1/a.mp4"]}, headers=org); ok(r.status_code == 400 and len(r.json()["rejected"]) == 3, "adresses invalides / privées refusées")
vid = f"{int(tag, 16) % 900000000 + 100000000}"
lines = [f"https://example.org/cours/{tag}-un.mp4 | Cours un", f"https://example.org/cours/{tag}-deux.mp4", f"https://vimeo.com/{vid} | Vidéo Vimeo", f"https://vimeo.com/{vid}", "pas une adresse"]
r = requests.post(B + "/studio/series/import-urls", json={"urls": lines}, headers=org); ok(r.status_code == 201, "liste d'adresses créée : " + r.text[:160])
lj = r.json(); jobs.append(lj["id"])
ok(lj["status"] == "listed" and lj["count"] == 3 and len(lj["rejected"]) == 2, "3 vidéos retenues, 2 lignes refusées (doublon, texte)")
src = {e["source"] for e in lj["entries"]}; ok(src == {"web", "vimeo"}, "sources reconnues : autre site + Vimeo")
web = [e for e in lj["entries"] if e["source"] == "web"]; ok(web[0]["title"] == "Cours un" and web[1]["title"].lower().startswith(tag), "titre donné après |, sinon tiré du nom du fichier")
vm = [e for e in lj["entries"] if e["source"] == "vimeo"][0]
eids = [e["id"] for e in lj["entries"]]
r = requests.post(B + f"/studio/series/import/{lj['id']}/start", json={"title": "Série mixte", "ids": eids, "rights": True}, headers=org); ok(r.status_code == 201, "série mixte importée : " + r.text[:200])
res = r.json(); series.append(res["seriesId"])
ok(res["episodes"] == 3 and res["copyQueued"] == 2 and not res["copyErrors"], "les 2 vidéos d'un autre site sont copiées d'office, Vimeo reste lue depuis Vimeo")
cur.execute("select t.source, t.video_status, t.title from talks t join series_episodes e on e.talk_id=t.id where e.series_id=%s order by e.position", (res["seriesId"],)); rows = cur.fetchall()
ok([r[0] for r in rows] == ["upload", "upload", "vimeo"] or sorted(r[0] for r in rows) == ["upload", "upload", "vimeo"], "épisodes : 2 hébergés chez nous, 1 Vimeo")
ok(all(r[1] == "importing" for r in rows if r[0] == "upload") and all(r[1] == "ready" for r in rows if r[0] == "vimeo"), "copies « en cours », Vimeo prêt")
cur.execute("select count(*) from media_imports where source_url like %s and origin='web' and new_talk and rights_text <> ''", (f"https://example.org/cours/{tag}%",)); ok(cur.fetchone()[0] == 2, "2 demandes de copie (autre site) avec journal des droits")
cur.execute("update import_jobs set status='listed' where id=%s", (lj["id"],))
r = requests.post(B + f"/studio/series/import/{lj['id']}/start", json={"title": "Encore", "ids": [e["id"] for e in web], "rights": True}, headers=org); ok(r.status_code == 409, "même adresses : déjà importées, rien de créé")
cur.execute("delete from talks where video_ref like %s or (source='upload' and title in ('Cours un'))", (f"s{tag}%",))
cleanup(); print("TOUT OK")
