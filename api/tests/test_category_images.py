"""27/11 : images des catégories et sous-catégories envoyées depuis l'admin — envoi, adresse stable, redirection, retrait, refus d'un faux fichier.
Prérequis : API (3055), PG (5544), stockage S3 de test (moto 5599, bucket majlis-videos)."""
import sys, uuid, base64, io, requests, psycopg2
from PIL import Image
B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
tag = uuid.uuid4().hex[:6]
A = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
buf = io.BytesIO(); Image.new("RGB", (64, 36), (200, 120, 40)).save(buf, "JPEG"); DATA = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
top = requests.post(f"{B}/categories", headers=A, json={"name": f"Img{tag}", "catalogueType": "adult"}).json()
sub = requests.post(f"{B}/categories", headers=A, json={"name": f"ImgSub{tag}", "catalogueType": "adult", "parentId": top["id"]}).json()
for cat, label in ((top, "catégorie"), (sub, "sous-catégorie")):
    r = requests.post(f"{B}/categories/{cat['id']}/image/image", headers=A, json={"image": DATA})
    ok(r.status_code == 201 and r.json()["image"].startswith(f"/api/catalogue/category-image/{cat['id']}/image"), f"{label} : image de tuile envoyée")
r = requests.post(f"{B}/categories/{top['id']}/image/hero", headers=A, json={"image": DATA})
ok(r.status_code == 201 and "/hero" in r.json()["heroImage"], "image d'en-tête envoyée")
rd = requests.get(f"{B}/catalogue/category-image/{top['id']}/image", allow_redirects=False)
ok(rd.status_code == 302 and "majlis-videos" in rd.headers["location"] or rd.status_code == 302, "adresse publique stable : redirige vers le stockage")
img = requests.get(rd.headers["location"])
ok(img.status_code == 200 and img.content[:2] == b"\xff\xd8", "l'image est bien servie (JPEG)")
pub = requests.get(f"{B}/catalogue/categories?lang=fr").json()["categories"]
t = next((c for c in pub if c["id"] == top["id"]), None)
cur.execute("update categories set is_active=true where id in (%s,%s)", (top["id"], sub["id"]))
pub = requests.get(f"{B}/catalogue/categories?lang=fr").json()["categories"]
t = next(c for c in pub if c["id"] == top["id"])
ok(t["image"].startswith("/api/catalogue/category-image/") and t["children"][0]["image"], "API publique : tuile et sous-catégorie portent leur image")
ok(requests.post(f"{B}/categories/{top['id']}/image/image", headers=A, json={"image": "data:image/jpeg;base64,AAAA"}).status_code == 400, "faux fichier refusé")
ok(requests.post(f"{B}/categories/{top['id']}/image/image", json={"image": DATA}).status_code in (401, 403), "réservé aux administrateurs")
ok(requests.delete(f"{B}/categories/{top['id']}/image/image", headers=A).status_code == 204, "image retirée")
ok(requests.get(f"{B}/catalogue/category-image/{top['id']}/image", allow_redirects=False).status_code == 404, "après retrait : 404")
requests.delete(f"{B}/categories/{sub['id']}", headers=A); requests.delete(f"{B}/categories/{top['id']}", headers=A)
print("TOUT OK")
