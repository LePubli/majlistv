"""Relecture 25/11 — la recherche ne révèle pas le contenu de la transcription d'une vidéo réservée.
Prérequis : API de test (3055) et PG de test (5544), Meilisearch absent (repli SQL).
    python3 api/tests/test_search_transcript_guard.py"""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)

H = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); admin = cur.fetchone()[0]
w = "zqx" + uuid.uuid4().hex[:8]
ids = []
def talk(access, title):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_text) values (%s,'d','Orateur','youtube',%s,%s,'published','ready',%s,600,'fr',%s) returning id",
                (title, "v" + uuid.uuid4().hex[:9], admin, access, f"bla {w} bla"))
    ids.append(cur.fetchone()[0]); return str(ids[-1])
free, prem = talk("free", f"Libre {w[:5]}"), talk("premium", f"Réservée {w[:5]}")
try:
    got = lambda path, **q: requests.get(B + path, params=q).json()
    L = {t["id"] for t in got("/talks", q=w)}
    ok(free in L and prem not in L, "/talks?q= : transcription cherchée pour la vidéo libre seulement")
    S = got("/search", q=w); S = {t["id"] for t in S["hits"]}
    ok(free in S and prem not in S, "/search : la vidéo réservée n'apparaît pas pour un mot de sa transcription")
    ok(got("/talks/facets", q=w)["total"] == 1, "/talks/facets : une seule vidéo comptée")
    T = {t["id"] for t in requests.get(B + "/talks", params={"q": f"Réservée {w[:5]}"}).json()}
    ok(prem in T, "la même vidéo reste trouvable par son titre")
    SA = requests.get(B + "/search", params={"q": w}, headers=H).json(); SA = {t["id"] for t in SA["hits"]}
    ok(prem in SA, "un administrateur la trouve par sa transcription")
finally:
    cur.execute("delete from talks where id = any(%s::uuid[])", ([str(i) for i in ids],))
print("TOUT OK")
