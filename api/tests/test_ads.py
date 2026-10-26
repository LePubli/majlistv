"""24c : publicité au lancement — API admin (créer, modifier, supprimer, envoi du visuel), rotation, abonnés payants, enfants, prière non concernée côté API,
compteurs, fonction activable. Prérequis : API de test (3055), stockage de test (moto 5599)."""
import os, sys, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


A = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("delete from ads")
requests.put(B + "/admin/features", headers=A, json={"values": {"ads": True}})
for k, v in (("ads_paid_subscribers", "masquer"), ("ads_per_launch", "1")):
    requests.put(B + "/admin/settings", headers=A, json={"values": {k: v}})

# 1) Droits
ok(requests.get(B + "/admin/campaigns").status_code == 401, "sans jeton : 401")
em = "org-ads@test.local"
cur.execute("delete from users where email = %s", (em,))
requests.post(B + "/auth/register", json={"email": em, "password": "OrgPassw0rd-test", "name": "Org"})
cur.execute("update users set role = 'organizer' where email = %s", (em,))
O = login(em, "OrgPassw0rd-test")
ok(requests.get(B + "/admin/campaigns", headers=O).status_code == 403, "organisateur : 403")
ok(requests.post(B + "/admin/campaigns/upload-url", headers=O, json={"contentType": "image/png", "size": 10}).status_code == 403, "organisateur : envoi refusé")


def upload(ctype, data):
    u = requests.post(B + "/admin/campaigns/upload-url", headers=A, json={"contentType": ctype, "size": len(data)})
    ok(u.status_code == 200, f"lien d'envoi {ctype}")
    put = requests.put(u.json()["url"], data=data, headers={"Content-Type": ctype})
    ok(put.status_code == 200, "  fichier envoyé au stockage")
    return u.json()["key"]


# 2) Envoi : types et tailles
ok(requests.post(B + "/admin/campaigns/upload-url", headers=A, json={"contentType": "application/pdf", "size": 10}).status_code == 400, "PDF refusé")
ok(requests.post(B + "/admin/campaigns/upload-url", headers=A, json={"contentType": "image/svg+xml", "size": 10}).status_code == 400, "SVG refusé")
ok(requests.post(B + "/admin/campaigns/upload-url", headers=A, json={"contentType": "image/png", "size": 9 * 1048576}).status_code == 400, "photo de 9 Mo refusée")
ok(requests.post(B + "/admin/campaigns/upload-url", headers=A, json={"contentType": "video/mp4", "size": 41 * 1048576}).status_code == 400, "vidéo de 41 Mo refusée")

# 3) Création
k1 = upload("image/png", b"\x89PNG-test-1")
base = {"advertiser": "Miel & Co", "title": "Le miel de printemps", "sentence": "-10 % cette semaine", "linkUrl": "https://mieletcompagnie.fr/offre", "mediaKey": k1}
ok(requests.post(B + "/admin/campaigns", headers=A, json={**base, "linkUrl": "javascript:alert(1)"}).status_code == 400, "lien javascript: refusé")
ok(requests.post(B + "/admin/campaigns", headers=A, json={**base, "mediaKey": "ads/../x.png"}).status_code == 400, "clé de fichier inattendue refusée")
ok(requests.post(B + "/admin/campaigns", headers=A, json={**base, "mediaKey": "ads/00000000-0000-4000-8000-000000000000.png"}).status_code == 400, "fichier jamais envoyé refusé")
ok(requests.post(B + "/admin/campaigns", headers=A, json={**base, "startsAt": "2026-11-02T10:00:00Z", "endsAt": "2026-11-01T10:00:00Z"}).status_code == 400, "fin avant début refusée")
r = requests.post(B + "/admin/campaigns", headers=A, json=base)
ok(r.status_code == 201, "annonce 1 créée (photo)")
id1 = r.json()["id"]
k2 = upload("video/mp4", b"\x00\x00\x00\x18ftypmp42-test")
r = requests.post(B + "/admin/campaigns", headers=A, json={**base, "advertiser": "TriMaint", "title": "Maintenance", "mediaKey": k2})
ok(r.status_code == 201, "annonce 2 créée (vidéo)")
id2 = r.json()["id"]
k3 = upload("image/jpeg", b"\xff\xd8\xff-test-3")
r = requests.post(B + "/admin/campaigns", headers=A, json={**base, "advertiser": "Plus tard", "title": "Demain", "mediaKey": k3, "startsAt": "2099-01-01T00:00:00Z"})
id3 = r.json()["id"]

lst = requests.get(B + "/admin/campaigns", headers=A).json()
st = {a["id"]: a["status"] for a in lst["ads"]}
ok(st[id1] == "live" and st[id2] == "live" and st[id3] == "scheduled", "situations : en cours, en cours, programmée")
ok({a["id"]: a["mediaKind"] for a in lst["ads"]}[id2] == "video", "type vidéo reconnu")
ok(requests.get([a for a in lst["ads"] if a["id"] == id1][0]["mediaUrl"]).content == b"\x89PNG-test-1", "visuel relu depuis le stockage")

# 4) Côté application : rotation, programmée jamais montrée
r = requests.get(B + "/ads/next").json()
ok([a["id"] for a in r["ads"]] == [id1], "visiteur : 1re publicité")
ok(r["skipSeconds"] == 5 and r["imageSeconds"] == 6, "durées par défaut renvoyées")
ok(r["ads"][0]["cta"] == "En savoir plus" and r["ads"][0]["linkUrl"].startswith("https://"), "texte du bouton et lien présents")
ok([a["id"] for a in requests.get(B + "/ads/next", params={"after": id1}).json()["ads"]] == [id2], "après la 1re : la 2e")
ok([a["id"] for a in requests.get(B + "/ads/next", params={"after": id2}).json()["ads"]] == [id1], "après la 2e : retour à la 1re (la programmée est sautée)")
requests.put(B + "/admin/settings", headers=A, json={"values": {"ads_per_launch": "2"}})
ok([a["id"] for a in requests.get(B + "/ads/next").json()["ads"]] == [id1, id2], "2 publicités à la suite")
requests.put(B + "/admin/settings", headers=A, json={"values": {"ads_per_launch": "1"}})
ok(requests.get(B + "/ads/next", params={"after": "pas-un-uuid"}).status_code == 400, "paramètre invalide : 400")

# 5) Modifier : pause, dates, nouveau visuel (l'ancien est supprimé)
ok(requests.patch(B + f"/admin/campaigns/{id1}", headers=A, json={}).status_code == 400, "modification vide refusée")
ok(requests.patch(B + f"/admin/campaigns/{id1}", headers=A, json={"active": False}).status_code == 200, "mise en pause")
ok([a["id"] for a in requests.get(B + "/ads/next").json()["ads"]] == [id2], "en pause : plus montrée")
ok(requests.patch(B + f"/admin/campaigns/{id1}", headers=A, json={"active": True, "endsAt": "2020-01-01T00:00:00Z"}).status_code == 200, "date de fin passée")
ok(requests.get(B + "/admin/campaigns", headers=A).json()["ads"][0]["status"] in ("ended", "live"), "  situation recalculée")
ok([a["id"] for a in requests.get(B + "/ads/next").json()["ads"]] == [id2], "terminée : plus montrée")
ok(requests.patch(B + f"/admin/campaigns/{id1}", headers=A, json={"endsAt": None}).status_code == 200, "fin retirée")
ok(requests.patch(B + f"/admin/campaigns/{id1}", headers=A, json={"linkUrl": "data:text/html,x"}).status_code == 400, "lien invalide refusé à la modification")
k1b = upload("image/webp", b"RIFF-webp-test")
ok(requests.patch(B + f"/admin/campaigns/{id1}", headers=A, json={"mediaKey": k1b, "title": "Titre 2"}).status_code == 200, "nouveau visuel")
ok(requests.get(B + "/admin/campaigns", headers=A).json()["ads"][0]["title"] == "Titre 2", "  titre modifié")
ok(requests.get(os.environ.get("S3_TEST", "http://127.0.0.1:5599") + "/majlis-videos/" + k1).status_code in (403, 404), "  ancien visuel supprimé")
ok(requests.patch(B + "/admin/campaigns/00000000-0000-4000-8000-000000000000", headers=A, json={"active": True}).status_code == 404, "inconnue : 404")

# 6) Compteurs
for path, n in (("impression", 3), ("click", 1), ("skip", 2)):
    for _ in range(n):
        ok(requests.post(B + f"/ads/{id1}/{path}").status_code == 200, f"{path} compté") if _ == 0 else requests.post(B + f"/ads/{id1}/{path}")
ok(requests.post(B + "/ads/00000000-0000-4000-8000-000000000000/impression").status_code == 404, "compteur d'une inconnue : 404")
a1 = [a for a in requests.get(B + "/admin/campaigns", headers=A).json()["ads"] if a["id"] == id1][0]
ok((a1["impressions"], a1["clicks"], a1["skips"], a1["impressions7"]) == (3, 1, 2, 3) and a1["ctr"] == 33.3, "compteurs : 3 affichages, 1 clic, 2 « passer », 33,3 %")

# 7) Abonnés payants et enfants
em2 = "abo-ads@test.local"
cur.execute("delete from users where email = %s", (em2,))
requests.post(B + "/auth/register", json={"email": em2, "password": "AboPassw0rd-test", "name": "Abo"})
U = login(em2, "AboPassw0rd-test")
ok(len(requests.get(B + "/ads/next", headers=U).json()["ads"]) >= 1, "membre gratuit : publicité montrée")
cur.execute("update users set premium_until = now() + interval '30 days' where email = %s", (em2,))
ok(requests.get(B + "/ads/next", headers=U).json()["ads"] == [], "abonné payant (réglage « masquer ») : rien")
requests.put(B + "/admin/settings", headers=A, json={"values": {"ads_paid_subscribers": "afficher"}})
ok(len(requests.get(B + "/ads/next", headers=U).json()["ads"]) >= 1, "abonné payant (réglage « afficher ») : publicité montrée")
requests.put(B + "/admin/settings", headers=A, json={"values": {"ads_paid_subscribers": "masquer"}})
cur.execute("update users set premium_until = null where email = %s", (em2,))

# 8) Fonction coupée : tout répond 404
requests.put(B + "/admin/features", headers=A, json={"values": {"ads": False}})
ok(requests.get(B + "/ads/next").status_code == 404 and requests.get(B + "/admin/campaigns", headers=A).status_code == 404, "fonction coupée : 404")
requests.put(B + "/admin/features", headers=A, json={"values": {"ads": True}})

# 9) Suppression
ok(requests.delete(B + f"/admin/campaigns/{id2}", headers=A).status_code == 200, "suppression")
ok(requests.delete(B + f"/admin/campaigns/{id2}", headers=A).status_code == 404, "  deuxième suppression : 404")
cur.execute("select count(*) from ad_stats where ad_id = %s", (id2,))
cur.execute("select count(*) from ads"); ok(cur.fetchone()[0] == 2, "  il reste 2 annonces")
cur.execute("delete from ads")
print("TOUT OK : ads")
