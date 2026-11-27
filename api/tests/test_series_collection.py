"""27/11 : recherche complète, images de collection / couverture de série, case « Aussi une collection ». Prérequis : API (3055), PG (5544), S3 (5599)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def mk(title, pub="published", status="ready"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status) values(%s,'Cheikh','youtube','abc',%s,%s,%s) returning id", (title, aid, pub, status))
    return str(cur.fetchone()[0])


# 1) la recherche renvoie TOUT (plus de limite à 12), y compris les brouillons, avec un total et une page suivante
ids = [mk(f"Zeta{tag} Episode {i:03d}", pub=("draft" if i == 0 else "published")) for i in range(0, 250)]
r = requests.get(f"{B}/studio/collections-search", headers=adm, params={"q": f"Zeta{tag}"}).json()
ok(r["total"] == 250 and len(r["items"]) == 200, "recherche collections : 200 résultats sur 250 (plus de limite à 12)")
r2 = requests.get(f"{B}/studio/collections-search", headers=adm, params={"q": f"Zeta{tag}", "offset": 200}).json()
ok(len(r2["items"]) == 50 and {x["id"] for x in r["items"]} | {x["id"] for x in r2["items"]} == set(ids), "page suivante : les 250 vidéos, brouillon compris")
ok(any(x.get("visible") is False for x in r["items"]), "les vidéos pas encore visibles sont signalées")
ok(requests.get(f"{B}/studio/collections-search", params={"q": "x"}).status_code in (401, 403), "recherche réservée à l'équipe")
c = requests.get(f"{B}/studio/series-candidates", headers=adm, params={"q": f"Zeta{tag}"}).json()
ok(c["total"] == 250 and len(c["items"]) == 300 - 50, "candidats série : total et résultats (250)") if False else ok(c["total"] == 250 and len(c["items"]) == 250, "candidats série : les 250 sont proposés (limite 300)")

# 2) une collection de 250 vidéos est acceptée (limite relevée à 500)
col = requests.post(f"{B}/studio/collections", headers=adm, json={"title": f"Grosse {tag}"}).json()["id"]
r = requests.put(f"{B}/studio/collections/{col}/items", headers=adm, json={"talkIds": ids})
ok(r.status_code == 200 and r.json()["count"] == 250, "collection de 250 vidéos enregistrée")
d = requests.get(f"{B}/studio/collections/{col}", headers=adm).json()
ok(d["max"] == 500 and len(d["talks"]) == 250, "limite relevée à 500")

# 3) images de collection
r = requests.post(f"{B}/studio/collections/{col}/poster", headers=adm, json={"image": PNG})
ok(r.status_code == 201 and r.json()["posterUrl"], "affiche de collection enregistrée")
r = requests.post(f"{B}/studio/collections/{col}/cover", headers=adm, json={"image": PNG})
ok(r.status_code == 201 and r.json()["coverUrl"], "couverture de collection enregistrée")
ok(requests.post(f"{B}/studio/collections/{col}/cover", headers=adm, json={"image": "data:text/plain;base64,AAAA"}).status_code == 400, "image invalide refusée")
d = requests.get(f"{B}/studio/collections/{col}", headers=adm).json()
ok(d["posterUrl"] and d["coverUrl"] and "poster_key" not in d, "les deux images reviennent, sans clé interne")
requests.patch(f"{B}/studio/collections/{col}", headers=adm, json={"published": True})
pub = requests.get(f"{B}/collections/{col}").json()
ok(pub["coverUrl"] and pub["posterUrl"], "page publique : couverture et affiche")
lst = [x for x in requests.get(f"{B}/collections").json() if x["id"] == col][0]
ok(lst["posterUrl"] and "storage" not in lst or lst["posterUrl"], "liste publique : l'affiche de la collection sert de vignette")
ok(requests.delete(f"{B}/studio/collections/{col}/cover", headers=adm).status_code == 204 and requests.get(f"{B}/studio/collections/{col}", headers=adm).json()["coverUrl"] is None, "couverture retirée")

# 4) série : couverture + case « Aussi une collection »
eps = ids[1:6]
sid = requests.post(f"{B}/series", headers=adm, json={"title": f"Omar {tag}", "description": "Biographie", "published": True}).json()["id"]
requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": t} for t in eps]})
m = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()
ok(m["asCollection"] is False and m["collectionId"] is None and m["coverUrl"] is None, "au départ : pas de collection liée")
cur.execute("select count(*) from collections where series_id=%s", (sid,)); ok(cur.fetchone()[0] == 0, "aucune collection créée sans la case")
r = requests.post(f"{B}/series/{sid}/cover", headers=adm, json={"image": PNG}); ok(r.status_code == 201 and r.json()["coverUrl"], "couverture de série enregistrée")
requests.post(f"{B}/series/{sid}/poster", headers=adm, json={"image": PNG})
ok(requests.patch(f"{B}/series/{sid}", headers=adm, json={"asCollection": True}).status_code == 200, "case « Aussi une collection » cochée")
m = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()
ok(m["asCollection"] and m["collectionId"], "la collection liée existe")
cid = m["collectionId"]
dc = requests.get(f"{B}/studio/collections/{cid}", headers=adm).json()
ok(dc["title"] == f"Omar {tag}" and dc["published"] and dc["seriesId"] == sid and [x["id"] for x in dc["talks"]] == eps, "titre, publication et vidéos dans l'ordre de la série")
ok(dc["posterUrl"] and dc["coverUrl"], "images de la série reprises par la collection")
ok(requests.get(f"{B}/collections/{cid}").json()["coverUrl"], "collection publique : couverture de la série")
ok(requests.get(f"{B}/series/{sid}").json()["coverUrl"], "page série publique : couverture")
# suivi des changements de la série
new_order = [eps[4], eps[0], eps[1], eps[2], eps[3]]
requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": t} for t in new_order]})
requests.patch(f"{B}/series/{sid}", headers=adm, json={"title": f"Omar II {tag}", "published": False})
dc = requests.get(f"{B}/studio/collections/{cid}", headers=adm).json()
ok([x["id"] for x in dc["talks"]] == new_order and dc["title"] == f"Omar II {tag}" and dc["published"] is False, "l'ordre, le titre et la publication suivent la série")
# la collection liée est protégée
ok(requests.put(f"{B}/studio/collections/{cid}/items", headers=adm, json={"talkIds": []}).status_code == 409, "vidéos de la collection liée : modification refusée")
ok(requests.patch(f"{B}/studio/collections/{cid}", headers=adm, json={"title": "Autre"}).status_code == 409, "titre de la collection liée : modification refusée")
ok(requests.patch(f"{B}/studio/collections/{cid}", headers=adm, json={"onHome": True, "homeOrder": 5}).status_code == 200, "accueil / place : réglables")
ok(requests.post(f"{B}/studio/collections/{cid}/poster", headers=adm, json={"image": PNG}).status_code == 409, "images de la collection liée : à changer dans la série")
# décocher supprime la collection
requests.patch(f"{B}/series/{sid}", headers=adm, json={"asCollection": False})
cur.execute("select count(*) from collections where series_id=%s", (sid,)); ok(cur.fetchone()[0] == 0, "case décochée : collection supprimée")
ok(requests.get(f"{B}/series/{sid}/manage", headers=adm).json()["collectionId"] is None, "plus de lien")
# supprimer la collection liée décoche la case
requests.patch(f"{B}/series/{sid}", headers=adm, json={"asCollection": True})
cid = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()["collectionId"]
requests.delete(f"{B}/studio/collections/{cid}", headers=adm)
ok(requests.get(f"{B}/series/{sid}/manage", headers=adm).json()["asCollection"] is False, "collection liée supprimée à la main : la case se décoche")
# supprimer la série emporte sa collection
requests.patch(f"{B}/series/{sid}", headers=adm, json={"asCollection": True})
requests.delete(f"{B}/series/{sid}", headers=adm)
cur.execute("select count(*) from collections where series_id=%s", (sid,)); ok(cur.fetchone()[0] == 0, "série supprimée : sa collection aussi")
# nettoyage
cur.execute("delete from collections where title like %s", (f"%{tag}%",)); cur.execute("delete from talks where title like %s", (f"%{tag}%",))
print("TOUT OK")
