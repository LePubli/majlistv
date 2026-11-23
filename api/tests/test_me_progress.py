"""GET /me/progress?ids= : avancement du membre sur des vidéos données (cartes du thème Premium).
Prérequis : API (3055), PG de test (5544), admin admin@test.local. Lancement : python3 api/tests/test_me_progress.py"""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def reg(tag):
    r = requests.post(B + "/auth/register", json={"email": f"pg-{tag}@test.local", "password": "Passw0rd-test", "name": "Membre"})
    return {"authorization": "Bearer " + r.json()["token"]}


tag = uuid.uuid4().hex[:6]
M = reg(tag); M2 = reg(tag + "b")
cur.execute("select id from users where email='admin@test.local'"); admin = cur.fetchone()[0]
ids = []
for i in range(4):
    cur.execute("insert into talks(title,speaker,language,organizer_id,source,video_ref,video_status,publication,access,duration_seconds) values(%s,'Prog Test','fr',%s,'upload','x','ready','published','free',1000) returning id", (f"Prog {tag} {i}", admin))
    ids.append(str(cur.fetchone()[0]))
q = ",".join(ids)

ok(requests.get(B + "/me/progress?ids=" + q).status_code == 401, "sans jeton : refusé")
ok(requests.get(B + "/me/progress", headers=M).status_code == 400, "sans ids : 400")
ok(requests.get(B + "/me/progress?ids=pas-un-uuid", headers=M).status_code == 400, "id mal formé : 400")
ok(requests.get(B + "/me/progress?ids=", headers=M).status_code == 400 or requests.get(B + "/me/progress?ids=", headers=M).json() == [], "ids vide : 400 ou liste vide")
ok(requests.get(B + "/me/progress?ids=" + q, headers=M).json() == [], "rien commencé : liste vide")

put = lambda h, tid, pos: requests.put(B + f"/me/progress/{tid}", headers=h, json={"positionMs": pos, "durationMs": 1_000_000})
ok(put(M, ids[0], 250_000).status_code == 204, "lecture à 25 %")
ok(put(M, ids[1], 2_000).status_code == 204, "2 s seulement : pas une vraie reprise")
ok(put(M, ids[2], 990_000).status_code == 204, "lecture terminée")
ok(put(M2, ids[3], 500_000).status_code == 204, "un autre membre")

d = {x["talkId"]: x for x in requests.get(B + "/me/progress?ids=" + q, headers=M).json()}
ok(set(d) == {ids[0], ids[2]}, f"seules les vidéos commencées / terminées sont renvoyées ({len(d)})")
ok(d[ids[0]]["pct"] == 25 and d[ids[0]]["done"] is False, "25 %, pas terminée")
ok(d[ids[2]]["pct"] == 100 and d[ids[2]]["done"] is True, "terminée : 100 %")
ok(ids[3] not in d, "la progression d'un autre membre n'apparaît pas")
d2 = requests.get(B + "/me/progress?ids=" + ids[3], headers=M2).json()
ok(len(d2) == 1 and d2[0]["pct"] == 50, "l'autre membre voit la sienne (50 %)")
many = ",".join(str(uuid.uuid4()) for _ in range(150))
ok(requests.get(B + "/me/progress?ids=" + many, headers=M).status_code in (200, 400), "trop d'ids : pas d'erreur serveur")
ok(requests.get(B + "/me/progress?ids=" + q + "," + q, headers=M).status_code == 200, "doublons acceptés")

cur.execute("delete from talks where id = any(%s::uuid[])", (ids,))
cur.execute("delete from users where email like %s", (f"pg-{tag}%@test.local",))
print("test_me_progress : TOUT OK")
