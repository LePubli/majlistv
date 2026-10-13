"""12.3 : conférences similaires (GET /talks/:id/similar). Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("insert into categories(name) values(%s),(%s) returning id", (f"CA{tag}", f"CB{tag}")) if False else None
ids = []
for n in (f"CA{tag}", f"CB{tag}"):
    cur.execute("insert into categories(name) values(%s) returning id", (n,)); ids.append(cur.fetchone()[0])
ca, cb = ids


def mk(title, speaker, cat, pub="published", status="ready"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,category_id,publication,video_status) values(%s,%s,'youtube','abc',%s,%s,%s,%s) returning id", (title, speaker, aid, cat, pub, status))
    return str(cur.fetchone()[0])


base = mk(f"Base{tag}", f"Orateur {tag}", ca)
same_speaker = mk(f"MemeOrateur{tag}", f"orateur {tag}", cb)       # casse différente : même intervenant
same_cat = mk(f"MemeCat{tag}", "Autre", ca)
other = mk(f"Autre{tag}", "Autre", cb)
draft = mk(f"Brouillon{tag}", f"Orateur {tag}", ca, pub="draft")
pending = mk(f"Conv{tag}", f"Orateur {tag}", ca, status="pending")

r = requests.get(f"{B}/talks/{base}/similar"); out = [x["id"] for x in r.json()]
ok(r.status_code == 200, "route publique")
ok(base not in out, "la conférence elle-même est exclue")
ok(draft not in out and pending not in out, "brouillon et conversion en cours exclus")
ok(out.index(same_speaker) < out.index(same_cat) < out.index(other), "ordre : même intervenant, puis même catégorie, puis le reste")
ok(all("video_ref" not in x for x in r.json() if x["source"] == "upload") and all("summary" in x for x in r.json()), "format des vignettes")
ok(len(out) <= 12, "12 maximum")
ok(requests.get(f"{B}/talks/{uuid.uuid4()}/similar").status_code == 404, "inconnue : 404")
ok(requests.get(f"{B}/talks/xyz/similar").status_code == 400, "identifiant invalide : 400")
cur.execute("update talks set category_id=null, speaker='' where id=%s", (base,))
ok(len(requests.get(f"{B}/talks/{base}/similar").json()) > 0, "sans intervenant ni catégorie : on complète avec les plus récentes")
cur.execute("delete from talks where title like %s", (f"%{tag}",)); cur.execute("delete from categories where id in (%s,%s)", (ca, cb))
print("TOUT OK")
