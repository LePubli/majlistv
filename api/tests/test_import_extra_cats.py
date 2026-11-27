"""27/11 : import d'une chaîne / playlist avec catégories supplémentaires. Prérequis : API (3055), PG (5544)."""
import sys, json, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
A = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
tag = uuid.uuid4().hex[:6]
ents = [{"id": f"xc{tag}{i}", "title": f"Import extra {tag} {i}", "source": "youtube", "duration": 60, "thumb": None} for i in range(3)]
cur.execute("insert into import_jobs(organizer_id,url,status,entries,title,purpose) values(%s,%s,'listed',%s,'Test','videos') returning id", (aid, f"https://www.youtube.com/playlist?list=PL{tag}", json.dumps(ents)))
jid = cur.fetchone()[0]
cur.execute("select id from categories where is_active order by id limit 3"); c1, c2, c3 = [x[0] for x in cur.fetchall()]
r = requests.post(f"{B}/imports/{jid}/confirm", headers=A, json={"ids": [e["id"] for e in ents], "categoryId": c1, "extraCategoryIds": [c1, c2, c3]})
ok(r.status_code == 200 and r.json()["created"] == 3, "3 vidéos importées")
cur.execute("select count(*) from talks t where title like %s and category_id=%s and (select array_agg(category_id order by category_id) from talk_categories where talk_id=t.id) = %s", (f"Import extra {tag}%", c1, sorted([c2, c3])))
ok(cur.fetchone()[0] == 3, "catégories supplémentaires enregistrées pour chaque vidéo (la principale n'est pas doublée)")
ok(requests.post(f"{B}/imports/{jid}/confirm", headers=A, json={"ids": ["zz"], "extraCategoryIds": [999999]}).status_code in (400, 200), "catégorie inconnue : pas d'erreur 500")
ok(requests.post(f"{B}/imports/{jid}/confirm", headers=A, json={"ids": [ents[0]["id"]], "extraCategoryIds": list(range(1, 60))}).status_code == 400, "plus de 20 catégories supplémentaires : refusé")
cur.execute("delete from talks where title like %s", (f"Import extra {tag}%",)); cur.execute("delete from import_jobs where id=%s", (jid,))
print("TOUT OK")
