"""27/11 : import de shorts d'une chaîne Kids avec plus de 100 shorts cochés (« Tout cocher » = 124) : plus de « Données invalides ». Prérequis : API (3055), PG (5544)."""
import sys, json, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
A = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
tag = uuid.uuid4().hex[:6]
ents = [{"id": f"m{tag}{i:03d}", "source": "youtube", "title": f"Short {i}", "duration": 30, "thumb": None} for i in range(124)]
cur.execute("insert into import_jobs(organizer_id,url,status,entries,title,purpose) values(%s,%s,'listed',%s,'Kidislam - Shorts','shorts') returning id", (aid, "https://www.youtube.com/@x/shorts", json.dumps(ents)))
jid = cur.fetchone()[0]
r = requests.post(f"{B}/studio/shorts/import/{jid}/start", headers=A, json={"ids": [e["id"] for e in ents], "mode": "youtube", "rights": True, "catalogue": "kids", "kidsBands": ["3-5", "6-8"], "status": "draft"})
ok(r.status_code == 201 and r.json()["created"] == 124, f"124 shorts Kids importés d'un coup ({r.status_code})")
cur.execute("select count(*) from public_shorts where video_ref like %s and catalogue='kids' and kids_bands=%s", (f"m{tag}%", ["3-5", "6-8"])); ok(cur.fetchone()[0] == 124, "tous classés Kids avec leurs tranches d'âge")
cur.execute("delete from public_shorts where video_ref like %s", (f"m{tag}%",)); cur.execute("delete from import_jobs where id=%s", (jid,))
print("TOUT OK")
