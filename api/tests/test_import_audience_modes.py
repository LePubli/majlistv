"""27/11 : import de liste — public (adultes/enfants/les deux), catégories (même/auto/une par une), descriptions. Prérequis : API (3055), PG (5544)."""
import sys, json, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
A = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
tag = uuid.uuid4().hex[:6]
def job(n, desc=False):
    ents = [{"id": f"am{tag}{i}", "title": f"Audience {tag} {i}", "source": "youtube", "duration": 60, "thumb": None, **({"description": "Description de la liste"} if desc and i == 0 else {})} for i in range(n)]
    cur.execute("insert into import_jobs(organizer_id,url,status,entries,title,purpose) values(%s,%s,'listed',%s,'Test','videos') returning id", (aid, f"https://www.youtube.com/playlist?list=PL{tag}", json.dumps(ents)))
    return cur.fetchone()[0], ents
def conf(j, **b): return requests.post(f"{B}/imports/{j}/confirm", headers=A, json=b)
cur.execute("select id from categories where is_active order by id limit 2"); c1, c2 = [x[0] for x in cur.fetchall()]
def row(i): cur.execute("select show_adults, kids_bands, category_id, description from talks where video_ref=%s", (f"am{tag}{i}",)); return cur.fetchone()

# enfants sans tranche d'âge : refusé
j, e = job(1); ok(conf(j, ids=[e[0]["id"]], audience="kids").status_code == 400, "enfants sans tranche d'âge : 400")
# enfants avec tranches
r = conf(j, ids=[e[0]["id"]], audience="kids", kidsBands=["3-5"], categoryId=c1)
a = row(0)
ok(r.status_code == 200 and a[0] is False and list(a[1]) == ["3-5"], "enfants : réservé à l'espace enfants avec sa tranche d'âge")
cur.execute("delete from talks where video_ref like %s", (f"am{tag}%",))
cur.execute("delete from import_jobs where id=%s", (j,))

# les deux + description + même catégorie
j, e = job(2, desc=True)
r = conf(j, ids=[x["id"] for x in e], audience="both", kidsBands=["3-5", "6-8"], categoryId=c1)
if r.status_code == 200:
    a = row(0)
    ok(a[0] is True and a[1], "« les deux » : visible aux adultes ET aux enfants")
    ok(a[3] == "Description de la liste", "description de la liste conservée")
else:
    print("INFO tranches rejetées:", r.text)
    sys.exit(1)
cur.execute("delete from talks where video_ref like %s", (f"am{tag}%",)); cur.execute("delete from import_jobs where id=%s", (j,))

# une par une
j, e = job(2)
r = conf(j, ids=[x["id"] for x in e], categoryMode="each", perVideo={e[0]["id"]: c1, e[1]["id"]: c2})
ok(r.status_code == 200 and row(0)[2] == c1 and row(1)[2] == c2, "une par une : chaque vidéo a sa catégorie")
cur.execute("delete from talks where video_ref like %s", (f"am{tag}%",)); cur.execute("delete from import_jobs where id=%s", (j,))

# automatique
j, e = job(2)
r = conf(j, ids=[x["id"] for x in e], categoryMode="auto", categoryId=c1)
ok(r.status_code == 200 and row(0)[2] is None, "automatique : aucune catégorie imposée")
cur.execute("select count(*) from category_jobs j join talks t on t.id=j.talk_id where t.video_ref like %s and j.apply_now and j.status='pending' and j.created_at > now()+interval '15 minutes'", (f"am{tag}%",))
ok(cur.fetchone()[0] == 2 or r.json().get("autoSkipped"), "automatique : analyses IA mises en file (dans 20 min) ou module absent signalé")
cur.execute("delete from category_jobs where talk_id in (select id from talks where video_ref like %s)", (f"am{tag}%",))
cur.execute("delete from talks where video_ref like %s", (f"am{tag}%",)); cur.execute("delete from import_jobs where id=%s", (j,))
print("TOUT OK")
