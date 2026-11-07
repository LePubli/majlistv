"""Amélioration 2.6 : rangée « Pour vous » de l'accueil (GET /home), calculée depuis les favoris et « à regarder plus tard ».
Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


A = login("admin@test.local", "AdminPassw0rd-test")
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v})
tag = uuid.uuid4().hex[:6]


def user(prefix):
    mail = f"{prefix}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": mail, "password": "Passw0rd-test", "name": prefix})
    cur.execute("select id from users where email=%s", (mail,))
    return cur.fetchone()[0], login(mail, "Passw0rd-test")


oid, _ = user("orga")
cats = {}
for k in "XYZ":
    cur.execute("insert into categories(name) values(%s) returning id", (f"Cat{k}{tag}",)); cats[k] = cur.fetchone()[0]


def mk(title, speaker, cat, pub="published", status="ready"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,category_id,description,publication,video_status) values(%s,%s,'youtube','abc',%s,%s,'d',%s,%s) returning id",
                (f"{title}-{tag}", f"{speaker}-{tag}", oid, cats[cat], pub, status))
    return cur.fetchone()[0]


fa1, fa2 = mk("FA1", "A", "X"), mk("FA2", "A", "Y")   # même intervenant
fb1 = mk("FB1", "B", "X")                              # même catégorie que FA1
fc1, fc2 = mk("FC1", "C", "Z"), mk("FC2", "C", "Z")   # sans lien avec FA1
fd = mk("FD-brouillon", "A", "X", pub="draft")


def foryou(h=None):
    r = requests.get(B + "/home", headers=h or {}).json()["rows"]
    return next((x for x in r if x["key"] == "foryou"), None), r


put({"home_row_foryou": "true", "home_row_size": "16"})
uid, M = user("membre")
row, _ = foryou(M)
ok(row is None, "membre sans favori ni « plus tard » : pas de rangée")
ok(foryou()[0] is None, "visiteur anonyme : pas de rangée")

cur.execute("insert into favorites(user_id,talk_id) values(%s,%s)", (uid, fa1))
row, rows = foryou(M)
ids = [t["id"] for t in row["talks"]] if row else []
ok(str(fa2) in ids and str(fb1) in ids, "un favori : même intervenant et même catégorie proposés")
ok(str(fa1) not in ids, "le favori lui-même n'est pas reproposé")
ok(str(fc1) not in ids and str(fc2) not in ids and str(fd) not in ids, "sans lien ou brouillon : exclus")
ok(ids.index(str(fa2)) < ids.index(str(fb1)), "même intervenant classé avant même catégorie")
ok(rows[0]["key"] == "new" and rows[1]["key"] == "foryou", "la rangée vient juste après « Nouveautés »")
ok(all("video_ref" not in t for t in row["talks"] if t["source"] == "upload") and all("poster_key" not in t for t in row["talks"]), "aucune clé interne")

cur.execute("insert into watch_later(user_id,talk_id) values(%s,%s)", (uid, fc1))
row, _ = foryou(M); ids = [t["id"] for t in row["talks"]]
ok(str(fc2) in ids and str(fc1) not in ids, "« à regarder plus tard » compte aussi (poids plus faible)")
ok(ids.index(str(fa2)) < ids.index(str(fc2)), "un favori pèse plus qu'un « plus tard »")

cur.execute("insert into watch_progress(user_id,talk_id,position_ms,duration_ms,completed) values(%s,%s,1000,1000,true)", (uid, fb1))
row, _ = foryou(M); ids = [t["id"] for t in row["talks"]]
ok(str(fb1) not in ids, "conférence déjà terminée : exclue")

uid2, M2 = user("autre")
ok(foryou(M2)[0] is None, "la rangée d'un autre membre n'est pas influencée")

put({"home_row_foryou": "false"}); ok(foryou(M)[0] is None, "rangée désactivable dans les réglages")
put({"home_row_foryou": "true"})
cur.execute("delete from favorites where user_id=%s", (uid,)); cur.execute("delete from watch_later where user_id=%s", (uid,))
ok(foryou(M)[0] is None, "sans favori ni « plus tard » : la rangée disparaît")
print("test_foryou : TOUT OK")
