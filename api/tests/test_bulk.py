"""27.1 : modification en lot. Prérequis : API (3055), PG (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(e, p="AdminPassw0rd-test"):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}


A = login("admin@test.local")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ids = []
for i in range(3):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,access,publication,video_status,kids_bands) values(%s,'Ancien','youtube','abc1234567%s',%s,'free','published','ready','{3-6}') returning id", (f"Lot {i}", i, aid))
    ids.append(cur.fetchone()[0])
other = ids[0]
cur.execute("select id from categories limit 1"); cat = cur.fetchone()[0]
post = lambda h, **kw: requests.post(B + "/talks/bulk", headers=h, json=kw)

ok(post(A, ids=ids, changes={}).status_code == 400, "aucune modification : refusé")
ok(post(A, ids=ids, changes={"inconnu": 1}).status_code == 400, "champ inconnu refusé")
r = post(A, ids=ids, changes={"access": "premium", "speaker": "Nouveau", "level": "beginner", "categoryId": cat})
ok(r.status_code == 200 and r.json()["updated"] == 3, "modification de 3 conférences")
cur.execute("select access, speaker, level, category_id from talks where id = any(%s::uuid[])", ([str(i) for i in ids],))
ok(all(x == ("premium", "Nouveau", "beginner", cat) for x in cur.fetchall()), "champs appliqués à toutes")
r = post(A, ids=ids, bandsMode="add", changes={"kidsBands": ["7-10"]})
cur.execute("select kids_bands from talks where id = %s", (ids[0],))
ok(sorted(cur.fetchone()[0]) == ["3-6", "7-10"], "Kids : ajout d'une tranche")
post(A, ids=ids, bandsMode="remove", changes={"kidsBands": ["3-6"]})
cur.execute("select kids_bands from talks where id = %s", (ids[0],))
ok(cur.fetchone()[0] == ["7-10"], "Kids : retrait d'une tranche")
post(A, ids=ids, changes={"kidsBands": [], "showAdults": True})
cur.execute("select kids_bands, show_adults from talks where id = %s", (ids[0],))
ok(cur.fetchone() == ([], True), "Kids : remplacement par vide")
post(A, ids=ids, changes={"publication": "draft"})
cur.execute("select publication from talks where id = %s", (ids[1],))
ok(cur.fetchone()[0] == "draft", "passage en brouillon")
ok(post(A, ids=ids + [str(uuid.uuid4())], changes={"access": "free"}).status_code == 404, "identifiant inconnu : tout refusé")
cur.execute("select access from talks where id = %s", (ids[0],))
ok(cur.fetchone()[0] == "premium", "rien n'a été modifié lors du refus")
ok(post(A, ids=ids, changes={"categoryId": 999999}).status_code == 400, "catégorie inconnue : 400")
cur.execute("select category_id from talks where id = %s", (ids[0],))
ok(cur.fetchone()[0] == cat, "retour arrière complet (transaction)")
# organisateur : seulement ses conférences
e = f"org-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": e, "password": "Passw0rd-test-1", "name": "O"})
cur.execute("update users set role='organizer' where email=%s", (e,))
O = login(e, "Passw0rd-test-1")
ok(post(O, ids=ids, changes={"access": "free"}).status_code == 404, "organisateur : conférences d'autrui refusées")
ok(requests.post(B + "/talks/bulk", json={"ids": ids, "changes": {"access": "free"}}).status_code == 401, "visiteur refusé")
print("ALL OK")
