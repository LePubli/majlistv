"""Éditeur visuel, étape 4 : accueil du thème Premium en blocs (sections « Premium : … »), modèle « premium », menus Premium.
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_pm_home.py"""
import sys, uuid, requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
PM = ['pm_hero', 'pm_universes', 'pm_continue', 'pm_rows', 'pm_spot', 'pm_shorts', 'pm_spot', 'pm_collections', 'pm_kids', 'pm_learn', 'pm_discover']

# Repartir sans accueil en blocs
for p in requests.get(B + "/admin/pages", headers=A).json():
    if p["kind"] == "home": requests.delete(B + f"/admin/pages/{p['id']}", headers=A)

# Modèle classique inchangé
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "home"})
ok(r.status_code == 201, "accueil créé (modèle classique)")
types = [b["type"] for b in r.json()["draft"]["zones"]["main"]]
ok(types[0] == "featured" and not any(t.startswith("pm_") for t in types), "modèle classique : aucune section Premium")
requests.delete(B + f"/admin/pages/{r.json()['id']}", headers=A)

# Modèle Premium : les 11 sections dans l'ordre de l'accueil d'origine
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "home", "template": "premium"})
ok(r.status_code == 201, "accueil créé (modèle premium)")
H = r.json()["id"]
types = [b["type"] for b in r.json()["draft"]["zones"]["main"]]
ok(types == PM, "modèle premium : 11 sections dans l'ordre d'origine")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "home", "template": "nimporte"})
ok(r.status_code == 400, "modèle inconnu refusé")

# Le brouillon se valide et se publie ; la page publique renvoie les sections
r = requests.post(B + f"/admin/pages/{H}/publish", headers=A)
ok(r.status_code == 200, "publication de l'accueil Premium")
v = requests.get(B + "/pages/view", params={"path": "/_home"})
ok(v.status_code == 200 and [b["type"] for b in v.json()["zones"]["main"]] == PM, "page publique : les 11 sections")
vA = requests.get(B + "/pages/view", params={"path": "/_home"}, headers=A)
ok(vA.status_code == 200, "page publique lue avec un compte")

# Réglages des sections validés (nombre de rangées, de vidéos qui défilent…)
d = requests.get(B + f"/admin/pages/{H}", headers=A).json()["content"]
for b in d["zones"]["main"]:
    if b["type"] == "pm_hero": b["props"]["count"] = "3"
    if b["type"] == "pm_rows": b["props"]["max"] = 4
    if b["type"] == "pm_continue": b["props"]["title"] = {"fr": "Ma reprise"}
r = requests.put(B + f"/admin/pages/{H}/draft", headers=A, json={"content": d})
c = {b["type"]: b for b in r.json()["content"]["zones"]["main"]} if r.status_code == 200 else {}
ok(r.status_code == 200 and c["pm_hero"]["props"]["count"] == "3" and c["pm_rows"]["props"]["max"] == 4 and c["pm_continue"]["props"]["title"]["fr"] == "Ma reprise", "réglages des sections enregistrés")
d["zones"]["main"][0]["props"]["count"] = "9"
r = requests.put(B + f"/admin/pages/{H}/draft", headers=A, json={"content": d})
ok(r.status_code == 400, "valeur hors liste refusée (count = 9)")
d["zones"]["main"][0]["props"]["count"] = "5"; d["zones"]["main"][3]["props"]["max"] = 99
r = requests.put(B + f"/admin/pages/{H}/draft", headers=A, json={"content": d})
ok(r.status_code == 400, "nombre de rangées hors limite refusé (99)")

# Sections ordonnables et mélangeables avec les autres blocs (colonnes comprises)
d["zones"]["main"][3]["props"]["max"] = 4
mixed = [d["zones"]["main"][2], {"id": "mix" + uuid.uuid4().hex[:6], "type": "heading", "props": {"title": {"fr": "Titre"}}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}, d["zones"]["main"][0]]
r = requests.put(B + f"/admin/pages/{H}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": mixed}}})
ok(r.status_code == 200 and [b["type"] for b in r.json()["content"]["zones"]["main"]] == ["pm_continue", "heading", "pm_hero"], "ordre libre, mélange avec d'autres blocs")

# Ciblage du public sur une section
mixed[0]["show"] = {"devices": ["m", "t", "d"], "audience": "member"}
requests.put(B + f"/admin/pages/{H}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": mixed}}})
requests.post(B + f"/admin/pages/{H}/publish", headers=A)
vis = requests.get(B + "/pages/view", params={"path": "/_home"}).json()["zones"]["main"]
mem = requests.get(B + "/pages/view", params={"path": "/_home"}, headers=A).json()["zones"]["main"]
ok([b["type"] for b in vis] == ["heading", "pm_hero"] and [b["type"] for b in mem] == ["pm_continue", "heading", "pm_hero"], "section « membres » invisible pour un visiteur")

# Menus : l'API sert les menus affectés (emplacements du haut, de la barre du bas et du pied de page, lus par l'en-tête Premium)
r = requests.get(B + "/menus/resolved")
ok(r.status_code == 200 and isinstance(r.json(), dict), "/menus/resolved répond")

requests.delete(B + f"/admin/pages/{H}", headers=A)
print("\nTOUT OK" if not fails else f"\n{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
