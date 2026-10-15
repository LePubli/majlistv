"""Étape I1 : apparence (thèmes, brouillon, publication, historique, polices, contraste, sécurité).
Prérequis : API (3055), PG de test (5544), stockage S3 de test (moto, bucket majlis-videos).
Lancement depuis la racine du dépôt : python3 api/tests/test_theme.py"""
import base64, filecmp, os, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
cur.execute("select id from themes where is_active"); ORIGIN = cur.fetchone()[0]

# --- Les deux copies du module de thème sont identiques (API et site)
ok(filecmp.cmp(os.path.join(ROOT, "api/src/themeCss.js"), os.path.join(ROOT, "web/lib/themeCss.js"), shallow=False), "api/src/themeCss.js et web/lib/themeCss.js identiques")

# --- Lecture publique
t0 = requests.get(B + "/theme")
ok(t0.status_code == 200 and ":root{--bg:#0B0906" in t0.json()["css"] and t0.json()["version"], "GET /theme public : thème d'origine")
ok("--btn-bg:var(--accent)" in t0.json()["css"] and "--header-bg:color-mix(in srgb, var(--bg) 92%, transparent)" in t0.json()["css"], "réglages de familles liés aux couleurs de base")
ok(":root:lang(ar){--font-body:'Noto Sans Arabic Variable'" in t0.json()["css"], "polices arabes en premier pour l'arabe")

# --- Droits
ok(requests.get(B + "/admin/theme/schema").status_code == 401, "schéma : connexion requise")
ok(requests.get(B + "/admin/theme/schema", headers=U).status_code == 403, "schéma : réservé à l'administrateur")
s = requests.get(B + "/admin/theme/schema", headers=A).json()
ok(len(s["tokens"]) >= 90 and any(g["id"] == "kids" for g in s["groups"]) and "DM Sans Variable" in s["builtinFonts"], "schéma : réglages, groupes, polices")
ok(requests.put(B + f"/admin/themes/{ORIGIN}/draft", headers=U, json={"values": {}}).status_code == 403, "un membre ne peut pas modifier un thème")

# --- Nouveau thème (copie) et validation
r = requests.post(B + "/admin/themes", headers=A, json={"name": f"Ramadan {tag}", "copyFrom": ORIGIN})
ok(r.status_code == 201 and r.json()["isActive"] is False, "nouveau thème (copie du thème d'origine)")
T = r.json()["id"]
bad = {
    "accent": "red;}body{display:none",   # tentative d'injection CSS
    "btnRadius": "5000px",                # hors limites
    "bg": "@accent",                      # un réglage de base ne reprend rien
    "btnBg": "@inconnu",
    "headerBg": "@accent/150",
    "fontBody": "Comic Sans Inventée",
    "fontSize": "16em",
    "nexistepas": "#fff",
}
r = requests.put(B + f"/admin/themes/{T}/draft", headers=A, json={"values": bad})
ok(r.status_code == 400 and set(r.json()["errors"]) == set(bad), "chaque valeur invalide est refusée avec sa raison")
ok("entre 0 et 999 px" in r.json()["errors"]["btnRadius"], "raison lisible (bornes)")

good = {"accent": "#D4A017", "btnRadius": "12px", "headerBg": "@surface/80", "fontTitle": "Système", "bg": "#0B0906"}
r = requests.put(B + f"/admin/themes/{T}/draft", headers=A, json={"values": good})
ok(r.status_code == 200 and r.json()["hasDraft"] and r.json()["draft"] == {"accent": "#D4A017", "btnRadius": "12px", "headerBg": "@surface/80", "fontTitle": "Système"}, "brouillon enregistré (la valeur d'origine n'est pas stockée)")
ok(r.json()["issues"] == [], "aucune alerte de contraste pour ces réglages")
r = requests.put(B + f"/admin/themes/{T}/draft", headers=A, json={"values": {**good, "btnText": "#E6A739"}})
ok(any(i["fg"] == "btnText" and i["ratio"] < 4.5 for i in r.json()["issues"]), "alerte de contraste : texte du bouton illisible")
requests.put(B + f"/admin/themes/{T}/draft", headers=A, json={"values": good})

# --- Le brouillon n'est pas visible ; publier un thème inactif ne change pas le site
ok(requests.get(B + "/theme").json()["css"] == t0.json()["css"], "brouillon invisible sur le site")
r = requests.post(B + f"/admin/themes/{T}/publish", headers=A)
ok(r.status_code == 200 and r.json()["hasDraft"] is False and r.json()["published"]["accent"] == "#D4A017", "publication du brouillon")
ok(requests.post(B + f"/admin/themes/{T}/publish", headers=A).status_code == 409, "rien à publier sans brouillon")
ok(requests.get(B + "/theme").json()["css"] == t0.json()["css"], "thème publié mais inactif : site inchangé")

# --- Activation
ok(requests.post(B + f"/admin/themes/{T}/activate", headers=A).status_code == 200, "activation")
css = requests.get(B + "/theme").json()["css"]
ok("--accent:#D4A017" in css and "--btn-radius:12px" in css and "--header-bg:color-mix(in srgb, var(--surface) 80%, transparent)" in css, "le site reçoit le nouveau thème")
ok("--font-title-name:system-ui" in css, "police « Système »")
cur.execute("select count(*) from themes where is_active"); ok(cur.fetchone()[0] == 1, "un seul thème actif")
ok(requests.delete(B + f"/admin/themes/{T}", headers=A).status_code == 409, "le thème actif ne peut pas être supprimé")

# --- Historique et restauration
requests.put(B + f"/admin/themes/{T}/draft", headers=A, json={"values": {**good, "accent": "#00AA88"}})
requests.post(B + f"/admin/themes/{T}/publish", headers=A)
v = requests.get(B + f"/admin/themes/{T}/versions", headers=A).json()
ok(len(v) == 2 and v[0]["changed"] == 4, "deux versions dans l'historique, la plus récente en premier")
r = requests.post(B + f"/admin/themes/{T}/versions/{v[1]['id']}/restore", headers=A)
ok(r.status_code == 200 and r.json()["draft"]["accent"] == "#D4A017", "ancienne version recopiée dans le brouillon")
ok("--accent:#00AA88" in requests.get(B + "/theme").json()["css"], "restaurer ne publie pas tout seul")
ok(requests.delete(B + f"/admin/themes/{T}/draft", headers=A).json()["hasDraft"] is False, "brouillon abandonné")
ok(requests.post(B + f"/admin/themes/{T}/versions/999999/restore", headers=A).status_code == 404, "version inconnue")

# --- Import JSON (exporter = lire published) et renommage
r = requests.post(B + "/admin/themes", headers=A, json={"name": f"Import {tag}", "values": {"accent": "#123456", "cardRadius": "@radiusSm"}})
ok(r.status_code == 201 and r.json()["published"] == {"accent": "#123456", "cardRadius": "@radiusSm"}, "thème importé depuis un JSON")
I = r.json()["id"]
ok(requests.post(B + "/admin/themes", headers=A, json={"name": "X", "values": {"accent": "url(javascript:1)"}}).status_code == 400, "import invalide refusé")
ok(requests.patch(B + f"/admin/themes/{I}", headers=A, json={"name": f"Renommé {tag}"}).json()["name"] == f"Renommé {tag}", "renommage")
ok(requests.delete(B + f"/admin/themes/{I}", headers=A).status_code == 204, "suppression d'un thème inactif")

# --- Polices importées
fake = b"wOF2" + os.urandom(2000)
data = "data:font/woff2;base64," + base64.b64encode(fake).decode()
ok(requests.post(B + "/admin/theme/fonts", headers=A, json={"family": "Amiri Test", "file": "data:text/plain;base64," + base64.b64encode(b"hello world").decode()}).status_code == 400, "un fichier qui n'est pas une police est refusé")
ok(requests.post(B + "/admin/theme/fonts", headers=A, json={"family": "x'}body{", "file": data}).status_code == 400, "nom de police dangereux refusé")
ok(requests.post(B + "/admin/theme/fonts", headers=A, json={"family": "DM Sans Variable", "file": data}).status_code == 400, "nom d'une police intégrée refusé")
r = requests.post(B + "/admin/theme/fonts", headers=A, json={"family": f"Amiri {tag}", "weight": "400 700", "file": data})
ok(r.status_code == 201 and r.json()["format"] == "woff2", "police WOFF2 importée")
F = r.json()["id"]
ok(requests.post(B + "/admin/theme/fonts", headers=A, json={"family": f"Amiri {tag}", "weight": "400 700", "file": data}).status_code == 409, "doublon refusé")
f = requests.get(B + f"/theme/fonts/{F}")
ok(f.status_code == 200 and f.content == fake and f.headers["content-type"] == "font/woff2" and "immutable" in f.headers["cache-control"], "fichier de police servi tel quel, longue durée de cache")
css = requests.get(B + "/theme").json()["css"]
ok(f"@font-face{{font-family:'Amiri {tag}';src:url(/api/theme/fonts/{F}) format('woff2');font-weight:400 700" in css, "@font-face ajouté au thème")
r = requests.put(B + f"/admin/themes/{T}/draft", headers=A, json={"values": {"fontBodyAr": f"Amiri {tag}"}})
ok(r.status_code == 200, "une police importée peut être choisie")
ok(requests.delete(B + f"/admin/theme/fonts/{F}", headers=A).status_code == 409, "police utilisée : suppression refusée")
requests.delete(B + f"/admin/themes/{T}/draft", headers=A)
ok(requests.delete(B + f"/admin/theme/fonts/{F}", headers=A).status_code == 204, "police inutilisée supprimée")
ok(requests.get(B + f"/theme/fonts/{F}").status_code == 404, "fichier supprimé")

# --- Journal des actions
cur.execute("select summary from audit_log where route like '/admin/themes/:id/publish' order by at desc limit 1")
ok("publié" in (cur.fetchone() or [""])[0], "publication inscrite au journal des actions")

# --- Maintenance : le thème reste lisible (page de maintenance aux couleurs du site)
requests.put(B + "/admin/features", json={"values": {"maintenance": True}}, headers=A); time.sleep(5.3)
ok(requests.get(B + "/theme").status_code == 200, "GET /theme ouvert pendant la maintenance")
requests.put(B + "/admin/features", json={"values": {"maintenance": False}}, headers=A); time.sleep(5.3)

# --- Remise en état : thème d'origine actif
ok(requests.post(B + f"/admin/themes/{ORIGIN}/activate", headers=A).status_code == 200, "retour au thème d'origine")
ok(requests.get(B + "/theme").json()["css"] == t0.json()["css"], "le site retrouve exactement son apparence d'origine")
requests.delete(B + f"/admin/themes/{T}", headers=A)
print("TOUT EST BON")
