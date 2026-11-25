"""Envois de fichiers : au plus 5 envois en cours par organisateur, envois abandonnés (> 24 h) nettoyés (relecture du 25/11).
Prérequis : API (3055), PG de test (5544), S3 de test (moto 5599)."""
import sys, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tok = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]
H = {"authorization": "Bearer " + tok}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("delete from uploads where organizer_id=%s", (aid,))
start = lambda: requests.post(B + "/uploads", headers=H, json={"filename": "a.mp4", "size": 1000, "contentType": "video/mp4"})

codes = [start().status_code for _ in range(6)]
ok(codes[:5] == [201] * 5 and codes[5] == 429, "5 envois en cours acceptés, le 6e refusé (429)")
cur.execute("update uploads set created_at = now() - interval '25 hours' where organizer_id=%s and status='pending'", (aid,))
ok(start().status_code == 201, "envois abandonnés depuis plus de 24 h : nettoyés, un nouvel envoi est accepté")
cur.execute("select count(*) from uploads where organizer_id=%s and status='pending'", (aid,)); ok(cur.fetchone()[0] == 1, "les 5 envois abandonnés ont été supprimés de la base")
big = requests.post(B + "/uploads", headers=H, json={"filename": "b.mp4", "size": 10 ** 13, "contentType": "video/mp4"})
ok(big.status_code == 413, "taille annoncée au-dessus du plafond : refusée")
cur.execute("delete from uploads where organizer_id=%s", (aid,))
print("TOUT OK")
