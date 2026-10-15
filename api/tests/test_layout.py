"""Étape I4 : page « layout » (en-tête, menus, pied de page, barre d'annonce) et validation des réglages de navigation.
Prérequis : API (3055), PG de test (5544), stockage S3 de test. Lancement depuis la racine du dépôt : python3 api/tests/test_layout.py
(API de test avec RATE_LIMIT_MAX=5000)"""
import copy, filecmp, os, sys, uuid, requests, psycopg2

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
mail = f"ly-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": mail, "password": "Passw0rd-test", "name": "ly"})
MEMBER = login(mail, "Passw0rd-test")
for pg in requests.get(B + "/admin/pages", headers=A).json():
    requests.delete(B + f"/admin/pages/{pg['id']}", headers=A)

for f in ("navcfg.js", "blocks.js"):
    ok(filecmp.cmp(os.path.join(ROOT, "api/src", f), os.path.join(ROOT, "web/lib", f), shallow=False), f"api/src/{f} et web/lib/{f} identiques")

ok(requests.post(B + "/admin/pages", headers=MEMBER, json={"kind": "layout"}).status_code == 403, "un membre ne peut pas créer la page layout")
ok(requests.get(B + "/pages/view", params={"path": "/_layout"}).status_code == 404, "avant création : 404")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "layout"})
ok(r.status_code == 201 and r.json()["path"] == "/_layout" and r.json()["kind"] == "layout" and r.json()["live"] is False, "layout créée, hors ligne")
L = r.json()["id"]
ok(set(r.json()["content"]["zones"].keys()) == {"topbar", "footerTop"}, "zones topbar et footerTop")
ok(requests.post(B + "/admin/pages", headers=A, json={"kind": "layout"}).status_code == 409, "une seule layout : 409")
r = requests.post(B + "/admin/pages", headers=A, json={"kind": "slot", "path": "/_layout"})
ok(r.status_code == 400, "/_layout interdit comme emplacement")
ok("/_layout" not in requests.get(B + "/pages/slots").json()["slots"], "pas dans les emplacements")
ok(all(x["path"] != "/_layout" for x in requests.get(B + "/pages/public-list").json()), "pas dans le plan du site")

# Publication à vide : sans nav, sans blocs
r = requests.post(B + f"/admin/pages/{L}/publish", headers=A)
ok(r.status_code == 200 and r.json()["live"], "publication à vide")
v = requests.get(B + "/pages/view", params={"path": "/_layout", "ssr": 1}).json()
ok("nav" not in v, "sans réglage : pas de nav servie")

def put(content):
    return requests.put(B + f"/admin/pages/{L}/draft", headers=A, json={"content": content})

cur_content = requests.get(B + f"/admin/pages/{L}", headers=A).json()["content"]
base = {"zones": cur_content["zones"]}

def bad(nav, path_sub, msg):
    c = copy.deepcopy(base); c["nav"] = nav
    r = put(c)
    e = r.json().get("errors", {}) if r.status_code == 400 else {}
    ok(r.status_code == 400 and any(path_sub in k for k in e), msg + f" -> {list(e)[:3]}")

def publish_bad(nav, path_sub, msg):
    c = copy.deepcopy(base); c["nav"] = nav
    ok(put(c).status_code == 200, "  (brouillon accepté)")
    r = requests.post(B + f"/admin/pages/{L}/publish", headers=A)
    e = r.json().get("errors", {}) if r.status_code == 400 else {}
    ok(r.status_code == 400 and any(path_sub in k for k in e), msg + f" -> {list(e)[:3]}")

bad({"foo": 1}, "nav.foo", "réglage inconnu refusé")
bad({"menus": {"main": [{"id": "abc", "key": "nope"}]}}, "nav.menus.main.0.key", "clé d'origine inconnue refusée")
bad({"menus": {"main": [{"id": "abc", "key": "home"}, {"id": "abd", "key": "home"}]}}, "nav.menus.main.1.key", "doublon de clé refusé")
bad({"menus": {"main": [{"id": "abc", "type": "link", "label": {"fr": "X"}, "url": "javascript:alert(1)"}]}}, "nav.menus.main.0.url", "URL javascript: refusée")
bad({"menus": {"main": [{"id": "abc", "type": "link", "label": {"fr": "X"}, "url": "/a", "icon": "star"}]}}, "nav.menus.main.0.icon", "icône refusée dans le menu principal")
bad({"menus": {"side": {"discover": [{"id": "abc", "type": "link", "label": {"fr": "X"}, "url": "/a", "icon": "zzz"}]}}}, "nav.menus.side.discover.0.icon", "icône inconnue refusée")
bad({"menus": {"main": [{"id": "ab", "key": "home"}]}}, "nav.menus.main.0.id", "identifiant trop court refusé")
bad({"menus": {"main": [{"id": "abc", "key": "home", "show": {"devices": [], "audience": "all"}}]}}, "show.devices", "aucun appareil refusé")
bad({"header": {"left": [{"id": "abc", "key": "logo"}], "middle": []}}, "nav.header.middle", "zone inconnue refusée")
bad({"header": {"left": [{"id": "abc", "key": "logo"}, {"id": "abd", "key": "logo"}]}}, "nav.header", "logo en double refusé")
publish_bad({"header": {"left": [{"id": "abc", "key": "logo"}], "center": [], "right": []}}, "nav.header", "publication sans compte refusée")
publish_bad({"menus": {"footer": [{"id": "m-channels", "key": "channels"}]}}, "nav.menus.footer", "liens légaux manquants refusés")
publish_bad({"menus": {"footer": [{"id": "a1x", "key": "mentions", "hidden": True}, {"id": "a2x", "key": "cgv"}, {"id": "a3x", "key": "privacy"}]}}, "nav.menus.footer", "lien légal masqué refusé")
publish_bad({"menus": {"main": [{"id": "abc", "type": "link", "label": {"fr": "X"}}]}}, "url", "lien personnalisé sans adresse refusé à la publication")
publish_bad({"menus": {"bar": [{"id": f"b{i}x", "key": k} for i, k in enumerate(["home", "series", "learning", "library", "account", "collections"])]}}, "nav.menus.bar", "barre du bas : plus de 5 liens refusé")

# Brouillon lenient : lien sans adresse accepté en brouillon
c = copy.deepcopy(base); c["nav"] = {"menus": {"main": [{"id": "abc", "type": "link", "label": {"fr": "X"}}]}}
ok(put(c).status_code == 200, "brouillon : lien sans adresse accepté")

# Réglages valides complets
nav = {
    "menus": {
        "main": [
            {"id": "m-home", "key": "home", "label": {"fr": "Salon", "en": "Lounge"}},
            {"id": "m-series", "key": "series", "hidden": True},
            {"id": "c1x", "type": "link", "label": {"fr": "Blog", "en": "Blog", "ar": "مدونة"}, "url": "https://example.org/blog", "show": {"devices": ["d"], "audience": "visitor"}},
        ],
        "footer": [
            {"id": "f-ment", "key": "mentions"}, {"id": "f-cgv", "key": "cgv", "label": {"fr": "CGV"}}, {"id": "f-priv", "key": "privacy"},
            {"id": "f-blog", "type": "link", "label": {"fr": "Presse"}, "url": "/p/presse"},
        ],
        "side": {"titles": {"discover": {"fr": "Explorer"}}, "discover": [{"id": "s-home", "key": "home"}, {"id": "s-x", "type": "link", "label": {"fr": "Aide"}, "url": "mailto:aide@example.org", "icon": "mail"}]},
    },
    "header": {
        "left": [{"id": "h-logo", "key": "logo"}],
        "center": [{"id": "h-menu", "key": "menu"}],
        "right": [{"id": "h-account", "key": "account"}, {"id": "h-btn", "type": "button", "label": {"fr": "Faire un don"}, "url": "/gift", "buttonKind": "ghost", "show": {"devices": ["d", "t"], "audience": "all"}}],
    },
    "footer": {"left": [{"id": "f-brand", "key": "brand"}, {"id": "f-txt", "type": "text", "label": {"fr": "Fait avec soin"}}], "right": [{"id": "f-links", "key": "links"}]},
}
c = copy.deepcopy(base); c["nav"] = nav
c["zones"]["topbar"] = [{"id": "tb01", "type": "heading", "props": {"title": {"fr": "Ramadan Moubarak"}, "level": "h3"}}]
r = put(c)
ok(r.status_code == 200, f"brouillon valide accepté {r.text[:200] if r.status_code != 200 else ''}")
r = requests.post(B + f"/admin/pages/{L}/publish", headers=A)
ok(r.status_code == 200 and r.json()["live"], f"publication valide {r.text[:300] if r.status_code != 200 else ''}")
v = requests.get(B + "/pages/view", params={"path": "/_layout", "ssr": 1}).json()
ok(v.get("nav", {}).get("menus", {}).get("main", [{}])[0].get("label", {}).get("fr") == "Salon", "nav servie au public (ssr)")
ok(len(v["zones"]["topbar"]) == 1, "bloc de la barre d'annonce servi")
v2 = requests.get(B + "/pages/view", params={"path": "/_layout"}).json()
ok("nav" in v2 and len(v2["zones"]["topbar"]) == 1, "nav servie aussi hors ssr")

# Hors ligne : retour à l'origine
requests.put(B + f"/admin/pages/{L}/live", headers=A, json={"live": False})
ok(requests.get(B + "/pages/view", params={"path": "/_layout"}).status_code == 404, "hors ligne : 404 (le site reprend ses menus d'origine)")
requests.put(B + f"/admin/pages/{L}/live", headers=A, json={"live": True})

# Suppression
ok(requests.delete(B + f"/admin/pages/{L}", headers=A).status_code in (200, 204), "suppression")
ok(requests.get(B + "/pages/view", params={"path": "/_layout"}).status_code == 404, "supprimée : 404")
cur.execute("select count(*) from site_pages where kind='layout'"); ok(cur.fetchone()[0] == 0, "plus de ligne layout")
print("TOUT EST OK")
