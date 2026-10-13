"""12.1 : accueil vitrine (GET /home), mise en avant, bannière personnalisée. Prérequis : API (3055), PG (5544), S3 de test."""
import base64, io, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


A = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
orga_mail = f"orga-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": orga_mail, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (orga_mail,)); cur.execute("select id from users where email=%s", (orga_mail,)); oid = cur.fetchone()[0]
O = login(orga_mail, "Passw0rd-test")
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v})
home = lambda: requests.get(B + "/home").json()

cur.execute("insert into categories(name) values(%s) returning id", (f"CatHome{tag}",)); cid = cur.fetchone()[0]
def mk(title, pub="published", cat=cid, status="ready"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,category_id,description,publication,video_status) values(%s,'Orateur','youtube','abc',%s,%s,%s,%s,%s) returning id",
                (title, oid, cat, "Une description " * 40, pub, status)); return cur.fetchone()[0]
t1, t2, t3 = mk(f"H1-{tag}"), mk(f"H2-{tag}"), mk(f"H3-{tag}")
hid, hid2 = mk(f"Brouillon-{tag}", pub="draft"), mk(f"Pending-{tag}", status="pending")

# Rangées
put({"home_hero_mode": "featured", "home_row_new": "true", "home_rows_categories": "true", "home_row_size": "16"})
h = home()
ids = lambda r: [t["id"] for t in r["talks"]]
new = next(r for r in h["rows"] if r["key"] == "new")
ok(str(t1) in ids(new) and str(t3) in ids(new), "« Nouveautés » contient les conférences en ligne")
ok(str(hid) not in ids(new) and str(hid2) not in ids(new), "brouillon et conversion en cours exclus")
row = next((r for r in h["rows"] if r["key"] == f"cat:{cid}"), None)
ok(row and row["title"] == f"CatHome{tag}" and len(row["talks"]) == 3, "rangée de la catégorie")
ok(all("video_ref" not in t for t in row["talks"] if t["source"] == "upload"), "aucune clé interne")
ok(h["hero"]["mode"] == "text", "sans conférence mise en avant : bannière texte")

# Réglages des rangées
put({"home_row_new": "false"}); ok(not any(r["key"] == "new" for r in home()["rows"]), "rangée Nouveautés désactivable")
put({"home_rows_categories": "false"}); ok(not any(r["key"].startswith("cat:") for r in home()["rows"]), "rangées par catégorie désactivables")
put({"home_row_new": "true", "home_rows_categories": "true", "home_row_size": "4"})
ok(all(len(r["talks"]) <= 4 for r in home()["rows"]), "taille des rangées respectée")
ok(put({"home_row_size": "2"}).status_code == 400, "taille minimale refusée")
put({"home_row_size": "16"})

# Mise en avant
ok(requests.patch(f"{B}/talks/{t1}", headers=O, json={"featured": True}).status_code == 403, "organisateur : mise en avant refusée")
ok(requests.patch(f"{B}/talks/{t1}", headers=A, json={"featured": True}).status_code == 200, "admin : mise en avant")
requests.patch(f"{B}/talks/{t2}", headers=A, json={"featured": True})
h = home()
ok(h["hero"]["mode"] == "featured" and [i["id"] for i in h["hero"]["items"]][:2] == [str(t2), str(t1)], "bannière : plus récente d'abord")
ok(len(h["hero"]["items"][0]["summary"]) <= 240 and h["hero"]["items"][0]["summary"].endswith("…"), "résumé tronqué à 240 caractères")
requests.patch(f"{B}/talks/{hid}", headers=A, json={"featured": True})
ok(str(hid) not in [i["id"] for i in home()["hero"]["items"]], "brouillon jamais en bannière")
cur.execute("select count(*) from talks where featured"); n = cur.fetchone()[0]
for _ in range(6): requests.patch(f"{B}/talks/{mk('F'+tag)}", headers=A, json={"featured": True})
ok(len(home()["hero"]["items"]) == 5, "5 conférences maximum en bannière")
requests.patch(f"{B}/talks/{t1}", headers=A, json={"featured": False})
ok(str(t1) not in [i["id"] for i in home()["hero"]["items"]], "retrait de la mise en avant")
cur.execute("update talks set featured=false, featured_at=null where featured")

# Bannière personnalisée
cur.execute("delete from app_settings where key = %s", ("home_hero_image_key",))  # état propre : pas d'image téléversée avant ce test
put({"home_hero_mode": "custom", "home_hero_title": "Bienvenue", "home_hero_subtitle": "Sous-titre", "home_hero_cta_label": "Voir les tarifs", "home_hero_cta_url": "/pricing", "home_hero_video_url": "https://exemple.fr/v.mp4"})
c = home()["hero"]
ok(c["mode"] == "custom" and c["title"] == "Bienvenue" and c["ctaUrl"] == "/pricing" and c["videoUrl"].endswith("v.mp4") and c["imageUrl"] is None, "bannière personnalisée")
put({"home_hero_cta_url": "javascript:alert(1)", "home_hero_video_url": "http://x/v.mp4"})
c = home()["hero"]
ok(c["ctaUrl"] == "" and c["videoUrl"] == "", "liens dangereux ou non sécurisés ignorés")

# Image de la bannière
png = base64.b64encode(bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")).decode()
r = requests.post(B + "/admin/home/hero-image", headers=A, json={"image": "data:image/png;base64," + png})
ok(r.status_code == 201 and r.json()["imageUrl"], "envoi de l'image de bannière")
ok(home()["hero"]["imageUrl"], "image servie dans /home")
ok(requests.post(B + "/admin/home/hero-image", headers=O, json={"image": "data:image/png;base64," + png}).status_code == 403, "image : réservé aux admins")
ok(requests.post(B + "/admin/home/hero-image", headers=A, json={"image": "data:image/png;base64," + base64.b64encode(b"pas une image").decode()}).status_code == 400, "faux fichier refusé")
ok(requests.post(B + "/admin/home/hero-image", headers=A, json={"image": "data:text/html;base64,AAAA"}).status_code == 400, "type refusé")
ok(requests.delete(B + "/admin/home/hero-image", headers=A).status_code == 204 and home()["hero"]["imageUrl"] is None, "suppression de l'image")

# Réglage caché : décrit mais marqué hidden
f = {x["key"]: x for x in requests.get(B + "/admin/settings", headers=A).json()["fields"]}
ok(f["home_hero_image_key"]["hidden"] is True and f["home_hero_mode"]["hidden"] is False, "champ interne marqué caché")
put({"home_hero_mode": "featured", "home_hero_title": None, "home_hero_subtitle": None, "home_hero_cta_label": None, "home_hero_cta_url": None, "home_hero_video_url": None})
cur.execute("delete from talks where organizer_id=%s", (oid,)); cur.execute("delete from categories where id=%s", (cid,))
print("TOUT OK")
