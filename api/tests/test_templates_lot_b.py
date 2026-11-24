"""Éditeur visuel, lot B : modèles enregistrés (sections, pages) et sections globales.
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_templates_lot_b.py"""
import requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def txt(i, t): return {"id": i, "type": "text", "props": {"body": {"fr": t}}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
for t in requests.get(B + "/admin/page-templates", headers=A).json():
    if t["name"].startswith("Essai lot B"): requests.delete(B + f"/admin/page-templates/{t['id']}", headers=A)
for p in requests.get(B + "/admin/pages", headers=A).json():
    if p["path"] in ("/_global/essai-lot-b", "/p/essai-lot-b-modele", "/p/essai-lot-b-copie", "/p/essai-lot-b-glob"): requests.delete(B + f"/admin/pages/{p['id']}", headers=A)

# --- Modèles enregistrés
ok(requests.get(B + "/admin/page-templates").status_code in (401, 403), "liste : connexion obligatoire")
r = requests.post(B + "/admin/page-templates", headers=A, json={"kind": "section", "name": "Essai lot B section", "content": {"meta": {}, "zones": {"main": [txt("bb0000001", "Section modèle")]}}})
ok(r.status_code == 201 and r.json()["kind"] == "section", "section enregistrée comme modèle")
T1 = r.json()["id"]
bad = requests.post(B + "/admin/page-templates", headers=A, json={"kind": "section", "name": "Essai lot B faux", "content": {"meta": {}, "zones": {"main": [{"id": "bb0000009", "type": "inconnu", "props": {}}]}}})
ok(bad.status_code == 400, "modèle avec un bloc inconnu refusé")
ok(requests.post(B + "/admin/page-templates", headers=A, json={"kind": "page", "name": "Essai lot B sans type", "content": {"meta": {}, "zones": {"main": []}}}).status_code == 400, "modèle de page : type de page obligatoire")
r = requests.post(B + "/admin/page-templates", headers=A, json={"kind": "page", "pageKind": "custom", "name": "Essai lot B page", "description": "deux blocs", "content": {"meta": {}, "zones": {"main": [txt("bb0000002", "Un"), txt("bb0000003", "Deux")]}}})
ok(r.status_code == 201 and r.json()["pageKind"] == "custom", "page enregistrée comme modèle")
T2 = r.json()["id"]
ok(any(t["id"] == T2 for t in requests.get(B + "/admin/page-templates", headers=A).json()), "modèles listés")
# Création d'une page à partir du modèle
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai lot B copie", "slug": "essai-lot-b-copie", "templateId": T2})
ok(r.status_code == 201 and len(r.json()["draft"]["zones"]["main"]) == 2, "nouvelle page créée à partir du modèle (2 blocs)")
requests.delete(B + f"/admin/pages/{r.json()['id']}", headers=A)
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/pricing", "templateId": T2}).status_code in (400, 409), "modèle d'un autre type de page refusé")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai lot B x", "slug": "essai-lot-b-x", "templateId": 999999}).status_code == 404, "modèle inconnu : 404")
ok(requests.delete(B + f"/admin/page-templates/{T1}", headers=A).status_code == 200 and requests.delete(B + f"/admin/page-templates/{T2}", headers=A).status_code == 200, "modèles supprimés")
ok(requests.delete(B + "/admin/page-templates/999999", headers=A).status_code == 404, "suppression d'un modèle inconnu : 404")

# --- Sections globales
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "global", "title": "Essai lot B", "slug": "essai-lot-b"})
ok(r.status_code == 201 and r.json()["path"] == "/_global/essai-lot-b", "section globale créée (/_global/…)")
G = r.json()["id"]
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "global", "title": "Essai lot B", "slug": "essai-lot-b"}).status_code == 409, "nom déjà pris : refusé")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "global"}).status_code == 400, "nom obligatoire")
ok(requests.put(B + f"/admin/pages/{G}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [txt("bb0000004", "Texte global")]}}}).status_code == 200, "contenu de la section globale")
ok(requests.post(B + f"/admin/pages/{G}/publish", headers=A).status_code == 200, "section globale publiée")
v = requests.get(B + "/pages/view", params={"path": "/_global/essai-lot-b"})
ok(v.status_code == 200 and v.json()["zones"]["main"][0]["props"]["body"]["fr"] == "Texte global", "contenu lisible par le site")
ref = {"id": "bb0000005", "type": "global", "props": {"ref": "essai-lot-b"}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai lot B glob", "slug": "essai-lot-b-glob"}); P = r.json()["id"]
ok(requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [ref]}}}).status_code == 200, "bloc « section globale » posé sur une page")
ok(requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [{**ref, "props": {"ref": "Pas Valide"}}]}}}).status_code == 400, "nom de section globale invalide refusé")
ok(requests.put(B + f"/admin/pages/{G}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [{**ref, "id": "bb0000006"}]}}}).status_code == 400, "une section globale ne peut pas en contenir une autre")
requests.delete(B + f"/admin/pages/{P}", headers=A)
requests.delete(B + f"/admin/pages/{G}", headers=A)
ok(requests.get(B + "/pages/view", params={"path": "/_global/essai-lot-b"}).status_code == 404, "supprimée : introuvable")
print("TOUT OK" if not fails else f"{fails} ÉCHEC(S)")
raise SystemExit(1 if fails else 0)
