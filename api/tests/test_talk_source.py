"""Étape D5 (18/11) : adresse d'origine des vidéos dans Studio (GET /me/talks), jamais exposée au public. Nécessite l'API sur :3055 et Postgres sur :5544."""
import sys, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
def login(e, p): return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test"); tag = uuid.uuid4().hex[:6]
def create(url, title):
    r = requests.post(B + "/talks", headers=A, json={"title": title, "language": "fr", "access": "free", "videoUrl": url, "rightsConfirmed": True, "translateTo": []})
    ok(r.status_code == 201, f"création {title} ({r.text[:80]})"); return r.json()["id"]
import random, string
rid = lambda n: "".join(random.choice(string.ascii_letters + string.digits) for _ in range(n))
yt = rid(11); vm = str(random.randint(10**8, 10**9))
t1 = create(f"https://www.youtube.com/watch?v={yt}", f"Source YT {tag}")
t2 = create(f"https://vimeo.com/{vm}", f"Source Vimeo {tag}")
t3 = create(f"https://www.youtube.com/watch?v={rid(11)}", f"Source importée {tag}")
cur.execute("update talks set source='upload', video_ref=%s, video_status='ready', imported_from=%s, imported_origin='web', audio_track='fr' where id=%s",
            (f"talks/{uuid.uuid4()}", f"https://videos.example.org/conf-{tag}?x=1", t3))
mine = {x["id"]: x for x in requests.get(B + "/me/talks", headers=A).json()}
ok(mine[t1]["sourceUrl"] == f"https://www.youtube.com/watch?v={yt}", "YouTube : adresse d'origine")
ok(mine[t2]["sourceUrl"] == f"https://vimeo.com/{vm}", "Vimeo : adresse d'origine")
ok(mine[t3]["sourceUrl"] is None and mine[t3]["importedFrom"] == f"https://videos.example.org/conf-{tag}?x=1" and mine[t3]["audioTrack"] == "fr",
   "vidéo copiée chez nous : adresse donnée à l'import + piste française")
# Jamais sur le site public (fiche, catalogue).
for tid in (t1, t3):
    cur.execute("update talks set publication='published' where id=%s", (tid,))
pub = requests.get(f"{B}/talks/{t3}").json()
ok("importedFrom" not in pub and "imported_from" not in pub and "sourceUrl" not in pub, "fiche publique : pas d'adresse d'origine")
cat = requests.get(f"{B}/talks").json(); cat = cat if isinstance(cat, list) else cat.get("items", [])
ok(all("importedFrom" not in x and "sourceUrl" not in x for x in cat), "catalogue public : pas d'adresse d'origine")
# Un autre organisateur ne voit pas ces vidéos dans son Studio.
em = f"src-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Src {tag}"})
cur.execute("update users set role='organizer' where email=%s", (em,)); O = login(em, "Passw0rd-test")
ok(not any(x["id"] in (t1, t2, t3) for x in requests.get(B + "/me/talks", headers=O).json()), "autre organisateur : n'y a pas accès")
cur.execute("delete from talks where id in (%s,%s,%s)", (t1, t2, t3))
print("test_talk_source OK")
