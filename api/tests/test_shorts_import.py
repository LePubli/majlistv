"""Shorts autonomes importés depuis YouTube (étape A, 26/11) : analyse d'une page /shorts (adresse YouTube seule), liste simulée comme le ferait le transcripteur,
import en deux modes (copie chez nous / lecture depuis YouTube), case des droits obligatoire (+ journal), doublons ignorés, visibilité publique
(copie non terminée = invisible ; Kids = tranches d'âge), reprise d'une copie échouée, droits (autre organisateur refusé), suppression.
Prérequis : API (3055), PG (5544), S3 de test moto (5599)."""
import sys, time, uuid, json, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, jobs, cats = [], [], []


def cleanup():
    cur.execute("delete from public_shorts where video_ref like %s", (f"t{tag}%",))
    for j in jobs: cur.execute("delete from import_jobs where id=%s", (j,))
    for c in cats: cur.execute("delete from categories where id=%s", (c,))
    for u in users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def feed(**h):
    r = requests.get(B + "/shorts?limit=30", **h); r.raise_for_status(); return r.json()


def login(email, pw):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)


def member(role, label):
    email = f"si-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); users.append(cur.fetchone()[0])
    return login(email, "Passw0rd-test")


org, other = member("organizer", "org"), member("organizer", "other")
cur.execute("select id from categories where is_active order by id limit 2"); cids = [r[0] for r in cur.fetchall()]
ok(len(cids) >= 1, "au moins une catégorie active")

# 1. adresse refusée (pas YouTube) / acceptée
r = requests.post(B + "/studio/shorts/import", json={"url": "https://example.com/shorts"}, headers=org); ok(r.status_code == 400, "adresse hors YouTube refusée")
r = requests.post(B + "/studio/shorts/import", json={"url": "https://www.youtube.com/@LUMI%C3%88REDELACr%C3%A9ation/shorts"}, headers=org); ok(r.status_code == 202, "analyse lancée (202)")
job = r.json(); jobs.append(job["id"]); ok(job["status"] == "listing", "état « listing » au départ")
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json={"ids": [f"t{tag}aaaa"], "mode": "copy", "rights": True}, headers=org); ok(r.status_code == 409, "démarrage refusé tant que la liste n'est pas prête")
r = requests.get(B + f"/studio/shorts/import/{job['id']}", headers=other); ok(r.status_code == 404, "l'analyse d'un autre organisateur est introuvable")

# 2. le transcripteur remplit la liste
ent = [{"id": f"t{tag}a{i}", "source": "youtube", "title": f"Short {i} #shorts", "duration": 30 + i, "thumb": f"https://i.ytimg.com/vi/t{tag}a{i}/hqdefault.jpg"} for i in range(4)]
cur.execute("update import_jobs set status='listed', title='Lumière de la Création - Shorts', entries=%s where id=%s", (json.dumps(ent), job["id"]))
r = requests.get(B + f"/studio/shorts/import/{job['id']}", headers=org).json(); ok(r["status"] == "listed" and r["count"] == 4 and not any(e["already"] for e in r["entries"]), "liste lue : 4 shorts, aucun déjà importé")

# 3. droits obligatoires
body = {"ids": [ent[0]["id"], ent[1]["id"]], "mode": "copy", "categoryId": cids[0], "catalogue": "adult", "status": "published"}
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json={**body, "rights": False}, headers=org); ok(r.status_code == 400, "sans case des droits : refusé")
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json={k: v for k, v in body.items()}, headers=org); ok(r.status_code == 400, "case des droits absente : refusé")
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json={**body, "rights": True, "categoryId": 99999999}, headers=org); ok(r.status_code == 400, "catégorie inconnue refusée")

# 4. import en copie
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json={**body, "rights": True}, headers=org); ok(r.status_code == 201 and r.json()["created"] == 2, "2 shorts importés en mode copie")
cur.execute("select play, video_key, copy_status, status, talk_id, rights_confirmed_at is not null, rights_text <> '', title, author, category_id from public_shorts where video_ref=%s", (ent[0]["id"],)); row = cur.fetchone()
ok(row[0] == "file" and row[1].startswith("shorts/") and row[2] == "pending" and row[4] is None, "ligne : copie en attente, sans conférence")
ok(row[5] and row[6], "journal des droits conservé (date + texte)")
ok(row[7] == "Short 0" and row[8] == "Lumière de la Création" and row[9] == cids[0], "titre nettoyé (#shorts retiré), auteur déduit de la chaîne, catégorie posée")
ids = [s["id"] for s in feed()]
cur.execute("select id from public_shorts where video_ref=%s", (ent[0]["id"],)); sid0 = str(cur.fetchone()[0])
ok(sid0 not in ids, "copie non terminée : invisible sur le fil public")
cur.execute("update public_shorts set copy_status='done', video_key=video_key where id=%s", (sid0,))

# 5. doublon + mode YouTube (la liste, « importée » après un lancement, est remise à « listed » comme si on la relisait)
cur.execute("update import_jobs set status='listed' where id=%s", (job["id"],))
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json={**body, "rights": True}, headers=org); ok(r.status_code == 201 and r.json()["created"] == 0 and len(r.json()["skipped"]) == 2, "re-import : doublons ignorés")
yb = {"ids": [ent[2]["id"]], "mode": "youtube", "rights": True, "categoryId": cids[0], "categoryIds": cids[1:2], "catalogue": "adult", "status": "published"}
cur.execute("update import_jobs set status='listed' where id=%s", (job["id"],))
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json=yb, headers=org); ok(r.status_code == 201 and r.json()["created"] == 1, "1 short importé en mode YouTube")
cur.execute("select id, play, video_key, copy_status, thumb_url from public_shorts where video_ref=%s", (ent[2]["id"],)); y = cur.fetchone()
ok(y[1] == "youtube" and y[2] is None and y[3] is None, "mode YouTube : rien à copier")
pub = {s["id"]: s for s in feed()}
ok(str(y[0]) in pub and pub[str(y[0])].get("play") == "youtube" and pub[str(y[0])].get("youtubeId") == ent[2]["id"], "short YouTube visible, lu depuis YouTube")
ok(sid0 in pub and pub[sid0].get("talk") is None, "short copié visible sans conférence liée")

# 6. Kids : tranche d'âge
kb = {"ids": [ent[3]["id"]], "mode": "youtube", "rights": True, "catalogue": "kids", "kidsBands": ["6-8"], "status": "published"}
cur.execute("update import_jobs set status='listed' where id=%s", (job["id"],))
r = requests.post(B + f"/studio/shorts/import/{job['id']}/start", json=kb, headers=org); ok(r.status_code == 201, "short Kids importé")
cur.execute("select id from public_shorts where video_ref=%s", (ent[3]["id"],)); kid = str(cur.fetchone()[0])
ok(kid not in {s["id"] for s in feed()}, "short Kids absent du fil adultes")

# 7. droits d'accès, retry, vue studio, suppression
st = requests.get(B + "/studio/shorts", headers=org).json()["shorts"]; mine = {s["id"]: s for s in st}
ok(sid0 in mine and mine[sid0]["standalone"] and mine[sid0]["play"] == "file" and mine[sid0]["importedBy"], "Studio : short autonome listé avec son mode et l'importateur")
ok(not any(s["id"] == sid0 for s in requests.get(B + "/studio/shorts", headers=other).json()["shorts"]), "un autre organisateur ne voit pas ces shorts")
r = requests.post(B + f"/studio/shorts/{sid0}/copy-retry", headers=org); ok(r.status_code == 409, "reprise refusée si la copie n'a pas échoué")
cur.execute("update public_shorts set copy_status='failed', copy_error='boom', copy_attempts=3 where id=%s", (sid0,))
r = requests.post(B + f"/studio/shorts/{sid0}/copy-retry", headers=other); ok(r.status_code == 404, "reprise refusée à un autre organisateur")
r = requests.post(B + f"/studio/shorts/{sid0}/copy-retry", headers=org); ok(r.status_code == 200 and r.json()["copy"]["status"] == "pending", "copie échouée relancée")
r = requests.put(B + f"/studio/shorts/{sid0}", json={"categoryId": cids[0], "categoryIds": cids[1:2], "catalogue": "kids", "kidsBands": ["3-5"], "author": "Autre"}, headers=org); ok(r.status_code == 200, "classement modifié")
cur.execute("select catalogue, kids_bands, author from public_shorts where id=%s", (sid0,)); ok(cur.fetchone() == ("kids", ["3-5"], "Autre"), "classement enregistré")
r = requests.delete(B + f"/studio/shorts/{sid0}", headers=other); ok(r.status_code in (403, 404), "suppression refusée à un autre organisateur")
r = requests.delete(B + f"/studio/shorts/{sid0}", headers=org); ok(r.status_code in (200, 204), "suppression par l'auteur")
cleanup(); print("TOUT OK")
