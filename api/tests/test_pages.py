"""Étape I3 : pages en blocs (création, validation, brouillon, publication, public selon visiteur/membre/abonné, emplacements, images, historique).
Prérequis : API (3055), PG de test (5544), stockage S3 de test (moto, bucket majlis-videos).
Lancement depuis la racine du dépôt : python3 api/tests/test_pages.py"""
import base64, filecmp, os, struct, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def mk_user(prefix):
    mail = f"{prefix}-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": mail, "password": "Passw0rd-test", "name": prefix})
    return mail, login(mail, "Passw0rd-test")


A = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
_, MEMBER = mk_user("membre")
smail, SUB = mk_user("abonne")
cur.execute("update users set premium_until = now() + interval '2 days' where email = %s", (smail,))


def clean():
    """Remet à zéro par l'API (elle garde un cache des emplacements : on ne vide pas la table directement)."""
    for pg in requests.get(B + "/admin/pages", headers=A).json():
        requests.delete(B + f"/admin/pages/{pg['id']}", headers=A)
    for m in requests.get(B + "/admin/page-media", headers=A).json():
        requests.delete(B + f"/admin/page-media/{m['id']}", headers=A)


clean()

# --- Les deux copies du module de blocs sont identiques
ok(filecmp.cmp(os.path.join(ROOT, "api/src/blocks.js"), os.path.join(ROOT, "web/lib/blocks.js"), shallow=False), "api/src/blocks.js et web/lib/blocks.js identiques")

# --- Public sans rien
ok(requests.get(B + "/pages/slots").json()["slots"] == {}, "aucun emplacement au départ")
ok(requests.get(B + "/pages/view", params={"path": "/p/rien"}).status_code == 404, "page inconnue : 404")
ok(requests.get(B + "/pages/view", params={"path": "/P/../x"}).status_code == 400, "adresse invalide : 400")

# --- Droits
ok(requests.get(B + "/admin/pages").status_code == 401, "liste : connexion requise")
ok(requests.get(B + "/admin/pages", headers=MEMBER).status_code == 403, "liste : réservée à l'administrateur")
ok(requests.post(B + "/admin/pages", headers=MEMBER, json={"kind": "custom", "title": "X"}).status_code == 403, "un membre ne peut pas créer de page")
ok(requests.post(B + "/admin/page-media", headers=MEMBER, json={"file": "data:image/png;base64,AAAA"}).status_code == 403, "un membre ne peut pas envoyer d'image")

# --- Création : pages personnalisées
def create(**kw):
    return requests.post(B + "/admin/pages", headers=A, json=kw)

ok(create(kind="custom").status_code == 400, "titre obligatoire")
ok(create(kind="custom", title="X", slug="Mauvais Slug!").status_code == 400, "adresse invalide refusée")
ok(create(kind="custom", title="X", slug="a/../b").status_code == 400, "adresse avec / refusée")
r = create(kind="custom", title=f"Ramadan 2027 é {tag}")
ok(r.status_code == 201 and r.json()["path"] == f"/p/ramadan-2027-e-{tag}" and r.json()["live"] is False, "page créée, adresse déduite du titre (sans accents), hors ligne")
P = r.json()["id"]; PATH = r.json()["path"]
ok(create(kind="custom", title="Autre", slug=f"ramadan-2027-e-{tag}").status_code == 409, "adresse déjà prise : 409")
ok(requests.get(B + "/pages/view", params={"path": PATH}).status_code == 404, "page non publiée : invisible")

# --- Création : emplacements sur une page existante
for bad in ["/admin", "/admin/x", "/studio/new", "/kids", "/kids/home", "/api/talks", "/p/x", "//evil.com", "/Pricing", "pricing", "/a b", "/pb-preview"]:
    ok(create(kind="slot", path=bad).status_code == 400, f"emplacement refusé : {bad}")
r = create(kind="slot", path="/pricing/")
ok(r.status_code == 201 and r.json()["path"] == "/pricing", "emplacement sur /pricing (barre finale retirée)")
S = r.json()["id"]
ok(create(kind="slot", path="/pricing").status_code == 409, "emplacement déjà créé : 409")

# --- Validation du brouillon
def put_draft(pid, content):
    return requests.put(B + f"/admin/pages/{pid}/draft", headers=A, json={"content": content})

def blk(type, props=None, show=None, style=None, bid=None):
    return {"id": bid or "b" + uuid.uuid4().hex[:8], "type": type, "props": props or {}, "show": show or {"devices": ["m", "t", "d"], "audience": "all"}, "style": style or {}}

def main(*blocks, meta=None):
    return {"meta": meta or {}, "zones": {"main": list(blocks)}}

def errs(content):
    r = put_draft(P, content)
    return r.status_code, (r.json().get("errors") or {})

sc, e = errs(main(blk("button", {"label": {"fr": "Clic"}, "url": "javascript:alert(1)"})))
ok(sc == 400 and "zones.main.0.props.url" in e, "adresse javascript: refusée")
for u in ["//evil.com", "data:text/html,x", "http://insecure.test", "https://a.test/\"onclick=", "/ok path"]:
    sc, e = errs(main(blk("button", {"url": u})))
    ok(sc == 400 and "zones.main.0.props.url" in e, f"adresse refusée : {u}")
for u in ["/pricing", "https://exemple.fr/page?x=1#a", "mailto:a@b.fr", "tel:+33123456789"]:
    ok(errs(main(blk("button", {"url": u})))[0] == 200, f"adresse acceptée : {u}")
sc, e = errs(main(blk("nexiste_pas")))
ok(sc == 400 and "zones.main.0.type" in e, "type de bloc inconnu refusé")
sc, e = errs(main(blk("heading", {"title": {"de": "x"}})))
ok(sc == 400 and "zones.main.0.props.title" in e, "langue inconnue refusée")
sc, e = errs(main(blk("heading", {"title": {"fr": "a\nb"}})))
ok(sc == 400, "retour à la ligne refusé dans un titre")
sc, e = errs(main(blk("heading", {"title": {"fr": "x" * 201}})))
ok(sc == 400, "titre trop long refusé")
sc, e = errs(main(blk("text", {"body": {"fr": "a\u0000b"}})))
ok(sc == 400, "caractère de contrôle refusé")
sc, e = errs(main(blk("text", {"body": {"fr": "ligne 1\nligne 2 <script>alert(1)</script> **gras**"}})))
ok(sc == 200, "HTML dans un texte accepté comme du texte brut (affiché tel quel, jamais interprété)")
sc, e = errs(main(blk("text", {"body": {"fr": "x"}}, style={"textColor": "red;}body{display:none"})))
ok(sc == 400 and "zones.main.0.style.textColor" in e, "couleur dangereuse refusée")
sc, e = errs(main(blk("text", {"body": {"fr": "x"}}, style={"bgColor": "@inconnue"})))
ok(sc == 400, "couleur du thème inconnue refusée")
ok(errs(main(blk("text", {"body": {"fr": "x"}}, style={"textColor": "#FF00AA", "bgColor": "@surface", "align": "center", "padTop": 24, "padBottom": 0, "radius": 16, "maxWidth": "narrow"})))[0] == 200, "style valide accepté")
sc, e = errs(main(blk("text", {"body": {"fr": "x"}}, style={"padTop": 999})))
ok(sc == 400, "espacement hors limites refusé")
sc, e = errs(main(blk("text", {"body": {"fr": "x"}}, style={"bidon": 1})))
ok(sc == 400, "réglage de style inconnu refusé")
sc, e = errs(main(blk("text", {"body": {"fr": "x"}}, show={"devices": [], "audience": "all"})))
ok(sc == 400 and "zones.main.0.show.devices" in e, "au moins un appareil")
sc, e = errs(main(blk("text", {"body": {"fr": "x"}}, show={"devices": ["m"], "audience": "tous les pirates"})))
ok(sc == 400 and "zones.main.0.show.audience" in e, "public inconnu refusé")
sc, e = errs(main(blk("video", {"url": "https://evil.test/watch?v=abcdefghijk"})))
ok(sc == 400, "vidéo : adresse d'un autre site refusée")
ok(errs(main(blk("video", {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})))[0] == 200, "vidéo YouTube acceptée")
ok(errs(main(blk("video", {"url": "https://vimeo.com/123456789"})))[0] == 200, "vidéo Vimeo acceptée")
sc, e = errs(main(blk("image", {"image": "../../etc/passwd"})))
ok(sc == 400, "image : identifiant non valide refusé")
sc, e = errs(main(*[blk("spacer") for _ in range(61)]))
ok(sc == 400 and "zones.main" in e, "61 blocs refusés")
b1 = blk("text", {"body": {"fr": "x"}}, bid="dup12345"); b2 = blk("text", {"body": {"fr": "y"}}, bid="dup12345")
sc, e = errs(main(b1, b2))
ok(sc == 400, "identifiant de bloc en double refusé")
sc, e = errs({"meta": {}, "zones": {"main": [], "before": []}})
ok(sc == 400 and "zones.before" in e, "zone qui n'existe pas pour ce type de page refusée")
ok(put_draft(P, "nimportequoi").status_code == 400, "contenu qui n'est pas un objet refusé")
ok(put_draft(999999, main()).status_code == 404, "page inconnue : 404")
# Brouillon incomplet permis, publication refusée
ok(errs(main(blk("image", {}), blk("talks", {"source": "category"}), blk("video", {})))[0] == 200, "brouillon incomplet (image, vidéo, catégorie vides) accepté")
r = requests.post(B + f"/admin/pages/{P}/publish", headers=A)
ok(r.status_code == 400 and len(r.json()["errors"]) == 3, "publication refusée : 3 blocs incomplets signalés")

# --- Images
png = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + os.urandom(40)
def upload(data, name="photo.png", mime="image/png"):
    return requests.post(B + "/admin/page-media", headers=A, json={"name": name, "file": f"data:{mime};base64," + base64.b64encode(data).decode()})
ok(upload(b"hello world, ceci n'est pas une image").status_code == 400, "un fichier qui n'est pas une image est refusé")
ok(upload(b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "x.svg", "image/svg+xml").status_code == 400, "SVG refusé (pas d'image vectorielle exécutable)")
ok(upload(b"\x89PNG\r\n\x1a\n" + os.urandom(3_300_000)).status_code == 400, "image de plus de 3 Mo refusée")
r = upload(png)
ok(r.status_code == 201 and r.json()["contentType"] == "image/png", "image PNG envoyée")
IMG = r.json()["id"]
g = requests.get(B + f"/pages/media/{IMG}")
ok(g.status_code == 200 and g.content == png and g.headers["content-type"] == "image/png" and "immutable" in g.headers["cache-control"] and g.headers["x-content-type-options"] == "nosniff", "image servie telle quelle, cache long, nosniff")
ok(requests.get(B + f"/pages/media/{uuid.uuid4()}").status_code == 404, "image inconnue : 404")
ok(any(m["id"] == IMG for m in requests.get(B + "/admin/page-media", headers=A).json()), "image dans la bibliothèque")

# --- Contenu complet, publication, public selon visiteur
blocks = [
    blk("hero", {"title": {"fr": "Bienvenue", "en": "Welcome", "ar": "مرحبا"}, "btn1Label": {"fr": "Go"}, "btn1Url": "/pricing", "image": IMG, "overlay": 40, "height": "l"}, bid="hero0001"),
    blk("heading", {"title": {"fr": "Pour tous"}, "level": "h3"}, bid="all00001"),
    blk("text", {"body": {"fr": "Réservé aux visiteurs"}}, show={"devices": ["m", "t", "d"], "audience": "visitor"}, bid="vis00001"),
    blk("text", {"body": {"fr": "Réservé aux membres"}}, show={"devices": ["m", "t", "d"], "audience": "member"}, bid="mem00001"),
    blk("text", {"body": {"fr": "Réservé aux abonnés"}}, show={"devices": ["d"], "audience": "subscriber"}, bid="sub00001"),
    blk("text", {"body": {"fr": "Membres sans abonnement"}}, show={"devices": ["m"], "audience": "free"}, bid="fre00001"),
    blk("cards", {"columns": "2", "items": [{"title": {"fr": "A"}, "text": {"fr": "a"}, "link": "/", "image": IMG}, {"title": {"fr": "B"}}]}, bid="car00001"),
    blk("talks", {"source": "latest", "limit": 3}, bid="tal00001"),
    blk("faq", {"items": [{"q": {"fr": "Q ?"}, "a": {"fr": "R"}}]}, bid="faq00001"),
    blk("quote", {"text": {"fr": "Citation"}, "author": {"fr": "Auteur"}}, bid="quo00001"),
    blk("video", {"url": "https://youtu.be/dQw4w9WgXcQ"}, bid="vid00001"),
    blk("spacer", {"size": 60}, bid="spa00001"), blk("divider", {}, bid="div00001"),
]
r = put_draft(P, main(*blocks, meta={"title": {"fr": "Ramadan", "en": "Ramadan EN"}, "description": {"fr": "Une page spéciale"}}))
ok(r.status_code == 200 and r.json()["hasDraft"] and len(r.json()["content"]["zones"]["main"]) == len(blocks), "brouillon complet enregistré")
ok(requests.delete(B + f"/admin/page-media/{IMG}", headers=A).status_code == 409, "image utilisée : suppression refusée")
ok(requests.get(B + "/pages/view", params={"path": PATH}).status_code == 404, "brouillon invisible sur le site")
r = requests.post(B + f"/admin/pages/{P}/publish", headers=A)
ok(r.status_code == 200 and r.json()["live"] and not r.json()["hasDraft"], "page publiée et en ligne")
ok(requests.post(B + f"/admin/pages/{P}/publish", headers=A).status_code == 409, "rien à publier sans brouillon")

def ids(headers=None, ssr=False):
    p = {"path": PATH}
    if ssr: p["ssr"] = "1"
    r = requests.get(B + "/pages/view", params=p, headers=headers or {})
    assert r.status_code == 200, r.text
    j = r.json()
    return [b["id"] for b in j["zones"]["main"]], j

common = ["hero0001", "all00001", "car00001", "tal00001", "faq00001", "quo00001", "vid00001", "spa00001", "div00001"]
v, j = ids()
ok(v == ["hero0001", "all00001", "vis00001"] + common[2:], "visiteur non connecté : blocs « tout le monde » + « visiteurs »")
ok(j["meta"]["title"]["en"] == "Ramadan EN" and j["title"], "titres par langue fournis")
v, _ = ids(MEMBER)
ok("mem00001" in v and "fre00001" in v and "vis00001" not in v and "sub00001" not in v, "membre sans abonnement : « membres » + « sans abonnement »")
v, _ = ids(SUB)
ok("mem00001" in v and "sub00001" in v and "fre00001" not in v and "vis00001" not in v, "abonné : « membres » + « abonnés »")
v, _ = ids(A)
ok("sub00001" in v and "mem00001" in v and "vis00001" not in v, "administrateur : traité comme un abonné")
v, j = ids(ssr=True)
ok(v == common and j["targeted"] is True, "rendu serveur : seulement « tout le monde », avec l'indication de blocs ciblés (aucune fuite)")
ok(requests.get(B + "/pages/view", params={"path": PATH}, headers={"authorization": "Bearer faux"}).status_code == 200, "jeton invalide : traité comme un visiteur")
j = requests.get(B + "/pages/view", params={"path": PATH}).json()
ok(all(set(b) == {"id", "type", "props", "show", "style"} for b in j["zones"]["main"]), "les blocs ne contiennent que des champs propres")

# --- Hors ligne / en ligne
ok(requests.put(B + f"/admin/pages/{P}/live", headers=A, json={"live": False}).json()["live"] is False, "mise hors ligne")
ok(requests.get(B + "/pages/view", params={"path": PATH}).status_code == 404, "page hors ligne : 404")
ok(requests.put(B + f"/admin/pages/{P}/live", headers=A, json={"live": True}).json()["live"] is True, "remise en ligne")
ok(requests.put(B + f"/admin/pages/{S}/live", headers=A, json={"live": True}).status_code == 409, "jamais publiée : on ne peut pas la mettre en ligne")

# --- Emplacements sur une page existante
sc = {"meta": {}, "zones": {"before": [blk("heading", {"title": {"fr": "Offre spéciale"}}, bid="pre00001"), blk("text", {"body": {"fr": "Pour les abonnés"}}, show={"devices": ["m", "t", "d"], "audience": "subscriber"}, bid="pre00002")], "after": [blk("button", {"label": {"fr": "Écrire"}, "url": "mailto:a@b.fr"}, bid="aft00001")]}}
ok(put_draft(S, sc).status_code == 200, "brouillon d'emplacement enregistré")
ok(requests.get(B + "/pages/slots").json()["slots"] == {}, "emplacement non publié : absent de la liste")
ok(requests.post(B + f"/admin/pages/{S}/publish", headers=A).status_code == 200, "emplacement publié")
sl = requests.get(B + "/pages/slots").json()
ok(list(sl["slots"]) == ["/pricing"] and [b["id"] for b in sl["slots"]["/pricing"]["before"]] == ["pre00001"] and [b["id"] for b in sl["slots"]["/pricing"]["after"]] == ["aft00001"] and sl["slots"]["/pricing"]["targeted"] is True, "emplacements : seulement « tout le monde » + indication de blocs ciblés")
j = requests.get(B + "/pages/view", params={"path": "/pricing"}, headers=SUB).json()
ok([b["id"] for b in j["zones"]["before"]] == ["pre00001", "pre00002"], "abonné : voit aussi le bloc réservé aux abonnés sur /pricing")
ok(requests.put(B + f"/admin/pages/{S}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": []}}}).status_code == 400, "emplacement : la zone « main » n'existe pas")
v1 = requests.get(B + "/pages/slots").json()["version"]
requests.put(B + f"/admin/pages/{S}/live", headers=A, json={"live": False})
ok(requests.get(B + "/pages/slots").json()["slots"] == {} and requests.get(B + "/pages/slots").json()["version"] != v1, "emplacement hors ligne : retiré")
requests.put(B + f"/admin/pages/{S}/live", headers=A, json={"live": True})

# --- Historique
put_draft(P, main(blk("heading", {"title": {"fr": "Version 2"}}, bid="v2000001")))
requests.post(B + f"/admin/pages/{P}/publish", headers=A)
vs = requests.get(B + f"/admin/pages/{P}/versions", headers=A).json()
ok(len(vs) == 2 and vs[0]["blocks"] == 1 and vs[1]["blocks"] == len(blocks), "deux versions dans l'historique, la plus récente d'abord")
r = requests.post(B + f"/admin/pages/{P}/versions/{vs[1]['id']}/restore", headers=A)
ok(r.status_code == 200 and r.json()["hasDraft"] and len(r.json()["draft"]["zones"]["main"]) == len(blocks), "ancienne version recopiée dans le brouillon")
ok(requests.get(B + "/pages/view", params={"path": PATH}).json()["zones"]["main"][0]["id"] == "v2000001", "restaurer ne publie pas tout seul")
ok(requests.delete(B + f"/admin/pages/{P}/draft", headers=A).json()["hasDraft"] is False, "brouillon abandonné")
ok(requests.post(B + f"/admin/pages/{P}/versions/999999/restore", headers=A).status_code == 404, "version inconnue : 404")

# --- Changer l'adresse / le titre
r = requests.patch(B + f"/admin/pages/{P}", headers=A, json={"title": "Nouveau titre", "slug": f"nouveau-{tag}"})
ok(r.status_code == 200 and r.json()["path"] == f"/p/nouveau-{tag}", "adresse et titre modifiés")
ok(requests.get(B + "/pages/view", params={"path": PATH}).status_code == 404 and requests.get(B + "/pages/view", params={"path": f"/p/nouveau-{tag}"}).status_code == 200, "ancienne adresse : 404, nouvelle adresse : en ligne")
ok(requests.patch(B + f"/admin/pages/{S}", headers=A, json={"slug": "autre"}).status_code == 400, "l'adresse d'une page existante ne se change pas")
r2 = create(kind="custom", title="Deuxième", slug=f"deux-{tag}")
ok(requests.patch(B + f"/admin/pages/{r2.json()['id']}", headers=A, json={"slug": f"nouveau-{tag}"}).status_code == 409, "adresse déjà prise : 409")

# --- Liste, images, suppression
lst = requests.get(B + "/admin/pages", headers=A).json()
ok(len(lst) == 3 and {x["kind"] for x in lst} == {"custom", "slot"}, "liste des pages")
ok(requests.delete(B + f"/admin/pages/{r2.json()['id']}", headers=A).status_code == 204, "page supprimée")
requests.put(B + f"/admin/pages/{P}/draft", headers=A, json={"content": main()}); requests.post(B + f"/admin/pages/{P}/publish", headers=A)
ok(requests.delete(B + f"/admin/page-media/{IMG}", headers=A).status_code == 204, "image non utilisée : supprimée")
ok(requests.get(B + f"/pages/media/{IMG}").status_code == 404, "fichier supprimé")

# --- Journal des actions
cur.execute("select summary from audit_log where route like '/admin/pages/:id/publish' order by at desc limit 1")
ok("publiée" in (cur.fetchone() or [""])[0], "publication inscrite au journal des actions")

# --- Maintenance : pages publiques lisibles
requests.put(B + "/admin/features", json={"values": {"maintenance": True}}, headers=A); time.sleep(5.3)
ok(requests.get(B + "/pages/slots").status_code == 200 and requests.get(B + "/pages/view", params={"path": f"/p/nouveau-{tag}"}).status_code == 200, "pages et emplacements lisibles pendant la maintenance")
requests.put(B + "/admin/features", json={"values": {"maintenance": False}}, headers=A); time.sleep(5.3)
clean()
print("TOUT EST BON")
