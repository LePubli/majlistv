"""10.4 : brouillon, publication programmée, modification d'une conférence, miniature (3 images ou image envoyée).
Prérequis : API (3055), PG de test (5544) et stockage S3 factice (moto 5599)."""
import base64, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def organizer(name):
    email = f"{name}-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": name})
    cur.execute("update users set role='organizer' where email=%s", (email,))
    return login(email, "Passw0rd-test")


O1, O2 = organizer("orga1"), organizer("orga2")
ADM = login("admin@test.local", "AdminPassw0rd-test")


def yt():
    return "https://youtu.be/" + "".join(__import__("random").choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))


def create(h, **kw):
    body = {"title": "Conf test 10.4", "language": "fr", "videoUrl": yt(), "translateTo": [], **kw}
    return requests.post(B + "/talks", headers=h, json=body)


def listed(tid):
    return any(t["id"] == tid for t in requests.get(B + "/talks?limit=100").json())


def future(minutes=60):
    import datetime
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


# 1) Publié par défaut : visible partout
r = create(O1); ok(r.status_code == 201, "création publiée par défaut")
t_pub = r.json()["id"]
ok(listed(t_pub) and requests.get(f"{B}/talks/{t_pub}").status_code == 200, "conférence publiée visible dans le catalogue et sur sa page")

# 2) Brouillon : invisible du public, visible du propriétaire et de l'admin, pas d'un autre organisateur
r = create(O1, publication="draft"); ok(r.status_code == 201, "création en brouillon")
t_dr = r.json()["id"]
ok(not listed(t_dr), "brouillon absent du catalogue")
ok(requests.get(f"{B}/talks/{t_dr}").status_code == 404, "brouillon : page introuvable pour un visiteur")
ok(requests.get(f"{B}/talks/{t_dr}", headers=O2).status_code == 404, "brouillon : introuvable pour un autre organisateur")
ok(requests.get(f"{B}/talks/{t_dr}", headers=O1).status_code == 200 and requests.get(f"{B}/talks/{t_dr}", headers=ADM).status_code == 200, "brouillon : visible du propriétaire et de l'admin")
ok(not any(h["id"] == t_dr for h in requests.get(B + "/search", params={"q": "Conf test"}).json().get("hits", requests.get(B + "/search", params={"q": "Conf test"}).json().get("results", []))), "brouillon absent de la recherche")
mine = {t["id"]: t for t in requests.get(B + "/me/talks", headers=O1).json()}
ok(mine[t_dr]["publication"] == "draft" and mine[t_dr]["visible"] is False, "/me/talks : publication=draft, visible=false")

# 3) Programmation
r = create(O1, publication="scheduled"); ok(r.status_code == 400, "programmée sans date refusée")
r = create(O1, publication="scheduled", publishAt="2020-01-01T10:00:00Z"); ok(r.status_code == 400, "programmée dans le passé refusée")
r = create(O1, publication="scheduled", publishAt=future()); ok(r.status_code == 201, "programmée dans le futur acceptée")
t_sc = r.json()["id"]
ok(not listed(t_sc) and requests.get(f"{B}/talks/{t_sc}").status_code == 404, "programmée : invisible avant l'heure")
cur.execute("update talks set publish_at = now() - interval '1 minute' where id=%s", (t_sc,))
ok(listed(t_sc) and requests.get(f"{B}/talks/{t_sc}").status_code == 200, "programmée : visible dès l'heure passée (sans tâche planifiée)")

# 4) Modification
r = requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"title": "Titre modifié", "speaker": "Cheikh X", "description": "Nouvelle description", "access": "premium"})
ok(r.status_code == 200, "PATCH informations")
cur.execute("select title, speaker, description, access from talks where id=%s", (t_dr,))
ok(cur.fetchone() == ("Titre modifié", "Cheikh X", "Nouvelle description", "premium"), "informations enregistrées")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O2, json={"title": "pirate"}).status_code == 404, "un autre organisateur ne peut pas modifier")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={}).status_code == 400, "PATCH vide refusé")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"title": ""}).status_code == 400, "titre vide refusé")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"categoryId": 99999}).status_code == 400, "catégorie inconnue refusée")
cat = requests.get(B + "/categories").json()[0]["id"]
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"categoryId": cat}).status_code == 200 and requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"categoryId": None}).status_code == 200, "catégorie ajoutée puis retirée")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"publication": "scheduled"}).status_code == 400, "passage en programmée sans date refusé")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"publication": "scheduled", "publishAt": future(120)}).status_code == 200, "brouillon -> programmée")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"publication": "published"}).status_code == 200 and listed(t_dr), "programmée -> publiée : visible")
cur.execute("select publish_at from talks where id=%s", (t_dr,)); ok(cur.fetchone()[0] is None, "date de publication effacée une fois publiée")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"publication": "draft"}).status_code == 200 and not listed(t_dr), "publiée -> brouillon : retirée du catalogue")

# 5) Miniature personnalisée
PNG = base64.b64encode(bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")).decode()
r = requests.post(f"{B}/talks/{t_dr}/poster", headers=O1, json={"image": "data:image/png;base64," + PNG})
ok(r.status_code == 201 and "posters/" in r.json()["posterUrl"], "image envoyée enregistrée")
cur.execute("select poster_key from talks where id=%s", (t_dr,)); k1 = cur.fetchone()[0]
ok(k1.startswith(f"posters/{t_dr}/custom-"), "clé de stockage dédiée")
ok(requests.get(r.json()["posterUrl"]).status_code == 200, "image lisible via le lien temporaire")
ok(requests.post(f"{B}/talks/{t_dr}/poster", headers=O1, json={"image": "data:image/png;base64," + base64.b64encode(b"pas une image").decode()}).status_code == 400, "faux PNG refusé")
ok(requests.post(f"{B}/talks/{t_dr}/poster", headers=O1, json={"image": "data:text/html;base64,PGI+"}).status_code == 400, "type non image refusé")
ok(requests.post(f"{B}/talks/{t_dr}/poster", headers=O2, json={"image": "data:image/png;base64," + PNG}).status_code == 404, "autre organisateur refusé")
requests.post(f"{B}/talks/{t_dr}/poster", headers=O1, json={"image": "data:image/png;base64," + PNG})
cur.execute("select poster_key from talks where id=%s", (t_dr,)); k2 = cur.fetchone()[0]
ok(k2 != k1, "nouvelle image : nouvelle clé (l'ancienne est supprimée)")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"posterChoice": -1}).status_code == 200, "retour à la miniature de la plateforme")
cur.execute("select poster_key from talks where id=%s", (t_dr,)); ok(cur.fetchone()[0] is None, "poster_key vidé")

# 6) Choix parmi 3 images (candidats posés comme le fait le worker)
cur.execute("update talks set poster_candidates = %s where id=%s", ([f"hls/{t_dr}/c{i}.jpg" for i in (1, 2, 3)], t_dr))
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"posterChoice": 1}).status_code == 200, "choix de l'image 2")
m = {t["id"]: t for t in requests.get(B + "/me/talks", headers=O1).json()}[t_dr]
ok(m["posterChoice"] == 1 and len(m["posterChoices"]) == 3 and "c2.jpg" in m["posterUrl"], "/me/talks : choix et 3 liens")
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"posterChoice": 2}).status_code == 200, "changement pour l'image 3")
cur.execute("update talks set source='upload' where id=%s", (t_dr,))
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"posterChoice": -1}).status_code == 400, "vidéo envoyée : pas de retour à une miniature de plateforme")
cur.execute("update talks set source='youtube' where id=%s", (t_dr,))
cur.execute("update talks set poster_candidates='{}' where id=%s", (t_dr,))
ok(requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"posterChoice": 0}).status_code == 400, "image inexistante refusée")

# 7) Bibliothèque : un brouillon n'apparaît ni en favoris ni en « continuer »
U = organizer("viewer")  # simple compte (rôle organisateur suffit pour les routes de bibliothèque)
cur.execute("update talks set publication='published' where id=%s", (t_dr,))
requests.put(f"{B}/me/favorites/{t_dr}", headers=U)
ok(any(x["id"] == t_dr for x in requests.get(B + "/me/favorites", headers=U).json()), "favori visible quand publié")
requests.patch(f"{B}/talks/{t_dr}", headers=O1, json={"publication": "draft"})
ok(not any(x["id"] == t_dr for x in requests.get(B + "/me/favorites", headers=U).json()), "favori masqué quand la conférence repasse en brouillon")

# 8) Suppression : nettoie aussi les images envoyées
requests.post(f"{B}/talks/{t_dr}/poster", headers=O1, json={"image": "data:image/png;base64," + PNG})
ok(requests.delete(f"{B}/talks/{t_dr}", headers=O1).status_code == 204, "suppression")
print("\nTOUT EST OK")
