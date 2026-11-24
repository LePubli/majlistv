"""Pages en blocs, étape 3 : bloc « Colonnes » (validation, pas d'imbrication, public ciblé dans les colonnes, historique) et style de section.
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_page_columns.py"""
import sys, uuid, requests

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:6]
def blk(type, props=None, bid=None, show=None, style=None, cols=None):
    b = {"id": bid or "b" + uuid.uuid4().hex[:8], "type": type, "props": props or {}, "show": show or {"devices": ["m", "t", "d"], "audience": "all"}, "style": style or {}}
    if cols is not None: b["cols"] = cols
    return b
def content(blocks): return {"meta": {}, "zones": {"main": blocks}}
P = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": f"Col {tag}", "slug": f"col-{tag}"}).json()["id"]
path = f"/p/col-{tag}"
put = lambda c: requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": c})
pub = lambda: requests.post(B + f"/admin/pages/{P}/publish", headers=A)

t1 = blk("text", {"body": {"fr": "Public"}}, "cccc0001")
t2 = blk("text", {"body": {"fr": "Membres"}}, "cccc0002", show={"devices": ["m", "t", "d"], "audience": "member"})
col = blk("columns", {"count": "2", "ratio": "1-2"}, "cccc0000", cols=[[t1], [t2, blk("heading", {"title": {"fr": "H"}}, "cccc0003")]])
r = put(content([col]))
c = r.json()["content"]["zones"]["main"][0]
ok(r.status_code == 200 and len(c["cols"]) == 2 and [len(x) for x in c["cols"]] == [1, 2], "colonnes acceptées, 2 colonnes (1 + 2 blocs)")
ok(c["props"].get("ratio") == "1-2", "proportions conservées")

# Pas de colonnes dans une colonne
bad = blk("columns", {"count": "2"}, "cccc0009", cols=[[blk("columns", {"count": "2"}, "cccc0008", cols=[[], []])], []])
r = put(content([bad]))
ok(r.status_code == 400 and any("colonnes" in str(v).lower() for v in (r.json().get("errors") or {}).values()), "colonnes dans une colonne refusées")

# Nombre de colonnes réduit : les blocs de la colonne supprimée passent à la dernière colonne gardée
shrink = blk("columns", {"count": "1"}, "cccc0010", cols=[[t1], [blk("text", {}, "cccc0011")]])
r = put(content([shrink]))
cc = r.json()["content"]["zones"]["main"][0]["cols"]
ok(r.status_code == 200 and len(cc) == 1 and [b["id"] for b in cc[0]] == ["cccc0001", "cccc0011"], "colonne retirée : ses blocs ne se perdent pas")

# Identifiant en double entre page et colonne
dup = blk("text", {}, "cccc0001")
r = put(content([t1, blk("columns", {"count": "2"}, "cccc0020", cols=[[dup], []])]))
ok(r.status_code == 400, "identifiant en double (page / colonne) refusé")

# Limite par colonne
many = [blk("divider") for _ in range(21)]
r = put(content([blk("columns", {"count": "2"}, "cccc0030", cols=[many, []])]))
ok(r.status_code == 400, "plus de 20 blocs dans une colonne refusé")

# Style de section
st = {"bgImage": str(uuid.uuid4()), "shadow": "soft", "border": True, "minHeight": 300}
r = put(content([blk("text", {}, "cccc0040", style=st)]))
ok(r.status_code == 200 and r.json()["content"]["zones"]["main"][0]["style"] == st, "style de section : image de fond, ombre, bordure, hauteur")
for k, v in [("bgImage", "x"), ("shadow", "enorme"), ("border", "oui"), ("minHeight", 5000)]:
    r = put(content([blk("text", {}, "cccc0041", style={k: v})]))
    ok(r.status_code == 400, f"style {k} invalide refusé")

# Public ciblé dans les colonnes
put(content([col])); ok(pub().status_code == 200, "page avec colonnes publiée")
pv = requests.get(B + "/pages/view?path=" + path + "&ssr=1").json()
ids = lambda z: [b["id"] for cc in z["main"][0]["cols"] for b in cc]
ok(pv["targeted"] is True and ids(pv["zones"]) == ["cccc0001", "cccc0003"], "visiteur : le bloc réservé aux membres est retiré de la colonne")
pm = requests.get(B + "/pages/view?path=" + path, headers=A).json()
ok("cccc0002" in ids(pm["zones"]), "membre connecté : le bloc réservé aux membres apparaît")

# Historique : un bloc ajouté dans une colonne est vu comme un changement
col2 = blk("columns", {"count": "2", "ratio": "1-2"}, "cccc0000", cols=[[t1, blk("divider", {}, "cccc0050")], [t2, blk("heading", {"title": {"fr": "H"}}, "cccc0003")]])
put(content([col2])); pub()
vs = requests.get(B + f"/admin/pages/{P}/versions", headers=A).json()
ok(len(vs) >= 2, "deux versions dans l'historique")
requests.delete(B + f"/admin/pages/{P}", headers=A)
print("ECHECS:" if fails else "TOUT OK", fails or "")
sys.exit(1 if fails else 0)
