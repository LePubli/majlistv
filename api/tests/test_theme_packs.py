"""Lot T : thèmes uploadables Mejliss (installation, activation, brouillons, retour en arrière, refus des thèmes dangereux).
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_theme_packs.py"""
import base64, io, json, re, zipfile
import requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def data(buf): return "data:application/zip;base64," + base64.b64encode(buf).decode()
def mkzip(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        for n, d in files.items(): z.writestr(n, d)
    return b.getvalue()
def pages(): return {p["path"]: p for p in requests.get(B + "/admin/pages", headers=A).json()}
def theme_css(): return requests.get(B + "/theme").json()["css"]

# --- Nettoyage d'un essai précédent
requests.post(B + "/admin/theme-packs/deactivate", headers=A)
for t in requests.get(B + "/admin/theme-packs", headers=A).json():
    if t["slug"] in ("aurore", "essai-lot-t"): requests.delete(B + f"/admin/theme-packs/{t['slug']}", headers=A)
for p in pages().values():
    if p["path"] in ("/p/a-propos", "/_global/aurore-infolettre") : requests.delete(B + f"/admin/pages/{p['id']}", headers=A)
for t in requests.get(B + "/admin/page-templates", headers=A).json():
    if t["name"].startswith("Aurore"): requests.delete(B + f"/admin/page-templates/{t['id']}", headers=A)

# --- Accès réservé aux administrateurs
for m, u in [("get", "/admin/theme-packs"), ("get", "/admin/theme-packs/example.zip"), ("get", "/admin/theme-packs/guide.md"), ("post", "/admin/theme-packs/inspect"), ("post", "/admin/theme-packs/aurore/activate"), ("post", "/admin/theme-packs/deactivate")]:
    ok(getattr(requests, m)(B + u).status_code in (401, 403), f"{m.upper()} {u} : connexion obligatoire")

# --- Le kit
z = requests.get(B + "/admin/theme-packs/example.zip", headers=A)
ok(z.status_code == 200 and z.headers["content-type"].startswith("application/zip"), "exemple téléchargeable")
names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
ok("theme.json" in names and "theme.css" in names and "GUIDE-IA.md" in names and any(n.startswith("pages/") for n in names), "l'exemple contient theme.json, CSS, pages et le guide")
g = requests.get(B + "/admin/theme-packs/guide.md", headers=A)
ok(g.status_code == 200 and "Guide IA" in g.text and "/conferences/[slug]" in g.text and "/studio/(module-" not in g.text, "guide téléchargeable, avec les routes")
ok("`/pricing`" in g.text and "pm_hero" in g.text and "`accent`" in g.text and "stripe" in g.text.lower(), "le guide cite pages, blocs, jetons et fonctions")

# --- Contrôle sans installer
r = requests.post(B + "/admin/theme-packs/inspect", headers=A, json={"file": data(z.content)}).json()
ok(r["ok"] and r["summary"]["id"] == "aurore" and r["summary"]["pages"] == 7, "inspection de l'exemple : valide, 7 pages")
base = {n: zipfile.ZipFile(io.BytesIO(z.content)).read(n) for n in names}
def variant(**chg):
    f = dict(base)
    for k, v in chg.items():
        f[k] = v
    return f
def bad(label, files, needle):
    r = requests.post(B + "/admin/theme-packs/inspect", headers=A, json={"file": data(mkzip(files))}).json()
    ok(r["ok"] is False and any(needle in e for e in r["errors"]), f"refusé : {label}")
    ins = requests.post(B + "/admin/theme-packs", headers=A, json={"file": data(mkzip(files))})
    ok(ins.status_code == 400, f"  et non installé : {label}")
f = dict(base); f["theme.css"] = b"@import url(https://evil.example/x.css); body{color:red}"; bad("@import", f, "@import")
f = dict(base); f["theme.css"] = b"body{background:url(https://evil.example/x.png)}"; bad("url() externe", f, "url()")
f = dict(base); f["theme.css"] = b"a{width:expression(alert(1))}"; bad("expression()", f, "expression")
f = dict(base); f["theme.css"] = b"a{background:url(../secret.png)}"; bad("url() avec ..", f, "url()")
f = dict(base); f["theme.css"] = b"@\\69mport 'x.css';"; bad("@import caché par un échappement", f, "@import")
f = dict(base); f["run.js"] = b"alert(1)"; bad("fichier .js", f, "non permis")
f = dict(base); f["assets/faux.png"] = b"pas une image"; bad("fausse image", f, "vraie image")
f = dict(base); m = json.loads(base["theme.json"]); m["extra"] = 1; f["theme.json"] = json.dumps(m).encode(); bad("clé inconnue du manifeste", f, "clé inconnue")
f = dict(base); m = json.loads(base["theme.json"]); m["tokens"]["accent"] = "red; } body { display:none"; f["theme.json"] = json.dumps(m).encode(); bad("couleur invalide", f, "accent")
f = dict(base); m = json.loads(base["theme.json"]); m["pages"]["slots"]["/page-qui-nexiste-pas"] = "pages/pricing.json"; f["theme.json"] = json.dumps(m).encode(); bad("adresse de page inconnue", f, "adresse inconnue")
f = dict(base); p = json.loads(base["pages/home.json"]); p["zones"]["main"][0]["type"] = "script"; f["pages/home.json"] = json.dumps(p).encode(); bad("bloc inconnu", f, "pages/home.json")
f = dict(base); p = json.loads(base["pages/home.json"]); p["zones"]["main"][0]["props"]["image"] = "pack:assets/absente.webp"; f["pages/home.json"] = json.dumps(p).encode(); bad("image de page absente", f, "introuvable")
f = dict(base); p = json.loads(base["pages/pricing.json"]); p["zones"]["before"][0]["props"]["title"] = {"fr": "<img src=x onerror=alert(1)>" * 20}; f["pages/pricing.json"] = json.dumps(p).encode(); r0 = requests.post(B + "/admin/theme-packs/inspect", headers=A, json={"file": data(mkzip(f))}).json(); ok(r0["ok"] is False, "refusé : texte trop long")
f = dict(base); f["../evil.json"] = b"{}"
try: r0 = requests.post(B + "/admin/theme-packs/inspect", headers=A, json={"file": data(mkzip(f))}).json(); ok(r0["ok"] is False, "refusé : chemin avec ..")
except Exception as e: ok(False, f"chemin avec .. : {e}")
ok(requests.post(B + "/admin/theme-packs/inspect", headers=A, json={"file": data(b"ceci n'est pas un zip")}).json()["ok"] is False, "refusé : fichier qui n'est pas un .zip")
ok(requests.post(B + "/admin/theme-packs/inspect", headers=A, json={"file": "pas-une-data-url"}).status_code == 400, "refusé : données mal formées")

# --- Installation
before_css = theme_css()
r = requests.post(B + "/admin/theme-packs", headers=A, json={"file": data(z.content)})
ok(r.status_code == 201 and r.json()["slug"] == "aurore" and r.json()["active"] is False, "installation (inactif)")
ok(theme_css() == before_css, "installer ne change rien au site")
lst = requests.get(B + "/admin/theme-packs", headers=A).json()
ok(any(t["slug"] == "aurore" and t["pages"] == 7 and t["globals"] == 1 and t["templates"] == 2 and t["fonts"] == 1 for t in lst), "liste : résumé exact")
img = requests.get(B + "/theme-pack/aurore/assets/hero.webp")
ok(img.status_code == 200 and img.headers["content-type"] == "image/webp", "image du thème servie")
ok(requests.get(B + "/theme-pack/aurore/theme.css").status_code == 404, "fichier texte non servi")
ok(requests.get(B + "/theme-pack/aurore/../../etc/passwd").status_code in (400, 404), "chemin hors du thème refusé")
r2 = requests.post(B + "/admin/theme-packs", headers=A, json={"file": data(z.content)})
ok(r2.status_code == 201, "réinstaller la même version : remplace")

# --- Activation
r = requests.post(B + "/admin/theme-packs/aurore/activate", headers=A, json={"applyPages": True})
rep = r.json().get("report", {})
ok(r.status_code == 200 and rep.get("applied"), "activation : rapport")
css = theme_css()
ok("--accent:#FF8A5B" in css and re.search(r"html\[data-skin\]\[lang\]\[dir\]\{[^}]*--accent:#FF8A5B", css), "couleur du thème appliquée, avec un sélecteur plus fort que les habillages")
ok("html[data-skin][lang][dir] body{--btn-radius:14px}" in css, "réglages « famille d'éléments » (boutons…) aussi")
ok("Thème Mejliss" in css and ".pb-hero" in css and "/api/theme-pack/aurore/" not in css.replace("/api/theme/fonts", ""), "feuille de style du thème ajoutée (sans commentaires, sans url externe)")
ok("Aurore Serif" in css, "police du thème déclarée")
P = pages()
for path in ("/_home", "/_catalogue", "/_watch", "/_layout", "/pricing", "/legal/cgv", "/p/a-propos"):
    ok(path in P and P[path]["hasDraft"] and not P[path]["live"], f"{path} : brouillon, non publié")
ok("/_global/aurore-infolettre" in P and P["/_global/aurore-infolettre"]["live"], "section globale créée et publiée")
ok(not requests.get(B + "/pages/slots").json()["slots"].get("/pricing"), "rien n'est publié sur /pricing")
tpl = [t["name"] for t in requests.get(B + "/admin/page-templates", headers=A).json()]
ok("Aurore : bannière" in tpl and "Aurore : page d'atterrissage" in tpl, "modèles ajoutés")
st = requests.get(B + "/admin/theme-packs", headers=A).json()
ok([t["slug"] for t in st if t["active"]] == ["aurore"], "un seul thème actif")
# Les images des pages sont devenues de vraies images du site
d = requests.get(B + f"/admin/pages/{P['/_home']['id']}", headers=A).json()
hero = json.dumps(d.get("draft", d))
ok("pack:" not in hero and '"image": "' in hero.replace('":"', '": "'), "images du thème converties en images du site")
# Réactivation : brouillons mis à jour, rien en double
r = requests.post(B + "/admin/theme-packs/aurore/activate", headers=A, json={"applyPages": True}).json()
ok(any("existe déjà" in s for s in r["report"]["skipped"]), "réactivation : page, globale et modèles existants conservés")
ok(len([t for t in requests.get(B + "/admin/page-templates", headers=A).json() if t["name"].startswith("Aurore")]) == 2, "pas de modèle en double")

# --- Suppression d'un thème actif interdite
ok(requests.delete(B + "/admin/theme-packs/aurore", headers=A).status_code == 409, "supprimer un thème actif : refusé")

# --- Désactivation
r = requests.post(B + "/admin/theme-packs/deactivate", headers=A)
ok(r.status_code == 200, "désactivation")
ok("Thème Mejliss" not in theme_css() and "--accent:#FF8A5B" not in theme_css(), "le thème n'est plus appliqué")
ok(requests.post(B + "/admin/theme-packs/deactivate", headers=A).status_code == 409, "désactiver sans thème actif : 409")
ok(requests.delete(B + "/admin/theme-packs/aurore", headers=A).status_code == 200, "suppression")
ok(requests.get(B + "/theme-pack/aurore/assets/hero.webp").status_code == 404, "fichiers supprimés avec le thème")

# --- Activation sans les pages
requests.post(B + "/admin/theme-packs", headers=A, json={"file": data(z.content)})
requests.delete(B + f"/admin/pages/{pages()['/p/a-propos']['id']}", headers=A)
r = requests.post(B + "/admin/theme-packs/aurore/activate", headers=A, json={"applyPages": False}).json()
ok(not any("a-propos" in s for s in r["report"]["applied"]) and "/p/a-propos" not in pages(), "applyPages=false : aucune page touchée")
requests.post(B + "/admin/theme-packs/deactivate", headers=A)
requests.delete(B + "/admin/theme-packs/aurore", headers=A)
for p in pages().values():
    if p["path"] in ("/p/a-propos", "/_global/aurore-infolettre"): requests.delete(B + f"/admin/pages/{p['id']}", headers=A)
for t in requests.get(B + "/admin/page-templates", headers=A).json():
    if t["name"].startswith("Aurore"): requests.delete(B + f"/admin/page-templates/{t['id']}", headers=A)
print("\n%d échec(s)" % fails); raise SystemExit(1 if fails else 0)
