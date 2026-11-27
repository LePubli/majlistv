"""27/11 : série — public (adultes / enfants / les deux), catégories manuelles ou automatiques, appliqués aux épisodes. Prérequis : API (3055), PG (5544)."""
import sys, uuid, requests, psycopg2
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
tag = uuid.uuid4().hex[:6]
A = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("select id from categories where is_active order by id limit 3"); c1, c2, c3 = [x[0] for x in cur.fetchall()]
def mk(i):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status) values(%s,'X','youtube',%s,%s,'published','ready') returning id", (f"SA{tag} {i}", f"sa{tag}{i}", aid)); return str(cur.fetchone()[0])
def row(t): cur.execute("select show_adults, kids_bands, category_id, (select array_agg(category_id order by category_id) from talk_categories where talk_id=t.id) from talks t where id=%s", (t,)); return cur.fetchone()
t = [mk(i) for i in range(4)]
# enfants sans tranche d'âge : refusé
ok(requests.post(f"{B}/series", headers=A, json={"title": f"S{tag}", "audience": "kids"}).status_code == 400, "création enfants sans tranche d'âge : refusée")
r = requests.post(f"{B}/series", headers=A, json={"title": f"S{tag}", "audience": "kids", "kidsBands": ["3-5", "6-8"], "categoryId": c1, "extraCategoryIds": [c2], "asCollection": True}); ok(r.status_code == 201, "série Kids créée")
sid = r.json()["id"]
ok(requests.put(f"{B}/series/{sid}/episodes", headers=A, json={"episodes": [{"talkId": x} for x in t[:2]]}).status_code == 200, "deux épisodes ajoutés")
a = row(t[0]); ok(a[0] is False and list(a[1]) == ["3-5", "6-8"] and a[2] == c1 and a[3] == [c2], "les épisodes ajoutés prennent le public Kids et les catégories de la série")
# les deux
r = requests.patch(f"{B}/series/{sid}", headers=A, json={"audience": "both", "kidsBands": ["3-5"]}); ok(r.status_code == 200 and r.json()["applied"]["episodes"] == 2, "passage à « les deux » : appliqué aux 2 épisodes")
a = row(t[0]); ok(a[0] is True and list(a[1]) == ["3-5"] and a[2] == c1, "les deux : adultes ET enfants, catégories inchangées")
# changer seulement la catégorie ne touche pas au public
cur.execute("update talks set kids_bands='{9-12}' where id=%s", (t[0],))
requests.patch(f"{B}/series/{sid}", headers=A, json={"categoryId": c3, "applyToEpisodes": True}); a = row(t[0])
ok(list(a[1]) == ["9-12"] and a[2] == c3, "catégorie seule : le public des épisodes n'est pas touché")
# enregistrer sans appliquer
requests.patch(f"{B}/series/{sid}", headers=A, json={"audience": "adult", "applyToEpisodes": False}); a = row(t[1])
ok(list(a[1]) == ["3-5"], "« enregistrer sans appliquer » : épisodes inchangés")
# automatique : analyses IA mises en file
r = requests.patch(f"{B}/series/{sid}", headers=A, json={"categoryMode": "auto"}); ok(r.status_code == 200, "mode automatique accepté")
ap = r.json().get("applied", {}); ok(ap.get("autoQueued") == 2 or ap.get("autoSkipped"), "automatique : 2 analyses IA mises en file")
cur.execute("select count(*) from category_jobs where talk_id = any(%s::uuid[]) and apply_now and status='pending'", (t[:2],)); ok(cur.fetchone()[0] == 2 or ap.get("autoSkipped"), "analyses en base (application dès 70 %)")
# lecture pour l'éditeur
m = requests.get(f"{B}/series/{sid}/manage", headers=A).json(); ok(m["audience"] == "adult" and m["categoryMode"] == "auto" and m["extraCategoryIds"] == [c2], "fiche : public, mode et catégories supplémentaires renvoyés")
# collection liée : catalogue Kids si série 100 % enfants
requests.patch(f"{B}/series/{sid}", headers=A, json={"audience": "kids", "kidsBands": ["6-8"], "applyToEpisodes": True})
cur.execute("select catalogue from collections where series_id=%s", (sid,)); ok(cur.fetchone()[0] == "kids", "collection liée : catalogue Kids")
requests.delete(f"{B}/series/{sid}", headers=A); cur.execute("delete from talks where title like %s", (f"SA{tag}%",))
print("TOUT OK")
