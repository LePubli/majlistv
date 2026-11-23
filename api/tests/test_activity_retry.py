"""Studio → Activité : relance en lot des tâches en échec — POST /studio/activity/retry.
Prérequis : API (3055), PG de test (5544), admin admin@test.local. Lancement : python3 api/tests/test_activity_retry.py"""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def hdr(tok): return {"authorization": "Bearer " + tok}


tag = uuid.uuid4().hex[:6]
A = hdr(requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"])
mem = requests.post(B + "/auth/register", json={"email": f"ar-{tag}@test.local", "password": "Passw0rd-test", "name": "Membre"}).json()["token"]
requests.post(B + "/auth/register", json={"email": f"ao-{tag}@test.local", "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (f"ao-{tag}@test.local",))
O = hdr(requests.post(B + "/auth/login", json={"email": f"ao-{tag}@test.local", "password": "Passw0rd-test"}).json()["token"])
cur.execute("select id from users where email='admin@test.local'"); admin = cur.fetchone()[0]
cur.execute("select id from users where email=%s", (f"ao-{tag}@test.local",)); orga = cur.fetchone()[0]


def talk(title, owner, source="upload", video="ready", tr="ready", rights=True):
    cur.execute("""insert into talks(title,speaker,language,organizer_id,source,video_ref,video_status,video_error,transcript_status,transcript_error,transcript_attempts,rights_confirmed,publication,access,duration_seconds)
                   values (%s,'Relance Test','fr',%s,%s,'x',%s,%s,%s,%s,3,%s,'draft','free',60) returning id""",
                (f"{title} {tag}", owner, source, video, "boom" if video == "failed" else None, tr, "YouTube bloque" if tr == "failed" else None, rights))
    return str(cur.fetchone()[0])


tA = talk("Transcription en échec", admin, tr="failed")
tB = talk("YouTube sans accord", admin, source="youtube", tr="failed", rights=False)
tC = talk("Conversion en échec", admin, video="failed")
tD = talk("Traduction en échec", admin)
cur.execute("insert into transcript_translations(talk_id,lang,status,error,attempts) values (%s,'en','failed','x',3)", (tD,))
tE = talk("Rien à relancer", admin)
tF = talk("YouTube avec accord", admin, source="youtube", tr="failed", rights=True)
tO = talk("Échec de l'organisateur", orga, tr="failed")
st = lambda sql, i: (cur.execute(sql, (i,)), cur.fetchone()[0])[1]
item = lambda q, r: {"queue": q, "ref": r}

ok(requests.post(B + "/studio/activity/retry", json={"items": [item("transcript", tA)]}).status_code == 401, "sans jeton : refusé")
ok(requests.post(B + "/studio/activity/retry", headers=hdr(mem), json={"items": [item("transcript", tA)]}).status_code == 403, "membre : refusé")
ok(requests.post(B + "/studio/activity/retry", headers=A, json={"items": []}).status_code == 400, "liste vide : 400")
ok(requests.post(B + "/studio/activity/retry", headers=A, json={"items": [item("nimporte", tA)]}).status_code == 400, "file inconnue : 400")
ok(requests.post(B + "/studio/activity/retry", headers=A, json={"items": [{**item("transcript", tA), "x": 1}]}).status_code == 400, "champ en trop : 400")
ok(requests.post(B + "/studio/activity/retry", headers=A, json={"items": [item("transcript", tA)] * 501}).status_code == 400, "plus de 500 : 400")

# L'organisateur ne touche pas aux tâches d'un autre : « ignorée », rien n'est modifié.
r = requests.post(B + "/studio/activity/retry", headers=O, json={"items": [item("transcript", tA)]}).json()
ok(r["retried"] == 0 and r["skipped"][0]["reason"] == "state" and st("select transcript_status from talks where id=%s", tA) == "failed", "organisateur : tâche d'un autre, ignorée et intacte")
r = requests.post(B + "/studio/activity/retry", headers=O, json={"items": [item("transcript", tO)]}).json()
ok(r["retried"] == 1 and st("select transcript_status from talks where id=%s", tO) == "pending", "organisateur : sa propre tâche relancée")

items = [item("transcript", tA), item("transcript", tB), item("video", tC), item("translation", f"{tD}:en"), item("transcript", tE), item("transcript", tF), item("dubbing", "inconnue")]
r = requests.post(B + "/studio/activity/retry", headers=A, json={"items": items}).json()
reasons = {(x["queue"], x["ref"]): x["reason"] for x in r["skipped"]}
ok(r["retried"] == 4, f"4 relancées : transcription, conversion, traduction, YouTube avec accord ({r['retried']})")
ok(reasons.get(("transcript", tB)) == "rights", "YouTube sans accord de l'auteur : ignorée (rights)")
ok(reasons.get(("transcript", tE)) == "state", "tâche qui n'est pas en échec : ignorée (state)")
ok(reasons.get(("dubbing", "inconnue")) == "state", "tâche inconnue : ignorée (state)")
cur.execute("select transcript_status, transcript_error, transcript_attempts, transcript_progress from talks where id=%s", (tA,))
ok(cur.fetchone() == ("pending", None, 0, 0), "transcription remise en attente, erreur et essais à zéro")
cur.execute("select video_status, video_error from talks where id=%s", (tC,)); ok(cur.fetchone() == ("pending", None), "conversion remise en attente")
cur.execute("select status, error, attempts from transcript_translations where talk_id=%s and lang='en'", (tD,)); ok(cur.fetchone() == ("pending", None, 0), "traduction remise en attente")
ok(st("select transcript_status from talks where id=%s", tB) == "failed" and st("select rights_confirmed::text from talks where id=%s", tB) == "false", "accord de l'auteur jamais confirmé à sa place")
ok(st("select transcript_status from talks where id=%s", tF) == "pending", "YouTube avec accord : relancée")
r = requests.post(B + "/studio/activity/retry", headers=A, json={"items": [item("transcript", tA)]}).json()
ok(r["retried"] == 0 and r["skipped"][0]["reason"] == "state", "deuxième appel : plus en échec, ignorée")
d = requests.get(B + "/studio/activity", headers=A).json()
ok(not any(t["status"] == "failed" and t["talkId"] in (tA, tC, tD, tF, tO) for t in d["tasks"]), "l'écran ne les liste plus en échec")

cur.execute("delete from talks where speaker='Relance Test'")
cur.execute("delete from users where email like %s", (f"a_-{tag}@test.local",))
print("test_activity_retry : TOUT OK")
