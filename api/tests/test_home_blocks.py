"""Étape H : accueil des membres en blocs (page « home »), blocs « données du site », GET /home/featured.
Prérequis : API (3055), PG de test (5544), stockage S3 de test. Lancement depuis la racine du dépôt : python3 api/tests/test_home_blocks.py
(à lancer avec RATE_LIMIT_MAX=5000 pour l'API de test, comme test_pages.py)"""
import filecmp, os, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


A = login("admin@test.local", "AdminPassw0rd-test")
mail = f"hb-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": mail, "password": "Passw0rd-test", "name": "hb"})
MEMBER = login(mail, "Passw0rd-test")


def clean():
    for pg in requests.get(B + "/admin/pages", headers=A).json():
        requests.delete(B + f"/admin/pages/{pg['id']}", headers=A)


clean()
ok(filecmp.cmp(os.path.join(ROOT, "api/src/blocks.js"), os.path.join(ROOT, "web/lib/blocks.js"), shallow=False), "api/src/blocks.js et web/lib/blocks.js identiques")

# --- Accueil en blocs : droits, création, modèle
ok(requests.post(B + "/admin/pages", headers=MEMBER, json={"kind": "home"}).status_code == 403, "un membre ne peut pas créer l'accueil")
ok(requests.get(B + "/pages/view", params={"path": "/_home"}).status_code == 404, "avant création : pas d'accueil en blocs (404)")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "home"})
ok(r.status_code == 201 and r.json()["path"] == "/_home" and r.json()["kind"] == "home" and r.json()["live"] is False, "accueil créé (adresse interne /_home), hors ligne")
H = r.json()["id"]
main = r.json()["content"]["zones"]["main"]
types = [b["type"] for b in main]
ok(types == ["featured", "mine", "mine", "talks", "channels", "shorts", "collections", "series", "catrows", "kids", "dayquote"], f"modèle de départ : {types}")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "home"}).status_code == 409, "un seul accueil : 409")
ok(requests.get(B + "/pages/view", params={"path": "/_home"}).status_code == 404, "brouillon : invisible du public")
# Le brouillon du modèle est publiable tel quel
r = requests.post(B + f"/admin/pages/{H}/publish", headers=A)
ok(r.status_code == 200 and r.json()["live"] is True and len(r.json()["published"]["zones"]["main"]) == 11, "le modèle se publie sans erreur")
v = requests.get(B + "/pages/view", params={"path": "/_home"})
ok(v.status_code == 200 and v.json()["kind"] == "home" and len(v.json()["zones"]["main"]) == 11, "visiteur : l'accueil en blocs est servi")
ok(any(b["type"] == "talks" and b["props"]["title"]["ar"] for b in v.json()["zones"]["main"]), "le titre « Nouveautés » existe en 3 langues")

# --- L'accueil n'apparaît ni dans les emplacements ni dans le plan du site
ok("/_home" not in requests.get(B + "/pages/slots").json()["slots"], "pas dans les emplacements")
ok(all(x["path"] != "/_home" for x in requests.get(B + "/pages/public-list").json()), "pas dans le plan du site")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/_home"})
ok(r.status_code == 400, "on ne peut pas viser /_home comme emplacement")

# --- Validation des nouveaux blocs
def draft(blocks, strict_publish=False):
    body = {"content": {"meta": {}, "zones": {"main": blocks}}}
    r = requests.put(B + f"/admin/pages/{H}/draft", headers=A, json=body)
    return r

def blk(t, props=None, **kw):
    return {"id": "t" + uuid.uuid4().hex[:8], "type": t, "props": props or {}, "show": kw.get("show", {"devices": ["m", "t", "d"], "audience": "all"}), "style": {}}

ok(draft([blk("featured", {"layout": "fixed", "resume": "no"})]).status_code == 200, "À la une : réglages valides")
ok(draft([blk("featured", {"layout": "carrousel"})]).status_code == 400, "À la une : choix inconnu refusé")
ok(draft([blk("mine", {"what": "tout"})]).status_code == 400, "Ma progression : contenu inconnu refusé")
ok(draft([blk("channels", {"limit": 99})]).status_code == 400, "Chaînes : nombre hors limites refusé")
ok(draft([blk("channels", {"limit": 3, "order": "popular", "title": {"fr": "À suivre"}})]).status_code == 200, "Chaînes : réglages valides")
ok(draft([blk("collections", {"limit": 0})]).status_code == 400, "Collections : 0 refusé")
ok(draft([blk("catrows", {"max": 12}), blk("kids"), blk("dayquote", {"style": "compact"}), blk("series", {"limit": 5})]).status_code == 200, "rangées par catégorie, Kids, citation, séries : valides")
ok(draft([blk("dayquote", {"style": "<script>"})]).status_code == 400, "citation : style inconnu refusé")
ok(draft([blk("talks", {"title": {"fr": "N"}, "moreLabel": {"fr": "Tout voir"}, "moreUrl": "javascript:alert(1)"})]).status_code == 400, "Conférences : lien « Tout voir » dangereux refusé")
ok(draft([blk("talks", {"title": {"fr": "N"}, "moreLabel": {"fr": "Tout voir"}, "moreUrl": "/library"})]).status_code == 200, "Conférences : lien « Tout voir » valide")
ok(draft([blk("inconnu")]).status_code == 400, "type inconnu refusé")

# --- Public ciblé sur l'accueil
draft([blk("featured"), blk("channels", show={"devices": ["m", "t", "d"], "audience": "visitor"}), blk("mine", {"what": "quiz"}, show={"devices": ["m", "t", "d"], "audience": "member"})])
requests.post(B + f"/admin/pages/{H}/publish", headers=A)
vis = [b["type"] for b in requests.get(B + "/pages/view", params={"path": "/_home"}).json()["zones"]["main"]]
mem = [b["type"] for b in requests.get(B + "/pages/view", params={"path": "/_home"}, headers=MEMBER).json()["zones"]["main"]]
ok(vis == ["featured", "channels"] and mem == ["featured", "mine"], f"visiteur {vis} / membre {mem}")

# --- Mise hors ligne : l'accueil d'origine revient
requests.put(B + f"/admin/pages/{H}/live", headers=A, json={"live": False})
ok(requests.get(B + "/pages/view", params={"path": "/_home"}).status_code == 404, "hors ligne : retour à l'accueil d'origine (404)")

# --- /home/featured
cur.execute("update talks set featured = false, featured_at = null")
f = requests.get(B + "/home/featured").json()
cur.execute("select count(*) from talks t where video_status = 'ready'")
n_ready = cur.fetchone()[0]
ok((f["fallback"] is True and len(f["items"]) == 1) if n_ready else f["items"] == [], f"aucune conférence à la une : repli sur la plus récente ({len(f['items'])})")
if n_ready:
    tid = f["items"][0]["id"]
    cur.execute("update talks set featured = true, featured_at = now() where id = %s", (tid,))
    f2 = requests.get(B + "/home/featured").json()
    ok(f2["fallback"] is False and f2["items"][0]["id"] == tid and "summary" in f2["items"][0], "conférence à la une : servie, sans repli")
    ok("poster_key" not in f2["items"][0] and "description" not in f2["items"][0], "pas de clé interne dans la réponse")
    cur.execute("update talks set featured = false, featured_at = null where id = %s", (tid,))

# --- Suppression : retour à l'accueil d'origine, et on peut recréer
ok(requests.delete(B + f"/admin/pages/{H}", headers=A).status_code == 204, "accueil supprimé")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "home"}).status_code == 201, "recréation possible")
clean()
print("TOUT EST BON")
