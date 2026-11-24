"""Éditeur visuel, étape 5 : survol, animation, police par bloc, réglages tablette / téléphone, droits des modérateurs.
Prérequis : API (3055), PG (5544). Lancement depuis la racine du dépôt : python3 api/tests/test_editor_step5.py"""
import os, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
db = psycopg2.connect(os.environ.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis")); db.autocommit = True; cur = db.cursor()
def user(role):
    email = f"st5-{role}-{uuid.uuid4().hex[:8]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "St5"})
    cur.execute("update users set role=%s where email=%s", (role, email))
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}
def setting(v): return requests.put(B + "/admin/settings", headers=A, json={"values": {"editor_moderators": v}})

# --- Style : validation
for x in requests.get(B + "/admin/pages", headers=A).json():
    if x["title"] == "Essai étape 5": requests.delete(B + f"/admin/pages/{x['id']}", headers=A)
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "custom", "title": "Essai étape 5"})
ok(r.status_code == 201, "page créée")
P = r.json()["id"]
def put(style, headers=A):
    blk = {"id": "stylebl01", "type": "heading", "props": {"title": {"fr": "Titre"}, "level": "h2"}, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": style}
    return requests.put(B + f"/admin/pages/{P}/draft", headers=headers, json={"content": {"meta": {}, "zones": {"main": [blk]}}})
good = {"font": "Poppins", "hover": "lift", "hoverBg": "#112233", "hoverText": "@accent", "anim": "up", "animDelay": 300,
        "padTopT": 20, "padBottomT": 10, "padTopM": 8, "padBottomM": 0, "minHeightM": 200, "alignM": "center"}
r = put(good)
ok(r.status_code == 200, "réglages d'étape 5 acceptés")
if r.status_code == 200:
    st = r.json()["draft"]["zones"]["main"][0]["style"]
    ok(all(st.get(k) == v for k, v in good.items() if k != "padBottomM") and st.get("padBottomM") == 0, "tous les réglages conservés")
for bad, why in [({"font": "Comic Sans"}, "police inconnue"), ({"hover": "explose"}, "effet inconnu"), ({"hoverBg": "rouge"}, "couleur de survol invalide"),
                 ({"anim": "spin"}, "animation inconnue"), ({"animDelay": 5000}, "délai trop long"), ({"padTopM": 999}, "marge téléphone trop grande"),
                 ({"padBottomT": -1}, "marge tablette négative"), ({"alignM": "justify"}, "alignement inconnu"), ({"minHeightM": 5000}, "hauteur trop grande")]:
    ok(put(bad).status_code == 400, f"refusé : {why}")

# --- Publication et lecture publique
ok(requests.post(B + f"/admin/pages/{P}/publish", headers=A).status_code == 200, "publication")
slug = requests.get(B + f"/admin/pages/{P}", headers=A).json()["path"]
v = requests.get(B + "/pages/view", params={"path": slug}).json()
ok(v["zones"]["main"][0]["style"].get("anim") == "up", "page publique : animation présente")

# --- Droits
mod, member = user("moderator"), user("user")
setting("off")
ok(requests.get(B + "/admin/pages", headers=mod).status_code == 403, "réglage « off » : modérateur refusé (liste)")
ok(put({"hover": "zoom"}, mod).status_code == 403, "réglage « off » : modérateur refusé (brouillon)")
r = setting("draft")
ok(r.status_code == 200, "réglage « draft » enregistré")
ok(requests.get(B + "/admin/pages", headers=mod).status_code == 200, "« draft » : modérateur lit la liste")
ok(requests.get(B + f"/admin/pages/{P}", headers=mod).status_code == 200, "« draft » : modérateur lit une page")
ok(put({"hover": "zoom"}, mod).status_code == 200, "« draft » : modérateur modifie le brouillon")
ok(requests.get(B + "/admin/page-media", headers=mod).status_code == 200, "« draft » : modérateur voit les images")
ok(requests.get(B + "/admin/pages", headers=member).status_code == 403, "« draft » : simple membre toujours refusé")
ok(requests.get(B + "/admin/pages").status_code == 401, "sans connexion : 401")
ok(requests.post(B + f"/admin/pages/{P}/publish", headers=mod).status_code == 403, "modérateur ne publie pas")
ok(requests.put(B + f"/admin/pages/{P}/live", headers=mod, json={"live": False}).status_code == 403, "modérateur ne met pas hors ligne")
ok(requests.patch(B + f"/admin/pages/{P}", headers=mod, json={"title": "Autre"}).status_code == 403, "modérateur ne renomme pas")
ok(requests.post(B + "/admin/pages", headers=mod, json={"kind": "custom", "title": "X"}).status_code == 403, "modérateur ne crée pas de page")
ok(requests.delete(B + f"/admin/pages/{P}", headers=mod).status_code == 403, "modérateur ne supprime pas")
ok(requests.post(B + f"/admin/pages/{P}/versions/1/restore", headers=mod).status_code == 403, "modérateur ne restaure pas une version")
ok(requests.put(B + "/admin/settings", headers=mod, json={"values": {"editor_moderators": "draft"}}).status_code == 403, "modérateur ne change pas le réglage")
ok(requests.put(B + "/admin/settings", headers=A, json={"values": {"editor_moderators": "nimporte"}}).status_code == 400, "valeur de réglage inconnue refusée")
# L'administrateur publie ensuite le brouillon du modérateur
ok(requests.post(B + f"/admin/pages/{P}/publish", headers=A).status_code == 200, "l'administrateur publie le brouillon du modérateur")
setting("off")
requests.delete(B + f"/admin/pages/{P}", headers=A)
print("\nTOUT OK" if not fails else f"\n{fails} ÉCHEC(S)")
raise SystemExit(1 if fails else 0)
