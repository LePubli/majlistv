"""Thème Premium, lot 2 (19/11) : tri du Catalogue (GET /talks?sort=) et chiffres du Catalogue (GET /talks/facets).
Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


cur.execute("select id from users where email='admin@test.local'"); oid = cur.fetchone()[0]
cur.execute("insert into categories(name) values(%s) returning id", (f"Racine{tag}",)); root = cur.fetchone()[0]
cur.execute("insert into categories(name,parent_id) values(%s,%s) returning id", (f"Sous{tag}", root)); sub = cur.fetchone()[0]
cur.execute("insert into categories(name) values(%s) returning id", (f"Autre{tag}",)); other = cur.fetchone()[0]


def mk(title, cat, dur, status="ready", pub="published"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,category_id,description,publication,video_status,duration_seconds) "
                "values(%s,'Orateur','youtube','abc',%s,%s,'d',%s,%s,%s) returning id", (f"{title} {tag}", oid, cat, pub, status, dur))
    return str(cur.fetchone()[0])


b = mk("Bravo", root, 600)
a = mk("alpha", sub, 1800)          # sous-thème : compté dans la racine
c = mk("Charlie", other, None)      # durée inconnue : en dernier pour le tri par durée
mk("Delta", root, 60, status="processing")   # pas prête : jamais comptée
mk("Echo", root, 60, pub="draft")            # brouillon : jamais comptée
try:
    rows = requests.get(B + "/talks", params={"q": tag, "sort": "alpha"}).json()
    ok([x["id"] for x in rows] == [a, b, c], "tri A → Z (sans tenir compte des majuscules)")
    rows = requests.get(B + "/talks", params={"q": tag, "sort": "duration"}).json()
    ok([x["id"] for x in rows] == [b, a, c], "tri par durée (plus courtes d'abord, durée inconnue en dernier)")
    rows = requests.get(B + "/talks", params={"q": tag}).json()
    ok(len(rows) == 3, "tri par défaut inchangé : 3 vidéos visibles")
    ok(requests.get(B + "/talks", params={"sort": "nimporte"}).status_code == 400, "tri inconnu refusé")

    f = requests.get(B + "/talks/facets", params={"q": tag}).json()
    ok(f["total"] == 3, f"total des résultats = 3 ({f['total']})")
    n = {x["id"]: x["n"] for x in f["categories"]}
    ok(n.get(root) == 2 and n.get(other) == 1, f"nombre par thème principal, sous-thème compris ({n.get(root)}, {n.get(other)})")
    ok(sub not in n, "les sous-thèmes ne sont pas listés à part")
    f = requests.get(B + "/talks/facets", params={"q": tag, "category": root}).json()
    ok(f["total"] == 2, "total filtré par thème (sous-thème compris)")
    ok({x["id"]: x["n"] for x in f["categories"]}.get(other) == 1, "les chiffres par thème ignorent le thème choisi")
    f = requests.get(B + "/talks/facets", params={"q": "aucune-video-" + tag}).json()
    ok(f["total"] == 0 and f["categories"] == [], "recherche sans résultat : 0")
finally:
    cur.execute("delete from talks where title like %s", (f"% {tag}",))
    cur.execute("delete from categories where id in (%s,%s,%s)", (sub, root, other))
print("TOUT OK")
