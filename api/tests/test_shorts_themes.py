"""Shorts publics — thèmes (23/11) : GET /shorts/themes, GET /shorts?theme=, `themes` dans chaque short.
Le thème d'un short vient du classement de sa vidéo (catégorie et catégories en plus, ramenées à leur catégorie principale).
Sans stockage S3 : les shorts sont insérés directement en base (le lien de lecture est alors vide). Prérequis : API (3055), PG (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]
cats, talks, uid = [], [], None


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for c in sorted(cats, reverse=True): cur.execute("delete from categories where id=%s", (c,))
    if uid: cur.execute("delete from users where id=%s", (uid,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


r = requests.post(B + "/auth/register", json={"email": f"sht-{tag}@test.local", "password": "Passw0rd-test", "name": "Org"})
cur.execute("select id from users where email=%s", (f"sht-{tag}@test.local",)); uid = cur.fetchone()[0]


def cat(name, slug, parent=None, order=0, tr="{}"):
    cur.execute("insert into categories(name,slug,parent_id,display_order,translations) values(%s,%s,%s,%s,%s) returning id", (name, slug, parent, order, tr)); i = cur.fetchone()[0]; cats.append(i); return i


A = cat(f"Théma A {tag}", f"tha-{tag}", order=9000, tr='{"en":{"name":"Theme A"},"ar":{"name":"موضوع"}}')
A1 = cat(f"Sous A {tag}", f"tha1-{tag}", parent=A)
Bc = cat(f"Théma B {tag}", f"thb-{tag}", order=9001)


def short(title, category, extra=None):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,category_id)
                   values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',300,%s) returning id""", (title, f"talks/{tag}-{uuid.uuid4().hex[:4]}", uid, category)); t = str(cur.fetchone()[0]); talks.append(t)
    if extra: cur.execute("insert into talk_categories(talk_id,category_id) values(%s,%s)", (t, extra))
    cur.execute("insert into public_shorts(talk_id,title,video_key,duration_s,status,published_at) values(%s,%s,%s,12,'published',now()) returning id", (t, title, f"shorts/{tag}.mp4")); return str(cur.fetchone()[0])


S1 = short(f"Court sous-thème {tag}", A1)          # sous-catégorie de A → thème A
S2 = short(f"Court deux thèmes {tag}", A, extra=Bc)  # A + B en plus
S3 = short(f"Court sans thème {tag}", None)

th = requests.get(B + "/shorts/themes").json()
mine = {x["slug"]: x for x in th if x["slug"] in (f"tha-{tag}", f"thb-{tag}")}
ok(mine[f"tha-{tag}"]["count"] == 2, "thème A : 2 shorts (sous-catégorie ramenée à sa catégorie principale)")
ok(mine[f"thb-{tag}"]["count"] == 1, "thème B : 1 short (catégorie en plus)")
ok(f"tha1-{tag}" not in [x["slug"] for x in th], "les sous-catégories ne sont pas des thèmes")
ok(mine[f"tha-{tag}"]["nameTr"] == {"en": "Theme A", "ar": "موضوع"}, "noms traduits fournis")
ok(mine[f"thb-{tag}"].get("nameTr") is None, "sans traduction : pas de nameTr")

fa = requests.get(B + f"/shorts?theme=tha-{tag}&limit=30").json()
ok({x["id"] for x in fa} == {S1, S2}, "filtre thème A : les 2 shorts")
fb = requests.get(B + f"/shorts?theme=thb-{tag}&limit=30").json()
ok([x["id"] for x in fb] == [S2], "filtre thème B : le short à deux thèmes")
ok(requests.get(B + f"/shorts?theme=nexiste-pas-{tag}").json() == [], "thème inconnu : liste vide")
ok(requests.get(B + "/shorts?theme=Pas%20Valide").status_code == 400, "thème mal formé : 400")
allv = {x["id"]: x for x in requests.get(B + "/shorts?limit=30").json()}
ok({S1, S2, S3} <= set(allv), "sans filtre : tous")
ok([t["slug"] for t in allv[S2]["themes"]] == [f"tha-{tag}", f"thb-{tag}"], "themes du short : dans l'ordre du catalogue")
ok(allv[S3]["themes"] == [], "short d'une vidéo sans catégorie : aucun thème")
ok(requests.get(B + f"/shorts/{S2}").json()["themes"][0]["slug"] == f"tha-{tag}", "détail d'un short : themes présents")
cur.execute("update public_shorts set status='draft' where id=%s", (S2,))
ok(requests.get(B + "/shorts/themes").json() and {x["slug"]: x["count"] for x in requests.get(B + "/shorts/themes").json()}.get(f"thb-{tag}") is None, "brouillon non compté ; thème B disparaît")
cleanup()
print("test_shorts_themes : TOUT OK")
