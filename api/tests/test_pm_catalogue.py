"""Éditeur visuel, étape 4b : Catalogue Premium en blocs (page « catalogue », sections « Catalogue : … ») et zones avant/après « toutes les pages » (/conferences/*, /series/*, /catalogue/*).
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_pm_catalogue.py"""
import requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
CAT = ['pm_cat_hero', 'pm_cat_chips', 'pm_cat_rails', 'pm_cat_results', 'pm_cat_cross']
def pages(): return requests.get(B + "/admin/pages", headers=A).json()
for p in pages():
    if p["kind"] == "catalogue" or p["path"] in ("/conferences/*", "/series/*", "/catalogue/*"): requests.delete(B + f"/admin/pages/{p['id']}", headers=A)

# --- Page « catalogue »
ok(requests.post(B + "/admin/pages", json={"kind": "catalogue"}).status_code in (401, 403), "création : connexion obligatoire")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "catalogue"})
ok(r.status_code == 201, "page catalogue créée")
C = r.json()["id"]
ok(r.json()["path"] == "/_catalogue", "adresse interne /_catalogue")
ok([b["type"] for b in r.json()["draft"]["zones"]["main"]] == CAT, "modèle : les 5 sections dans l'ordre d'origine")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "catalogue"}).status_code == 409, "une seule page catalogue")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/_catalogue"}).status_code == 400, "adresse interne non utilisable comme zone avant/après")
ok(requests.get(B + "/pages/view", params={"path": "/_catalogue"}).status_code == 404, "non publiée : rien de public")
r = requests.post(B + f"/admin/pages/{C}/publish", headers=A)
ok(r.status_code == 200, "publication")
v = requests.get(B + "/pages/view", params={"path": "/_catalogue"})
ok(v.status_code == 200 and [b["type"] for b in v.json()["zones"]["main"]] == CAT, "page publique : les 5 sections")
# Réordonner / retirer : le brouillon accepte une autre composition
d = requests.get(B + f"/admin/pages/{C}", headers=A).json()
blocks = d["content"]["zones"]["main"]
mix = [blocks[3], blocks[0], {**blocks[4], "id": "abcd12345"}]
r = requests.put(B + f"/admin/pages/{C}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": mix}}})
ok(r.status_code == 200, "brouillon recomposé (3 sections)")
# Un type de section inconnu est refusé
bad = [{**blocks[0], "type": "pm_cat_inconnu"}]
r = requests.put(B + f"/admin/pages/{C}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": bad}}})
ok(r.status_code == 400, "type inconnu refusé")
# Une zone inconnue est refusée
r = requests.put(B + f"/admin/pages/{C}/draft", headers=A, json={"content": {"meta": {}, "zones": {"before": []}}})
ok(r.status_code == 400, "zone inconnue refusée")
# Section du Catalogue sur une page libre : autorisée
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai catalogue 4b", "slug": "essai-cat-4b"})
if r.status_code == 409:
    for p in pages():
        if p["path"] == "/p/essai-cat-4b": requests.delete(B + f"/admin/pages/{p['id']}", headers=A)
    r = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai catalogue 4b", "slug": "essai-cat-4b"})
P = r.json()["id"]
r = requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [blocks[3]]}}})
ok(r.status_code == 200, "section « résultats » posée sur une page libre")
requests.delete(B + f"/admin/pages/{P}", headers=A)
# Suppression : le Catalogue d'origine revient
requests.delete(B + f"/admin/pages/{C}", headers=A)
ok(requests.get(B + "/pages/view", params={"path": "/_catalogue"}).status_code == 404, "supprimée : le Catalogue d'origine revient")

# --- Zones « toutes les pages de ce genre »
for path in ("/conferences/*", "/series/*", "/catalogue/*"):
    r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": path})
    ok(r.status_code == 201, f"zone avant/après créée : {path}")
    sid = r.json()["id"]
    z = requests.get(B + f"/admin/pages/{sid}", headers=A).json()
    ok(sorted(z["content"]["zones"].keys()) == ["after", "before"], f"{path} : zones avant et après")
    block = {"id": "tx1234567", "type": "text", "props": {"body": {"fr": "Bonjour"}}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
    ok(requests.put(B + f"/admin/pages/{sid}/draft", headers=A, json={"content": {"meta": {}, "zones": {"before": [block], "after": []}}}).status_code == 200, f"{path} : bloc ajouté")
    ok(requests.post(B + f"/admin/pages/{sid}/publish", headers=A).status_code == 200, f"{path} : publication")
    s = requests.get(B + "/pages/slots").json()["slots"]
    ok(path in s and len(s[path]["before"]) == 1, f"{path} : servie par /pages/slots")
    v = requests.get(B + "/pages/view", params={"path": path})
    ok(v.status_code == 200 and len(v.json()["zones"]["before"]) == 1, f"{path} : lisible par /pages/view")
    requests.delete(B + f"/admin/pages/{sid}", headers=A)
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/autre/*"}).status_code == 400, "autre adresse avec * refusée")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/conferences/12/*"}).status_code == 400, "joker au milieu refusé")
print("TOUT OK" if not fails else f"{fails} ÉCHEC(S)")
sys_exit = 1 if fails else 0
raise SystemExit(sys_exit)
