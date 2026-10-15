"""Étape E2 : avatar et bannière de chaîne : envoi, remplacement, retrait, droits, validations, affichage public. Prérequis : API (3055), PG (5544), stockage de test."""
import sys, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks = [], []
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from speakers where slug like %s", (f"%{tag}%",))
    for u in users: cur.execute("delete from users where id=%s", (u,))
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: cleanup(); sys.exit(1)
def mk(role, label):
    email = f"ci-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": label})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]; users.append(uid)
    return uid, {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}
a_id, A = mk("organizer", "orga"); b_id, Bh = mk("organizer", "orgb"); m_id, M = mk("moderator", "modo"); u_id, U = mk("user", "membre")
S = f"Cheikh Image {tag}"; SLUG = f"cheikh-image-{tag}"
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values ('Conf','d',%s,'youtube',%s,%s,'published','ready','free',600) returning id", (S, "v" + uuid.uuid4().hex[:9], a_id)); talks.append(cur.fetchone()[0])
requests.get(B + "/studio/channels", headers=A)
URL = f"{B}/studio/channels/{SLUG}/image"
r = requests.post(f"{URL}/avatar", json={"image": PNG}, headers=A)
ok(r.status_code == 201 and r.json()["url"].startswith("http"), "le propriétaire envoie l'avatar")
r = requests.post(f"{URL}/banner", json={"image": PNG}, headers=M); ok(r.status_code == 201, "le modérateur envoie la bannière")
ok(requests.post(f"{URL}/avatar", json={"image": PNG}, headers=Bh).status_code == 403, "un autre organisateur : refusé")
ok(requests.post(f"{URL}/avatar", json={"image": PNG}, headers=U).status_code == 403, "un membre : refusé")
ok(requests.post(f"{URL}/avatar", json={"image": "data:image/gif;base64,R0lGODlh"}, headers=A).status_code == 400, "format non accepté")
ok(requests.post(f"{URL}/avatar", json={"image": "data:image/png;base64,QUJDREVGRw=="}, headers=A).status_code == 400, "faux PNG refusé (signature)")
ok(requests.post(f"{URL}/logo", json={"image": PNG}, headers=A).status_code == 400, "type d'image inconnu refusé")
ok(requests.post(f"{B}/studio/channels/inconnue-{tag}/image/avatar", json={"image": PNG}, headers=M).status_code == 404, "chaîne inconnue : 404")
d = requests.get(f"{B}/channels/{SLUG}").json(); ok(d["avatarUrl"] and d["bannerUrl"], "page publique : avatar et bannière")
ok(requests.get(f"{B}/channels/{SLUG}").status_code == 200 and requests.get(d["avatarUrl"]).status_code == 200, "le lien de l'avatar est lisible")
lst = {c["slug"]: c for c in requests.get(f"{B}/channels").json()}; ok(lst[SLUG]["avatarUrl"], "liste publique : avatar")
ok(requests.get(f"{B}/seo/speakers/{SLUG}").json()["bannerUrl"], "données de la page (SEO) : bannière")
cur.execute("select avatar_key from speakers where slug=%s", (SLUG,)); old = cur.fetchone()[0]
requests.post(f"{URL}/avatar", json={"image": PNG}, headers=A); cur.execute("select avatar_key from speakers where slug=%s", (SLUG,)); ok(cur.fetchone()[0] != old, "remplacement : nouvelle clé")
ok(requests.delete(f"{URL}/banner", headers=Bh).status_code == 403, "retrait par un autre organisateur : refusé")
ok(requests.delete(f"{URL}/banner", headers=A).status_code == 204, "retrait de la bannière")
d = requests.get(f"{B}/channels/{SLUG}").json(); ok(d["bannerUrl"] is None and d["avatarUrl"], "bannière retirée, avatar conservé")
st = requests.get(B + "/studio/channels", headers=A).json()["channels"][0]; ok(st["avatarUrl"] and st["bannerUrl"] is None, "Studio : images renvoyées à l'organisateur")
al = requests.get(B + "/admin/audit?limit=60", headers={"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}).text
ok("bannière modifiée" in al, "actions inscrites au journal")
cleanup(); print("TOUT OK")
