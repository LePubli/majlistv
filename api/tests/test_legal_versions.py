"""Pages légales : historique des textes personnalisés (versions numérotées, relecture, remise en place) et matrice de consentement.
Prérequis : API (3055), PG (5544)."""
import os, sys, uuid
import psycopg2, requests

B = os.environ.get("API", "http://127.0.0.1:3055")
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
em = f"legv-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "LV"})
U = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
slug = "cgv"
cur.execute("delete from legal_page_versions where slug=%s", (slug,))
requests.delete(f"{B}/admin/legal/{slug}/custom", headers=A)

ok(requests.get(f"{B}/admin/legal/{slug}/versions", headers=U).status_code == 403, "historique refusé à un membre")
ok(requests.get(f"{B}/admin/legal/{slug}/versions", headers=A).json() == [], "aucune version tant qu'aucun texte personnalisé n'a été enregistré")
r1 = requests.put(f"{B}/admin/legal/{slug}", headers=A, json={"title": "CGV v1", "body": "## A\nPremier texte", "titleEn": "Terms v1", "bodyEn": "First"}).json()
r2 = requests.put(f"{B}/admin/legal/{slug}", headers=A, json={"title": "CGV v2", "body": "## A\nSecond texte"}).json()
ok(r1["version"] == 1 and r2["version"] == 2, "chaque enregistrement crée la version suivante")
v = requests.get(f"{B}/admin/legal/{slug}/versions", headers=A).json()
ok([x["version"] for x in v] == [2, 1] and v[0]["author"] and v[1]["en"] is True and v[0]["en"] is False and "body" not in v[0], "liste : plus récente d'abord, auteur, langues, sans le texte")
d = requests.get(f"{B}/admin/legal/{slug}/versions/1", headers=A).json()
ok(d["body"] == "## A\nPremier texte" and d["bodyEn"] == "First", "relire l'ancien texte en entier")
ok(requests.get(f"{B}/admin/legal/{slug}/versions/99", headers=A).status_code == 404, "version inconnue : 404")
ok(requests.post(f"{B}/admin/legal/{slug}/versions/1/restore", headers=U).status_code == 403, "remise en place refusée à un membre")
ok(requests.post(f"{B}/admin/legal/{slug}/versions/99/restore", headers=A).status_code == 404, "remise d'une version inconnue : 404")
rr = requests.post(f"{B}/admin/legal/{slug}/versions/1/restore", headers=A).json()
ok(rr["ok"] and rr["version"] == 3 and rr["restoredFrom"] == 1, "remise en place : devient la version 3")
ok(requests.get(f"{B}/legal/{slug}").json()["body"] == "## A\nPremier texte", "la page publique montre l'ancien texte remis")
ok(requests.get(f"{B}/legal/{slug}?lang=en").json()["body"] == "First", "…aussi en anglais")
v = requests.get(f"{B}/admin/legal/{slug}/versions", headers=A).json()
ok(len(v) == 3 and v[0]["restoredFrom"] == 1 and v[1]["restoredFrom"] is None, "l'historique garde la trace de la remise en place")
# retour au modèle puis remise : la page redevient personnalisée
requests.delete(f"{B}/admin/legal/{slug}/custom", headers=A)
requests.post(f"{B}/admin/legal/{slug}/versions/2/restore", headers=A)
ok(requests.get(f"{B}/admin/legal/{slug}", headers=A).json()["custom"] is True and requests.get(f"{B}/legal/{slug}").json()["body"] == "## A\nSecond texte", "remise après un retour au modèle")

# Matrice de consentement
ok(requests.get(B + "/admin/legal-consents", headers=U).status_code == 403, "matrice refusée à un membre")
tag = uuid.uuid4().hex[:5]
for i, ver in enumerate(["t-" + tag + "-1", "t-" + tag + "-1", "t-" + tag + "-2"]):
    cur.execute("insert into consents(email, kind, version, text, ip) values (%s,'terms',%s,'texte','1.2.3.4')", (f"c{i}-{tag}@test.local", ver))
m = requests.get(B + "/admin/legal-consents", headers=A).json()
mine = {x["version"]: x for x in m["rows"] if x["version"].startswith("t-" + tag)}
ok(mine["t-%s-1" % tag]["total"] == 2 and mine["t-%s-1" % tag]["members"] == 2 and mine["t-%s-2" % tag]["total"] == 1, "acceptations comptées par type et par version")
ok(m["total"] >= 3 and all("ip" not in x and "email" not in x for x in m["rows"]), "total donné, aucune adresse IP ni e-mail exposée")

cur.execute("delete from consents where version like %s", ("t-" + tag + "%",))
cur.execute("delete from legal_page_versions where slug=%s", (slug,))
requests.delete(f"{B}/admin/legal/{slug}/custom", headers=A)
cur.execute("delete from users where email=%s", (em,))
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
