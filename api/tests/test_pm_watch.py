"""Éditeur visuel, étape 6b : fiche vidéo en blocs (page « watch », sections « Fiche : … »).
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_pm_watch.py"""
import requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
W = ['w_stage', 'w_notices', 'w_grid', 'w_next', 'w_books']
def pages(): return requests.get(B + "/admin/pages", headers=A).json()
for p in pages():
    if p["kind"] == "watch" or p["path"] == "/p/essai-watch-6b": requests.delete(B + f"/admin/pages/{p['id']}", headers=A)

ok(requests.post(B + "/admin/pages", json={"kind": "watch"}).status_code in (401, 403), "création : connexion obligatoire")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "watch"})
ok(r.status_code == 201 and r.json()["path"] == "/_watch", "page fiche vidéo créée, adresse interne /_watch")
Wid = r.json()["id"]
ok([b["type"] for b in r.json()["draft"]["zones"]["main"]] == W, "modèle : les 5 sections dans l'ordre d'origine")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "watch"}).status_code == 409, "une seule fiche en blocs")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/_watch"}).status_code == 400, "adresse interne non utilisable comme zone avant/après")
ok(requests.get(B + "/pages/view", params={"path": "/_watch"}).status_code == 404, "non publiée : rien de public")

d = requests.get(B + f"/admin/pages/{Wid}", headers=A).json()
blocks = d["content"]["zones"]["main"]
txt = {"id": "tx6b00001", "type": "text", "props": {"body": {"fr": "Entre deux sections"}}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {"elTextColor": "#FFD700"}}
grid = {**blocks[2], "props": {"side": "left"}}
mix = [blocks[0], txt, grid, {**blocks[3], "props": {"max": 4}}]
r = requests.put(B + f"/admin/pages/{Wid}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": mix}}})
ok(r.status_code == 200, "brouillon recomposé : bloc libre entre sections, parcours à gauche, 4 vidéos « à suivre »")
bad = [{**blocks[2], "props": {"side": "haut"}}]
ok(requests.put(B + f"/admin/pages/{Wid}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": bad}}}).status_code == 400, "place du parcours inconnue refusée")
bad = [{**blocks[3], "props": {"max": 20}}]
ok(requests.put(B + f"/admin/pages/{Wid}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": bad}}}).status_code == 400, "« à suivre » : plus de 8 refusé")
ok(requests.put(B + f"/admin/pages/{Wid}/draft", headers=A, json={"content": {"meta": {}, "zones": {"before": []}}}).status_code == 400, "zone inconnue refusée")
ok(requests.put(B + f"/admin/pages/{Wid}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": mix}}}).status_code == 200, "brouillon remis")
ok(requests.post(B + f"/admin/pages/{Wid}/publish", headers=A).status_code == 200, "publication")
v = requests.get(B + "/pages/view", params={"path": "/_watch"})
ok(v.status_code == 200 and [b["type"] for b in v.json()["zones"]["main"]] == ['w_stage', 'text', 'w_grid', 'w_next'], "page publique : ordre choisi")
ok(v.json()["zones"]["main"][2]["props"].get("side") == "left", "réglage « parcours à gauche » conservé")

# Une section « Fiche : … » n'existe que sur la page fiche vidéo
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai watch 6b", "slug": "essai-watch-6b"})
P = r.json()["id"]
r = requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [blocks[0]]}}})
ok(r.status_code == 400, "section de la fiche vidéo refusée sur une page libre")
requests.delete(B + f"/admin/pages/{P}", headers=A)
requests.delete(B + f"/admin/pages/{Wid}", headers=A)
ok(requests.get(B + "/pages/view", params={"path": "/_watch"}).status_code == 404, "supprimée : la fiche d'origine revient")
print("TOUT OK" if not fails else f"{fails} ÉCHEC(S)")
raise SystemExit(1 if fails else 0)
