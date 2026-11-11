"""Projet Menus, étape 1 : menus nommés, emplacements, liens (catalogue, page, appli), sous-menus, résolution publique.
Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


tag = uuid.uuid4().hex[:6]
email = f"mn-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Mn"})
cur.execute("update users set role='moderator' where email=%s", (email,))
MOD = login(email, "Passw0rd-test")
ADM = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("delete from menu_locations"); cur.execute("delete from menus")

# --- droits
ok(requests.get(B + "/admin/menus").status_code in (401, 403), "liste des menus : connexion obligatoire")
ok(requests.get(B + "/admin/menus", headers=MOD).status_code == 403, "liste des menus : refusée à un modérateur")
ok(requests.post(B + "/admin/menus", headers=MOD, json={"name": "x"}).status_code == 403, "création : refusée à un modérateur")
ok(requests.get(B + "/menus/resolved").json() == {"locations": {}}, "public : aucun menu affecté au départ")
ov = requests.get(B + "/admin/menus", headers=ADM).json()
ok(set(ov["spec"]["locations"]) == {"web_top", "web_side", "web_bar", "web_footer", "app_drawer", "app_tabs"} and all(v is None for v in ov["locations"].values()), "6 emplacements, aucun affecté")

# --- création : depuis le menu actuel du site
r = requests.post(B + "/admin/menus", headers=ADM, json={"name": f"Haut {tag}", "from": "current:web_top"})
ok(r.status_code == 201, "création depuis le menu du haut actuel"); top = r.json()["id"]
menus = {m["id"]: m for m in requests.get(B + "/admin/menus", headers=ADM).json()["menus"]}
its = menus[top]["items"]
ok(its[0]["kind"] == "builtin" and its[0]["ref"] == "home" and any(i["ref"] == "prayer" and i.get("hidden") for i in its), "le point de départ reprend les liens d'origine (Prière masqué comme sur le site)")
ok(requests.post(B + "/admin/menus", headers=ADM, json={"name": f"haut {tag}"}).status_code == 409, "nom déjà pris (sans tenir compte des majuscules)")
ok(requests.post(B + "/admin/menus", headers=ADM, json={"name": ""}).status_code == 400, "nom vide refusé")
ok(requests.post(B + "/admin/menus", headers=ADM, json={"name": f"Copie {tag}", "from": "copy:" + top}).status_code == 201, "copie d'un menu")
ok(requests.post(B + "/admin/menus", headers=ADM, json={"name": f"Autre {tag}", "from": "copy:" + str(uuid.uuid4())}).status_code == 404, "copie d'un menu inconnu refusée")

# --- contenus à relier
# Une conférence créée ici, publiée : prendre « la première venue » donnait parfois un brouillon laissé par un autre test (lien alors masqué).
tid = requests.post(B + "/talks", headers=ADM, json={"title": f"Conf menu {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "abcdefghijk")[:11], "rightsConfirmed": True, "publication": "published"}).json()["id"]
cur.execute("select id, slug from talks where id=%s", (tid,)); t = cur.fetchone()
tid, tslug = str(t[0]), t[1]
cur.execute("insert into site_pages (kind, path, title, published, live) values ('custom', %s, %s, '{}'::jsonb, true) on conflict do nothing", (f"/p/menu-{tag}", f"Page menu {tag}"))
cur.execute("insert into site_pages (kind, path, title, published, live) values ('custom', %s, %s, '{}'::jsonb, false) on conflict do nothing", (f"/p/brouillon-{tag}", f"Brouillon {tag}"))
lk = requests.get(B + "/admin/menus/lookup", headers=ADM, params={"kind": "page", "q": f"menu-{tag}"}).json()["results"]
ok(len(lk) == 1 and lk[0]["ref"] == f"/p/menu-{tag}", "recherche d'une page à relier")
ok(requests.get(B + "/admin/menus/lookup", headers=MOD, params={"kind": "page"}).status_code == 403, "recherche : refusée à un modérateur")
ok(requests.get(B + "/admin/menus/lookup", headers=ADM, params={"kind": "talk", "q": ""}).status_code == 200, "recherche de conférences")
ok(requests.get(B + "/admin/menus/lookup", headers=ADM, params={"kind": "bidon"}).status_code == 400, "type de recherche inconnu refusé")

L = lambda s: {"fr": s}
def put(items, mid=top):
    return requests.patch(f"{B}/admin/menus/{mid}", headers=ADM, json={"items": items})

good = [
    {"id": "a1", "kind": "builtin", "ref": "home"},
    {"id": "a2", "kind": "heading", "label": {"fr": "Découvrir", "en": "Discover", "ar": "اكتشف"}, "children": [
        {"id": "a2a", "kind": "talk", "ref": tid},
        {"id": "a2b", "kind": "page", "ref": f"/p/menu-{tag}"},
        {"id": "a2c", "kind": "url", "ref": "https://example.org/x", "label": L("Externe"), "newTab": True},
    ]},
    {"id": "a3", "kind": "url", "ref": "/catalogue?cat=1", "label": L("Science"), "icon": "star", "audience": "member", "devices": ["m", "d"]},
    {"id": "a4", "kind": "appscreen", "ref": "quran", "label": L("Coran (appli)")},
    {"id": "a5", "kind": "page", "ref": f"/p/brouillon-{tag}", "label": L("Brouillon")},
]
r = put(good); ok(r.status_code == 200, "enregistrement d'un menu avec sous-menu : " + r.text[:120])

bad = {
    "adresse //": [{"id": "b1", "kind": "url", "ref": "//evil.test", "label": L("x")}],
    "javascript:": [{"id": "b1", "kind": "url", "ref": "javascript:alert(1)", "label": L("x")}],
    "texte sans français": [{"id": "b1", "kind": "url", "ref": "/x", "label": {"en": "x"}}],
    "balise dans le texte": [{"id": "b1", "kind": "url", "ref": "/x", "label": L("<b>x</b>")}],
    "type inconnu": [{"id": "b1", "kind": "magic", "ref": "/x", "label": L("x")}],
    "icône inconnue": [{"id": "b1", "kind": "url", "ref": "/x", "label": L("x"), "icon": "dragon"}],
    "écran d'appli inconnu": [{"id": "b1", "kind": "appscreen", "ref": "nope", "label": L("x")}],
    "lien d'origine inconnu": [{"id": "b1", "kind": "builtin", "ref": "nope"}],
    "contenu mal formé": [{"id": "b1", "kind": "talk", "ref": "pas-un-uuid"}],
    "deux niveaux de sous-menu": [{"id": "b1", "kind": "heading", "label": L("T"), "children": [{"id": "b2", "kind": "heading", "label": L("U"), "children": [{"id": "b3", "kind": "url", "ref": "/x", "label": L("x")}]}]}],
    "identifiant en double": [{"id": "b1", "kind": "url", "ref": "/x", "label": L("x")}, {"id": "b1", "kind": "url", "ref": "/y", "label": L("y")}],
    "champ inconnu": [{"id": "b1", "kind": "url", "ref": "/x", "label": L("x"), "onclick": "x"}],
    "public inconnu": [{"id": "b1", "kind": "url", "ref": "/x", "label": L("x"), "audience": "dieu"}],
    "aucun appareil": [{"id": "b1", "kind": "url", "ref": "/x", "label": L("x"), "devices": []}],
    "titre avec adresse": [{"id": "b1", "kind": "heading", "label": L("x"), "ref": "/x"}],
    "13 sous-éléments": [{"id": "b0", "kind": "heading", "label": L("T"), "children": [{"id": f"c{i}", "kind": "url", "ref": "/x", "label": L("x")} for i in range(13)]}],
    "contenu supprimé": [{"id": "b1", "kind": "talk", "ref": str(uuid.uuid4())}],
    "page inconnue": [{"id": "b1", "kind": "page", "ref": "/p/inconnue-xyz"}],
}
for name, items in bad.items():
    ok(put(items).status_code == 400, f"refusé : {name}")
ok(put("pas une liste").status_code == 400, "refusé : ce n'est pas une liste")
ok(requests.patch(f"{B}/admin/menus/{top}", headers=ADM, json={}).status_code == 400, "aucun changement refusé")
ok(requests.patch(f"{B}/admin/menus/{uuid.uuid4()}", headers=ADM, json={"name": "x"}).status_code == 404, "menu inconnu : 404")
ok(requests.patch(f"{B}/admin/menus/{top}", headers=ADM, json={"name": f"Haut renommé {tag}"}).status_code == 200, "renommer")

# --- affectation
ok(requests.put(B + "/admin/menus/locations", headers=MOD, json={"web_top": top}).status_code == 403, "affectation refusée à un modérateur")
ok(requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_nulle_part": top}).status_code == 400, "emplacement inconnu refusé")
ok(requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_top": str(uuid.uuid4())}).status_code == 404, "menu inconnu refusé")
r = requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_bar": top})
ok(r.status_code == 400, "un menu avec sous-menu et titre ne convient pas à la barre du bas : " + r.json().get("error", "")[:80])
r = requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_footer": top})
ok(r.status_code == 400, "un menu avec un lien d'origine inconnu du pied de page ne lui convient pas")
nl = requests.post(B + "/admin/menus", headers=ADM, json={"name": f"Sans légaux {tag}"}).json()["id"]
put([{"id": "n1", "kind": "url", "ref": "/contact", "label": L("Contact")}], nl)
r = requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_footer": nl})
ok(r.status_code == 400 and "légaux" in r.json()["error"], "un menu sans liens légaux ne convient pas au pied de page")
r = requests.put(B + "/admin/menus/locations", headers=ADM, json={"app_drawer": top})
ok(r.status_code == 400, "un lien d'origine du site ne convient pas au tiroir de l'appli")
app_m = requests.post(B + "/admin/menus", headers=ADM, json={"name": f"Appli {tag}"}).json()["id"]
ok(put([{"id": "p1", "kind": "appscreen", "ref": "learn"}, {"id": "p2", "kind": "heading", "label": L("Plus"), "children": [{"id": "p3", "kind": "appscreen", "ref": "quran"}, {"id": "p4", "kind": "url", "ref": "https://example.org", "label": L("Site")}]}], app_m).status_code == 200, "menu d'appli enregistré")
ok(requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_top": top, "app_drawer": app_m}).status_code == 200, "affectation au haut du site et au tiroir de l'appli")

# --- pied de page : liens légaux obligatoires
r = requests.post(B + "/admin/menus", headers=ADM, json={"name": f"Pied {tag}", "from": "current:web_footer"}); foot = r.json()["id"]
fi = requests.get(B + "/admin/menus", headers=ADM).json()["menus"]; fi = [m for m in fi if m["id"] == foot][0]["items"]
ok(requests.put(B + "/admin/menus/locations", headers=ADM, json={"web_footer": foot}).status_code == 200, "le menu de pied de page d'origine convient")
hidden = [dict(i, hidden=True) if i.get("ref") == "cgv" else i for i in fi]
ok(put(hidden, foot).status_code == 400, "masquer un lien légal d'un menu affecté au pied de page : refusé")
ok(put([i for i in fi if i.get("ref") != "privacy"], foot).status_code == 400, "retirer un lien légal : refusé")
ok(put(fi + [{"id": "z9", "kind": "url", "ref": "/contact", "label": L("Contact")}], foot).status_code == 200, "ajouter un lien libre au pied de page")
ok(put([{"id": "z1", "kind": "heading", "label": L("T"), "children": [{"id": "z2", "kind": "url", "ref": "/x", "label": L("x")}]}] + fi, foot).status_code == 400, "sous-menu dans le pied de page : refusé")

# --- résolution publique
res = requests.get(B + "/menus/resolved").json()["locations"]
ok(set(res) == {"web_top", "app_drawer", "web_footer"}, "public : seuls les emplacements affectés sortent")
wt = res["web_top"]
ok(wt[0] == {"id": "a1", "kind": "builtin", "key": "home"}, "lien d'origine : clé seule (le site connaît son adresse)")
ch = wt[1]["children"]
ok(wt[1]["kind"] == "heading" and wt[1]["label"]["ar"] and ch[0]["href"] == f"/conferences/{tslug}" and ch[0]["label"]["fr"], "titre + sous-menu : conférence résolue en adresse lisible, texte repris du titre")
ok(ch[0]["ref"] == tid, "le contenu garde son identifiant (l'application ouvre ses propres écrans)")
ok(ch[1]["href"] == f"/p/menu-{tag}" and ch[1]["label"]["fr"] == f"Page menu {tag}", "page créée dans Admin → Pages résolue")
ok(ch[2]["newTab"] and ch[2]["href"] == "https://example.org/x", "adresse externe, nouvel onglet")
ok(wt[2]["audience"] == "member" and wt[2]["devices"] == ["m", "d"], "public et appareils conservés")
ok(wt[3]["kind"] == "appscreen" and wt[3]["screen"] == "quran" and "href" not in wt[3], "écran d'appli : identifiant seulement")
ok(not any(i["id"] == "a5" for i in wt), "page non publiée : le lien disparaît du public")
cur.execute("delete from site_pages where path=%s", (f"/p/menu-{tag}",))
wt = requests.get(B + "/menus/resolved").json()["locations"]["web_top"]
ok(len(wt[1]["children"]) == 2, "page supprimée ensuite : le lien disparaît sans erreur")
# un titre dont tous les sous-éléments ont disparu reste affiché (titre de section) ; un lien de contenu supprimé disparaît
cur.execute("update menus set items = items || %s::jsonb where id=%s", ('[{"id":"gone","kind":"talk","ref":"%s"}]' % uuid.uuid4(), top))
ok(not any(i["id"] == "gone" for i in requests.get(B + "/menus/resolved").json()["locations"]["web_top"]), "contenu supprimé après coup : lien retiré du public")

# --- fonction coupée
ok(requests.get(B + "/menus/resolved").status_code == 200, "fonction « menus » active par défaut")
ok(requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_menus": "false"}}).status_code in (200, 204), "fonction coupée dans Admin → Fonctions")
ok(requests.get(B + "/menus/resolved").status_code in (403, 404, 503), "fonction coupée : /menus/resolved fermé (le site garde ses menus d'origine)")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_menus": "true"}})

# --- suppression : les emplacements reprennent le menu d'origine
ok(requests.delete(f"{B}/admin/menus/{top}", headers=MOD).status_code == 403, "suppression refusée à un modérateur")
ok(requests.delete(f"{B}/admin/menus/{top}", headers=ADM).status_code == 200, "menu supprimé")
ok(requests.delete(f"{B}/admin/menus/{top}", headers=ADM).status_code == 404, "déjà supprimé : 404")
ok("web_top" not in requests.get(B + "/menus/resolved").json()["locations"], "emplacement libéré : menu d'origine")
ov = requests.get(B + "/admin/menus", headers=ADM).json()
ok(ov["locations"]["web_top"] is None and ov["locations"]["app_drawer"] == app_m, "seul l'emplacement du menu supprimé est libéré")
# journal d'audit
cur.execute("select count(*) from audit_log where summary like 'Menu%%' or summary like 'Menus affectés%%'")
ok(cur.fetchone()[0] >= 5, "actions consignées au journal d'audit")
cur.execute("delete from menu_locations"); cur.execute("delete from menus"); cur.execute("delete from site_pages where path like %s", (f"/p/%-{tag}",))
print("TOUT EST BON")
