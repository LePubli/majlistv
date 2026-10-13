"""17b : marque-pages et notes personnelles. Prérequis : API (3055), PG (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def user(email):
    r = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test-1", "name": "N"})
    r = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test-1"})
    return {"authorization": "Bearer " + r.json()["token"]}


a, b = user(f"n1-{uuid.uuid4().hex[:6]}@test.local"), user(f"n2-{uuid.uuid4().hex[:6]}@test.local")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,access,publication,video_status) values('Notes','X','youtube','abc12345678',%s,'free','published','ready') returning id", (aid,))
tid = cur.fetchone()[0]
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,access,publication,video_status) values('Notes2','X','youtube','abc12345679',%s,'free','published','ready') returning id", (aid,))
tid2 = cur.fetchone()[0]

ok(requests.get(f"{B}/talks/{tid}/notes").status_code == 401, "visiteur : refusé")
r = requests.post(f"{B}/talks/{tid}/notes", headers=a, json={"positionMs": 125000, "body": "  À retenir : la patience  "})
ok(r.status_code == 201 and r.json()["body"] == "À retenir : la patience", "note créée (texte nettoyé)")
nid = r.json()["id"]
r1 = requests.post(f"{B}/talks/{tid}/notes", headers=a, json={"positionMs": 10000})
r2 = requests.post(f"{B}/talks/{tid}/notes", headers=a, json={"positionMs": 10500})
ok(r1.status_code == 201 and r2.json()["id"] == r1.json()["id"], "marque-page doublon (même instant) réutilisé")
l = requests.get(f"{B}/talks/{tid}/notes", headers=a).json()
ok([x["positionMs"] for x in l] == [10000, 125000], "liste triée par position")
ok(requests.get(f"{B}/talks/{tid}/notes", headers=b).json() == [], "privé : un autre utilisateur ne voit rien")
ok(requests.patch(f"{B}/me/notes/{nid}", headers=b, json={"body": "pirate"}).status_code == 404, "autre utilisateur : modification refusée")
ok(requests.delete(f"{B}/me/notes/{nid}", headers=b).status_code == 404, "autre utilisateur : suppression refusée")
ok(requests.patch(f"{B}/me/notes/{nid}", headers=a, json={"body": "Modifié"}).json()["body"] == "Modifié", "modification par le propriétaire")
ok(requests.post(f"{B}/talks/{tid}/notes", headers=a, json={"positionMs": 1, "body": "x" * 2001}).status_code == 400, "note trop longue refusée")
ok(requests.post(f"{B}/talks/{tid}/notes", headers=a, json={"positionMs": -5}).status_code == 400, "position négative refusée")
ok(requests.post(f"{B}/talks/{uuid.uuid4()}/notes", headers=a, json={"positionMs": 5}).status_code == 404, "conférence inconnue : 404")
requests.post(f"{B}/talks/{tid2}/notes", headers=a, json={"positionMs": 3000, "body": "Autre"})
g = requests.get(f"{B}/me/notes", headers=a).json()
ok(len(g) == 2 and sum(len(x["notes"]) for x in g) == 3 and all(x["title"] for x in g), "bibliothèque : 2 conférences, 3 notes")
ok(requests.get(f"{B}/me/notes", headers=b).json() == [], "bibliothèque d'un autre : vide")
ok(requests.delete(f"{B}/me/notes/{nid}", headers=a).status_code == 204, "suppression")
cur.execute("delete from talks where id = %s", (tid2,))
ok(len(requests.get(f"{B}/me/notes", headers=a).json()) == 1, "suppression de la conférence : notes supprimées en cascade")
open("/tmp/claude-0/notes_tid.txt", "w").write(str(tid))
print("ALL OK")
