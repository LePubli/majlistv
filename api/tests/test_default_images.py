"""27/11 : images par défaut — série et collection prennent l'image de leur première vidéo (présentation ET couverture), sauf si on envoie les siennes. Prérequis : API (3055), PG (5544)."""
import sys, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
tag = uuid.uuid4().hex[:6]
A = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
IMG = f"https://img.example.test/{tag}.jpg"
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,external_thumb) values(%s,'X','youtube',%s,%s,'published','ready',%s) returning id", (f"DI{tag}", f"di{tag}", aid, IMG))
tid = str(cur.fetchone()[0])
sid = requests.post(f"{B}/series", headers=A, json={"title": f"Serie {tag}", "published": True, "hasSeasons": False, "asCollection": True}).json()["id"]
requests.put(f"{B}/series/{sid}/episodes", headers=A, json={"episodes": [{"talkId": tid}]})
s = requests.get(f"{B}/series/{sid}", headers=A).json()
ok(s["posterUrl"] == IMG and s["coverUrl"] == IMG, "série : présentation et couverture = image de la première vidéo")
cur.execute("select id from collections where series_id=%s", (sid,)); cid = cur.fetchone()[0]
col = requests.post(f"{B}/studio/collections", headers=A, json={"title": f"Coll {tag}", "published": True}).json()["id"]
requests.put(f"{B}/studio/collections/{col}/items", headers=A, json={"talkIds": [tid]})
d = requests.get(f"{B}/collections/{col}", headers=A).json()
ok(d.get("posterUrl") == IMG and d.get("coverUrl") == IMG, "collection : présentation et couverture = image de la première vidéo")
requests.delete(f"{B}/series/{sid}", headers=A); requests.delete(f"{B}/studio/collections/{col}", headers=A); cur.execute("delete from talks where id=%s", (tid,))
print("TOUT OK")
