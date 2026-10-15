"""Étape I2 : textes modifiables (superposition aux textes d'origine, validation, rétablissement, droits, journal, maintenance).
Prérequis : API (3055) et PG de test (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_texts.py"""
import sys, time, uuid, requests, psycopg2

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
umail = f"user-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": umail, "password": "Passw0rd-test", "name": "U"})
U = login(umail, "Passw0rd-test")
requests.delete(B + "/admin/texts", headers=A)  # départ propre

# --- Lecture publique et droits
r = requests.get(B + "/texts")
ok(r.status_code == 200 and r.json()["texts"] == {"fr": {}, "en": {}, "ar": {}} and r.json()["version"], "GET /texts public : aucun texte modifié au départ")
v0 = r.json()["version"]
ok(requests.get(B + "/admin/texts").status_code == 401, "liste admin : connexion requise")
ok(requests.get(B + "/admin/texts", headers=U).status_code == 403, "liste admin : réservée à l'administrateur")
ok(requests.put(B + "/admin/texts", headers=U, json={"changes": [{"key": "lgHello", "lang": "fr", "value": "Salut"}]}).status_code == 403, "un membre ne peut pas modifier un texte")
ok(requests.delete(B + "/admin/texts", headers=U).status_code == 403, "un membre ne peut pas tout rétablir")

# --- Validation
def put(changes):
    return requests.put(B + "/admin/texts", headers=A, json={"changes": changes})

ok(put([]).status_code == 400, "envoi vide refusé")
ok(put([{"key": "a b", "lang": "fr", "value": "x"}]).status_code == 400, "clé invalide refusée")
ok(put([{"key": "x'; drop table users;--", "lang": "fr", "value": "x"}]).status_code == 400, "clé dangereuse refusée")
ok(put([{"key": "lgHello", "lang": "de", "value": "x"}]).status_code == 400, "langue inconnue refusée")
ok(put([{"key": "lgHello", "lang": "fr", "value": "x" * 2001}]).status_code == 400, "texte trop long refusé")
r = put([{"key": "lgHello", "lang": "fr", "value": "   "}])
ok(r.status_code == 400 and r.json()["errors"][0]["error"] == "Texte vide", "texte vide refusé (pour revenir à l'original : null)")
ok(put([{"key": "lgHello", "lang": "fr", "value": "a\u0000b"}]).status_code == 400, "caractère de contrôle refusé")
ok(requests.get(B + "/texts").json()["version"] == v0, "rien n'a été enregistré par les envois refusés")

# --- Modification, superposition, version
r = put([
    {"key": "lgHello", "lang": "fr", "value": "Salut{n}, on reprend ?"},
    {"key": "lgHello", "lang": "en", "value": "Hi{n}!"},
    {"key": "lgHello", "lang": "ar", "value": "مرحبا{n}"},
    {"key": "tagline", "lang": "fr", "value": "Ligne 1\nLigne 2 <b>gras</b> & « guillemets »"},
])
ok(r.status_code == 200 and r.json()["set"] == 4 and r.json()["restored"] == 0, "4 textes enregistrés")
t = requests.get(B + "/texts").json()
ok(t["texts"]["fr"]["lgHello"] == "Salut{n}, on reprend ?" and t["texts"]["ar"]["lgHello"] == "مرحبا{n}" and t["texts"]["en"]["lgHello"] == "Hi{n}!", "le site reçoit les trois langues")
ok(t["texts"]["fr"]["tagline"] == "Ligne 1\nLigne 2 <b>gras</b> & « guillemets »", "retours à la ligne, HTML et caractères spéciaux gardés tels quels (texte brut)")
ok(t["version"] != v0, "la version change quand un texte change")
lst = requests.get(B + "/admin/texts", headers=A).json()
ok(len(lst) == 4 and {x["lang"] for x in lst} == {"fr", "en", "ar"} and all(x["updatedAt"] for x in lst), "liste admin des textes modifiés")

# --- Remplacement, doublon dans un même envoi (le dernier gagne)
r = put([{"key": "lgHello", "lang": "fr", "value": "A"}, {"key": "lgHello", "lang": "fr", "value": "B"}])
ok(r.status_code == 200 and requests.get(B + "/texts").json()["texts"]["fr"]["lgHello"] == "B", "même clé envoyée deux fois : la dernière gagne")
cur.execute("select count(*) from site_texts where key='lgHello' and lang='fr'"); ok(cur.fetchone()[0] == 1, "une seule ligne par (clé, langue)")

# --- Rétablir l'original (null)
r = put([{"key": "lgHello", "lang": "fr", "value": None}, {"key": "inconnue", "lang": "fr", "value": None}])
ok(r.status_code == 200 and r.json()["restored"] == 1, "rétablir l'original supprime la ligne (clé absente : sans effet)")
ok("lgHello" not in requests.get(B + "/texts").json()["texts"]["fr"] and "lgHello" in requests.get(B + "/texts").json()["texts"]["en"], "seule la langue visée est rétablie")

# --- Tout rétablir
ok(requests.delete(B + "/admin/texts?lang=xx", headers=A).status_code == 400, "langue inconnue refusée")
r = requests.delete(B + "/admin/texts?lang=en", headers=A)
ok(r.status_code == 200 and r.json()["restored"] == 1 and requests.get(B + "/texts").json()["texts"]["en"] == {}, "rétablir toute une langue")
ok(requests.get(B + "/texts").json()["texts"]["ar"] != {}, "les autres langues sont intactes")
r = requests.delete(B + "/admin/texts", headers=A)
ok(r.status_code == 200 and requests.get(B + "/texts").json()["version"] == v0, "tout rétablir : le site retrouve exactement ses textes d'origine")

# --- Journal des actions
cur.execute("select summary from audit_log where route = '/admin/texts' and method = 'PUT' order by at desc limit 1")
ok("modifié" in (cur.fetchone() or [""])[0], "modification inscrite au journal des actions")
cur.execute("select summary from audit_log where route = '/admin/texts' and method = 'DELETE' order by at desc limit 1")
ok("rétablis" in (cur.fetchone() or [""])[0], "rétablissement inscrit au journal des actions")

# --- Maintenance : les textes restent lisibles (page de maintenance)
requests.put(B + "/admin/features", json={"values": {"maintenance": True}}, headers=A); time.sleep(5.3)
ok(requests.get(B + "/texts").status_code == 200, "GET /texts ouvert pendant la maintenance")
requests.put(B + "/admin/features", json={"values": {"maintenance": False}}, headers=A); time.sleep(5.3)
print("TOUT EST BON")
