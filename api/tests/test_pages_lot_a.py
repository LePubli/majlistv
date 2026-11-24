"""Éditeur visuel, lot A : toutes les pages du site (zones « toutes les pages de ce genre », contenu d'origine masquable).
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_pages_lot_a.py"""
import requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
TESTED = ["/kids", "/kids/histoires/*", "/kids/watch/*", "/chaines/*", "/books/*", "/legal/*", "/intervenants/*", "/themes/*", "/events/*", "/collections/*", "/shorts/*", "/audyn/*", "/coran/*", "/pricing", "/legal/cgv", "/licences"]
for p in requests.get(B + "/admin/pages", headers=A).json():
    if p["path"] in TESTED: requests.delete(B + f"/admin/pages/{p['id']}", headers=A)
blk = {"id": "la0000001", "type": "text", "props": {"body": {"fr": "Bloc lot A"}}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
def put(pid, content): return requests.put(B + f"/admin/pages/{pid}/draft", headers=A, json={"content": content})

for path in ["/chaines/*", "/books/*", "/legal/*", "/intervenants/*", "/themes/*", "/events/*", "/collections/*", "/shorts/*", "/audyn/*", "/coran/*"]:
    r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": path})
    ok(r.status_code == 201, f"zone « toutes les pages » créée : {path}")
    if r.status_code != 201: continue
    pid = r.json()["id"]
    ok(put(pid, {"meta": {}, "zones": {"before": [blk], "after": []}}).status_code == 200 and requests.post(B + f"/admin/pages/{pid}/publish", headers=A).status_code == 200, f"{path} : bloc publié")
    s = requests.get(B + "/pages/slots").json()["slots"]
    ok(path in s and len(s[path]["before"]) == 1, f"{path} : servie par /pages/slots")
    requests.delete(B + f"/admin/pages/{pid}", headers=A)
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/inconnu/*"}).status_code == 400, "famille inconnue refusée")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/admin"}).status_code == 400, "administration : toujours exclue")

# Contenu d'origine masqué : seulement sur les pages d'information
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/legal/cgv"}); pid = r.json()["id"]
put(pid, {"meta": {"hideOriginal": True}, "zones": {"before": [blk], "after": []}}); requests.post(B + f"/admin/pages/{pid}/publish", headers=A)
ok(requests.get(B + "/pages/slots").json()["slots"]["/legal/cgv"].get("replace") is True, "page d'information : contenu d'origine masqué")
requests.delete(B + f"/admin/pages/{pid}", headers=A)
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/pricing"}); pid = r.json()["id"]
put(pid, {"meta": {"hideOriginal": True}, "zones": {"before": [blk], "after": []}}); requests.post(B + f"/admin/pages/{pid}/publish", headers=A)
ok("replace" not in requests.get(B + "/pages/slots").json()["slots"]["/pricing"], "page fonctionnelle (tarifs) : contenu d'origine toujours gardé")
requests.delete(B + f"/admin/pages/{pid}", headers=A)
# Espace Kids : ouvert, mais blocs simples seulement
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/kids"})
ok(r.status_code == 201, "Kids : page ouverte à l'éditeur")
pid = r.json()["id"]
ok(put(pid, {"meta": {}, "zones": {"before": [blk], "after": []}}).status_code == 200, "Kids : bloc texte accepté")
talks = {"id": "la0000002", "type": "talks", "props": {}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
r = put(pid, {"meta": {}, "zones": {"before": [talks], "after": []}})
ok(r.status_code == 400 and "Kids" in str(r.json()), "Kids : rangée de vidéos du catalogue refusée")
video = {**talks, "id": "la0000003", "type": "video", "props": {"url": "https://www.youtube.com/watch?v=abcdefghijk"}}
ok(put(pid, {"meta": {}, "zones": {"before": [video], "after": []}}).status_code == 400, "Kids : vidéo externe refusée")
cols = {"id": "la0000004", "type": "columns", "props": {"count": "2"}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}, "cols": [[talks], []]}
ok(put(pid, {"meta": {}, "zones": {"before": [cols], "after": []}}).status_code == 400, "Kids : bloc interdit caché dans une colonne refusé")
put(pid, {"meta": {}, "zones": {"before": [blk], "after": []}}); requests.post(B + f"/admin/pages/{pid}/publish", headers=A)
ok(len(requests.get(B + "/pages/slots").json()["slots"].get("/kids", {}).get("before", [])) == 1, "Kids : bloc publié servi")
requests.delete(B + f"/admin/pages/{pid}", headers=A)
for path in ["/kids/histoires/*", "/kids/watch/*"]:
    r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": path})
    ok(r.status_code == 201, f"Kids : zone « toutes les pages » {path}")
    if r.status_code == 201: requests.delete(B + f"/admin/pages/{r.json()['id']}", headers=A)
print("TOUT OK" if not fails else f"{fails} ÉCHEC(S)")
raise SystemExit(1 if fails else 0)
