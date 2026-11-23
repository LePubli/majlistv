"""Pages en blocs : référencement (image de partage, « ne pas référencer » hors plan du site) et résumé des changements de l'historique.
Prérequis : API (3055), PG (5544). Ne demande pas de stockage : l'image de partage est seulement validée (identifiant).
Lancement depuis la racine du dépôt : python3 api/tests/test_pages_seo.py"""
import sys, uuid, requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
def login(e, pw): return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": pw}).json()["token"]}
A = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
def blk(type, props=None, bid=None): return {"id": bid or "b" + uuid.uuid4().hex[:8], "type": type, "props": props or {}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
def content(blocks, meta=None): return {"meta": meta or {}, "zones": {"main": blocks}}

P = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": f"SEO {tag}", "slug": f"seo-{tag}"}).json()["id"]
path = f"/p/seo-{tag}"
put = lambda c: requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": c})
pub = lambda: requests.post(B + f"/admin/pages/{P}/publish", headers=A)
listed = lambda: path in [x["path"] for x in requests.get(B + "/pages/public-list").json()]
h1 = blk("heading", {"title": {"fr": "Bonjour"}}, "bbbb0001")

# Validation de la méta
r = put(content([h1], {"title": {"fr": "Titre"}, "description": {"fr": "Desc"}, "image": "pas-un-id"}))
ok(r.status_code == 400 and "meta.image" in (r.json().get("errors") or {}), "image de partage invalide refusée")
img = str(uuid.uuid4())
r = put(content([h1], {"title": {"fr": "Titre"}, "description": {"fr": "Desc"}, "image": img, "noindex": "oui"}))
d = r.json()["content"]["meta"]
ok(r.status_code == 200 and d.get("image") == img and "noindex" not in d, "image acceptée ; « noindex » n'accepte que vrai")
ok(pub().status_code == 200, "page publiée (version 1)")
ok(listed(), "page référencée : présente dans le plan du site")
v = requests.get(B + "/pages/view?path=" + path, headers=A).json()
ok(v["meta"].get("image") == img, "l'image de partage est donnée au site")

# Ne pas référencer
put(content([h1], {"title": {"fr": "Titre"}, "description": {"fr": "Desc"}, "image": img, "noindex": True}))
ok(pub().status_code == 200 and not listed(), "« ne pas référencer » : retirée du plan du site")
v = requests.get(B + "/pages/view?path=" + path + "&ssr=1").json()
ok(v["meta"].get("noindex") is True, "…et le site en est informé (balise noindex)")

# Résumé des changements
h2 = blk("text", {"body": {"fr": "Un texte"}}, "bbbb0002")
put(content([h1, h2], {"title": {"fr": "Autre titre"}, "noindex": True}))
pub()
put(content([h2], {"title": {"fr": "Autre titre"}}))
pub()
vs = requests.get(B + f"/admin/pages/{P}/versions", headers=A).json()
ok(len(vs) == 4 and vs[3]["changes"] is None, "4 versions ; la plus ancienne n'a rien à comparer")
ok(vs[2]["changes"] == ["retirée de Google et du plan du site"] or "retirée de Google et du plan du site" in vs[2]["changes"], "version 2 : référencement coupé")
c3 = vs[1]["changes"]
ok("1 bloc ajouté" in c3 and "titre modifié" in c3 and "description modifiée" in c3 and "image de partage modifiée" in c3, f"version 3 : bloc ajouté, titre, description, image ({c3})")
c4 = vs[0]["changes"]
ok("1 bloc retiré" in c4 and "remise dans Google et le plan du site" in c4, f"version 4 : bloc retiré, référencement rétabli ({c4})")
ok(listed(), "remise dans le plan du site après la version 4")

requests.delete(B + f"/admin/pages/{P}", headers=A)
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
