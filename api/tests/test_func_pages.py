"""Lot C : pages « fonction » en sections (tarifs…). Prérequis : API (3055), PG (5544). Depuis la racine : python3 api/tests/test_func_pages.py"""
import requests
B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
def pages(): return {p["path"]: p for p in requests.get(B + "/admin/pages", headers=A).json()}
def txt(i, t): return {"id": i, "type": "text", "props": {"body": {"fr": t}}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
for p in pages().values():
    if p["path"].startswith("/_func/") or p["path"] == "/p/essai-lot-c": requests.delete(B + f"/admin/pages/{p['id']}", headers=A)

ok(requests.post(B + "/admin/pages", json={"kind": "func", "func": "pricing"}).status_code in (401, 403), "création : connexion obligatoire")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "func", "func": "inconnue"}).status_code == 400, "page fonction inconnue refusée")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "func"}).status_code == 400, "identifiant obligatoire")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "func", "func": "pricing"})
ok(r.status_code == 201 and r.json()["path"] == "/_func/pricing", "Tarifs recomposés : page créée")
P = r.json(); blocks = P["draft"]["zones"]["main"]
ok([b["type"] for b in blocks] == ["f_pricing_head", "f_pricing_country", "f_pricing_plans", "f_pricing_methods", "f_pricing_waiver", "f_pricing_extras"], "modèle : les 6 sections dans l'ordre d'origine")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "func", "func": "pricing"}).status_code == 409, "une seule page par fonction")
ok(requests.get(B + "/pages/view?path=/_func/pricing").status_code == 404, "non publiée : la page d'origine reste en place")
# Réglage de section et blocs libres
b2 = [dict(b) for b in blocks]
b2[2] = {**b2[2], "props": {"tiers": "standard"}}
b2.insert(1, txt("lotc-free1", "Un mot de bienvenue"))
r = requests.put(B + f"/admin/pages/{P['id']}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": b2}}})
ok(r.status_code == 200, "brouillon : section réglée + bloc libre")
bad = [dict(b) for b in b2]; bad[3] = {**bad[3], "props": {"tiers": "autre"}}
ok(requests.put(B + f"/admin/pages/{P['id']}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": bad}}}).status_code == 400, "option inconnue refusée")
# Section d'une autre page / d'un autre type de page refusée
x = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai lot C", "slug": "essai-lot-c"}).json()
f = {"id": "lotc-f0001", "type": "f_pricing_plans", "props": {}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
ok(requests.put(B + f"/admin/pages/{x['id']}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": [f]}}}).status_code == 400, "section Tarifs refusée sur une page libre")
requests.delete(B + f"/admin/pages/{x['id']}", headers=A)
# Un administrateur retire des sections : permis (la page vit sans « pays »)
b3 = [b for b in b2 if b["type"] != "f_pricing_country"]
ok(requests.put(B + f"/admin/pages/{P['id']}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": b3}}}).status_code == 200, "section masquable retirée")
# Publication
pub = requests.post(B + f"/admin/pages/{P['id']}/publish", headers=A)
ok(pub.status_code == 200, "publication")
v = requests.get(B + "/pages/view?path=/_func/pricing").json()
ok(v["kind"] == "func" and [b["type"] for b in v["zones"]["main"]][:2] == ["f_pricing_head", "text"] and next(b for b in v["zones"]["main"] if b["type"] == "f_pricing_plans")["props"].get("tiers") == "standard", "page en ligne : ordre, bloc libre et option servis")
ok(not any(p == "/_func/pricing" for p in requests.get(B + "/pages/public-list").json() if isinstance(p, str)) , "absente du plan du site")
# Chemin réservé : pas de zone « avant / après » sur /_func
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/_func/pricing"}).status_code == 400, "/_func réservé")
# Suppression : retour à la page d'origine
ok(requests.delete(B + f"/admin/pages/{P['id']}", headers=A).status_code in (200, 204), "suppression")
ok(requests.get(B + "/pages/view?path=/_func/pricing").status_code == 404, "page d'origine rétablie")
# Toutes les pages à fonctions : modèle = sections dans l'ordre d'origine, publication, vue publique, suppression
SECT = {"account": 9, "library": 5, "learning": 11, "series": 3, "channel": 3, "collection": 2}
for fid, n in SECT.items():
    r = requests.post(B + "/admin/pages", headers=A, json={"kind": "func", "func": fid})
    ok(r.status_code == 201 and r.json()["path"] == "/_func/" + fid, f"{fid} : page créée")
    q = r.json(); ty = [b["type"] for b in q["draft"]["zones"]["main"]]
    ok(len(ty) == n and all(t.startswith(f"f_{fid}_") for t in ty), f"{fid} : {n} sections du modèle")
    ok(requests.post(B + f"/admin/pages/{q['id']}/publish", headers=A, json={}).status_code == 200, f"{fid} : publication")
    ok([b["type"] for b in requests.get(B + f"/pages/view?path=/_func/{fid}").json()["zones"]["main"]] == ty, f"{fid} : vue publique")
    ok(requests.delete(B + f"/admin/pages/{q['id']}", headers=A).status_code in (200, 204), f"{fid} : suppression")
print("\n%d échec(s)" % fails); raise SystemExit(1 if fails else 0)
