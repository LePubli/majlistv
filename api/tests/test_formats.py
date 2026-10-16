"""Étape B — Formats de contenu et page Catalogue : liste, droits, ajout/renommage/suppression, format d'une conférence
(défaut « conférence », modification, modification en lot), rangées du catalogue.
Prérequis : API (3055) et PG de test (5544)."""
import random, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def yt():
    return "https://youtu.be/" + "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))


cur.execute("delete from formats where slug like 'test-%'")  # reliquat d'un essai interrompu
ADM = login("admin@test.local", "AdminPassw0rd-test")
email = f"orga-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (email,))
ORG = login(email, "Passw0rd-test")

# Liste publique : les 6 formats de départ, dans l'ordre
fm = requests.get(B + "/formats").json()
slugs = [f["slug"] for f in fm]
ok(slugs[:6] == ["conference", "cours", "recitation", "documentaire", "dessin-anime", "rappel"], "liste publique : 6 formats de départ dans l'ordre")
ok(all(f["nameFr"] and f["nameEn"] and f["nameAr"] for f in fm[:6]), "noms en français, anglais et arabe")
byslug = {f["slug"]: f["id"] for f in fm}

# Droits
ok(requests.post(B + "/formats", headers=ORG, json={"slug": "x-test", "nameFr": "X"}).status_code == 403, "organisateur : ajout refusé")
ok(requests.post(B + "/formats", json={"slug": "x-test", "nameFr": "X"}).status_code in (401, 403), "visiteur : ajout refusé")
ok(requests.get(B + "/formats/stats", headers=ORG).status_code == 403, "stats réservées aux admins")

# Ajout / doublon / code invalide / renommage / suppression
code = "test-" + uuid.uuid4().hex[:6]
r = requests.post(B + "/formats", headers=ADM, json={"slug": code, "nameFr": "Format test", "nameEn": "Test format", "nameAr": "تجربة"})
ok(r.status_code == 201 and r.json()["position"] > 60, "ajout (placé en dernier)")
fid = r.json()["id"]
ok(requests.post(B + "/formats", headers=ADM, json={"slug": code, "nameFr": "Autre"}).status_code == 409, "doublon de code refusé")
ok(requests.post(B + "/formats", headers=ADM, json={"slug": "Code Invalide!", "nameFr": "X"}).status_code == 400, "code invalide refusé")
ok(requests.post(B + "/formats", headers=ADM, json={"slug": "vide-test", "nameFr": "  "}).status_code == 400, "nom vide refusé")
r = requests.patch(f"{B}/formats/{fid}", headers=ADM, json={"nameFr": "Format renommé", "position": 5})
ok(r.status_code == 200 and r.json()["nameFr"] == "Format renommé" and r.json()["slug"] == code, "renommage (le code ne change pas)")
ok(requests.patch(f"{B}/formats/{fid}", headers=ORG, json={"nameFr": "x"}).status_code == 403, "renommage refusé à l'organisateur")
ok(requests.patch(f"{B}/formats/999999", headers=ADM, json={"nameFr": "x"}).status_code == 404, "format inconnu : 404")

# Conférence : format par défaut, choix, modification, format inconnu
t1 = requests.post(B + "/talks", headers=ORG, json={"title": "Conf défaut", "language": "fr", "translateTo": [], "videoUrl": yt()})
ok(t1.status_code == 201, "création sans format")
t1 = t1.json()["id"]
g = requests.get(f"{B}/talks/{t1}", headers=ORG).json()
ok(g["format"] == "conference" and g["formatId"] == byslug["conference"], "format par défaut : conférence")
t2 = requests.post(B + "/talks", headers=ORG, json={"title": "Cours test", "language": "fr", "translateTo": [], "videoUrl": yt(), "formatId": byslug["cours"]}).json()["id"]
ok(requests.get(f"{B}/talks/{t2}", headers=ORG).json()["format"] == "cours", "création avec un format")
ok(requests.post(B + "/talks", headers=ORG, json={"title": "Format bidon", "language": "fr", "translateTo": [], "videoUrl": yt(), "formatId": 987654}).status_code == 400, "format inconnu refusé à la création")
ok(requests.patch(f"{B}/talks/{t1}", headers=ORG, json={"formatId": byslug["rappel"]}).status_code == 200, "modification du format")
ok(requests.get(f"{B}/talks/{t1}", headers=ORG).json()["format"] == "rappel", "format modifié")
ok(requests.patch(f"{B}/talks/{t1}", headers=ORG, json={"formatId": 987654}).status_code == 400, "format inconnu refusé à la modification")
ok(requests.patch(f"{B}/talks/{t1}", headers=ORG, json={"formatId": None}).status_code == 200 and requests.get(f"{B}/talks/{t1}", headers=ORG).json()["format"] is None, "format retiré")

# Modification en lot
rb = requests.post(B + "/talks/bulk", headers=ORG, json={"ids": [t1, t2], "changes": {"formatId": byslug["recitation"]}})
ok(rb.status_code == 200, "modification en lot : " + str(rb.status_code))
ok(all(requests.get(f"{B}/talks/{t}", headers=ORG).json()["format"] == "recitation" for t in (t1, t2)), "lot : format appliqué aux deux")

# Cartes : le format est dans la liste publique et l'accueil
lst = requests.get(B + "/talks?limit=100").json()
ok(any(x["id"] == t1 and x.get("format") == "recitation" for x in lst), "liste publique : format présent")
home = requests.get(B + "/home").json()
ok(any(x.get("format") == "recitation" for r_ in home["rows"] for x in r_.get("talks", [])), "accueil : format présent sur les vignettes")

# Catalogue : une rangée par format qui contient des contenus
requests.patch(f"{B}/talks/{t1}", headers=ORG, json={"formatId": byslug["rappel"]})
cat = requests.get(B + "/catalogue").json()
keys = [r_["key"] for r_ in cat["rows"]]
ok(keys[0] == "new" and "format:rappel" in keys and "format:recitation" in keys, "catalogue : Nouveautés puis une rangée par format utilisé")
ok("format:dessin-anime" not in keys, "catalogue : pas de rangée vide")
ok(all(r_["format"]["nameFr"] for r_ in cat["rows"][1:]) and all(r_["total"] >= len(r_["talks"]) for r_ in cat["rows"][1:]), "catalogue : nom et total par rangée")
ok(cat["hero"]["items"] and cat["hero"]["items"][0]["title"], "catalogue : bannière à la une (repli sur la plus récente)")
rf = requests.get(B + "/talks", params={"format": "rappel", "limit": 100}).json()
ok(rf and all(x["format"] == "rappel" for x in rf) and any(x["id"] == t1 for x in rf), "liste ?format=rappel : seulement ce format")
ok(requests.get(B + "/talks", params={"format": "inconnu-zz"}).json() == [], "liste ?format inconnu : vide")
ok(requests.get(B + "/talks", params={"format": "Bad Code!"}).status_code == 400, "liste ?format invalide : 400")
cur.execute("update talks set publication='draft' where id=%s", (t1,))
cat = requests.get(B + "/catalogue").json()
ok(not any(x["id"] == t1 for r_ in cat["rows"] for x in r_["talks"]), "catalogue : un brouillon n'apparaît pas")

# Suppression : les contenus restent, sans format
ok(requests.delete(f"{B}/formats/{fid}", headers=ORG).status_code == 403, "suppression refusée à l'organisateur")
requests.patch(f"{B}/talks/{t2}", headers=ORG, json={"formatId": fid})
ok(requests.delete(f"{B}/formats/{fid}", headers=ADM).status_code == 204, "suppression par l'admin")
ok(requests.get(f"{B}/talks/{t2}", headers=ORG).json()["format"] is None, "le contenu reste en ligne, sans format")
ok(requests.delete(f"{B}/formats/{fid}", headers=ADM).status_code == 404, "format déjà supprimé : 404")
print("\nFormats : tout est bon")
