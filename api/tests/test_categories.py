"""Catégories : ajouter, renommer, supprimer (admin) ; les conférences restent en ligne sans catégorie.
Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


ADM = login("admin@test.local", "AdminPassw0rd-test")
email = f"orga-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (email,))
ORG = login(email, "Passw0rd-test")

n = "Cat " + uuid.uuid4().hex[:5]
r = requests.post(B + "/categories", headers=ADM, json={"name": n}); ok(r.status_code == 201, "ajout")
cid = r.json()["id"]
ok(requests.post(B + "/categories", headers=ADM, json={"name": n.upper()}).status_code == 409, "doublon refusé (casse ignorée)")
ok(requests.post(B + "/categories", headers=ORG, json={"name": "x"}).status_code == 403, "organisateur : ajout refusé")
ok(requests.post(B + "/categories", headers=ADM, json={"name": "  "}).status_code == 400, "nom vide refusé")
ok(any(c["id"] == cid for c in requests.get(B + "/categories").json()), "visible dans la liste publique")

stats = {c["id"]: c for c in requests.get(B + "/categories/stats", headers=ADM).json()}
ok(stats[cid]["count"] == 0, "stats : 0 conférence")
ok(requests.get(B + "/categories/stats", headers=ORG).status_code == 403, "stats réservées aux admins")

t = requests.post(B + "/talks", headers=ADM, json={"title": "Conf cat", "language": "fr", "categoryId": cid, "translateTo": [],
                                                   "videoUrl": "https://youtu.be/" + "".join(__import__("random").choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))}).json()["id"]
ok({c["id"]: c for c in requests.get(B + "/categories/stats", headers=ADM).json()}[cid]["count"] == 1, "stats : 1 conférence")

n2 = n + " renommée"
r = requests.patch(f"{B}/categories/{cid}", headers=ADM, json={"name": n2}); ok(r.status_code == 200 and r.json()["name"] == n2, "renommer")
ok(requests.get(f"{B}/talks/{t}").json()["category"] == n2, "la conférence affiche le nouveau nom")
ok(requests.patch(f"{B}/categories/{cid}", headers=ADM, json={"name": "Histoire"}).status_code == 409, "renommer en un nom existant refusé")
ok(requests.patch(f"{B}/categories/{cid}", headers=ADM, json={"name": n2}).status_code == 200, "renommer au même nom : accepté")
ok(requests.patch(f"{B}/categories/999999", headers=ADM, json={"name": "zz"}).status_code == 404, "renommer inconnue : 404")
ok(requests.patch(f"{B}/categories/{cid}", headers=ORG, json={"name": "zz"}).status_code == 403, "organisateur : renommage refusé")

r = requests.delete(f"{B}/categories/{cid}", headers=ORG); ok(r.status_code == 403, "organisateur : suppression refusée")
r = requests.delete(f"{B}/categories/{cid}", headers=ADM); ok(r.status_code == 200 and r.json()["talksUncategorized"] == 1, "suppression (1 conférence détachée)")
g = requests.get(f"{B}/talks/{t}"); ok(g.status_code == 200 and g.json()["category"] is None, "la conférence reste en ligne, sans catégorie")
ok(requests.delete(f"{B}/categories/{cid}", headers=ADM).status_code == 404, "supprimer deux fois : 404")
requests.delete(f"{B}/talks/{t}", headers=ADM)
print("\nTOUT EST OK")
