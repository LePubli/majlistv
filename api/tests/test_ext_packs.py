"""Lot X1 : extensions déclaratives Mejliss (.zip). Prérequis : API (3055), PG (5544). Depuis la racine : python3 api/tests/test_ext_packs.py"""
import base64, io, json, zipfile, requests
B = "http://127.0.0.1:3055"
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
for _ in range(5):
    lg = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"})
    if lg.status_code == 200: break
A = {"authorization": "Bearer " + lg.json()["token"]}
def get(p): return requests.get(B + p, headers=A)
def post(p, body=None): return requests.post(B + p, headers=A, json=body if body is not None else {})
def data(buf): return "data:application/zip;base64," + base64.b64encode(buf).decode()
def example():
    r = get("/admin/ext-packs/example.zip"); return zipfile.ZipFile(io.BytesIO(r.content))
def pack(edit=None, drop=(), add=None, raw=None):
    z = example(); files = {n: z.read(n) for n in z.namelist()}
    for d in drop: files.pop(d, None)
    for k, v in (edit or {}).items(): files[k] = v if isinstance(v, bytes) else v.encode()
    for k, v in (add or {}).items(): files[k] = v if isinstance(v, bytes) else v.encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as w:
        for k, v in files.items(): w.writestr(k, v)
    return out.getvalue()
def manifest(**ch):
    m = json.loads(example().read("extension.json")); m.update(ch); return json.dumps(m)
def inspect(buf): return post("/admin/ext-packs/inspect", {"file": data(buf)}).json()
def refused(buf, label, frag=None):
    r = inspect(buf); ins = requests.post(B + "/admin/ext-packs", headers=A, json={"file": data(buf)})
    good = (not r["ok"]) and (frag is None or any(frag in e for e in r["errors"]))
    ok(good, f"refusé : {label}" + ("" if good else f" → {r.get('errors')}"))
    ok(ins.status_code == 400, f"  et non installé : {label}")
def sub(txt, a, b):
    assert a in txt, a; return txt.replace(a, b, 1)
TPL = example().read("blocks/bandeau.html").decode()

# nettoyage d'une exécution précédente
for p in get("/admin/ext-packs").json():
    for pg in get("/admin/pages").json():
        pass
page_ids = [p["id"] for p in get("/admin/pages").json() if p["path"] == "/p/essai-x1"]
for i in page_ids: requests.delete(B + f"/admin/pages/{i}", headers=A)
for p in get("/admin/ext-packs").json():
    if p["active"]: post(f"/admin/ext-packs/{p['slug']}/deactivate")
    requests.delete(B + f"/admin/ext-packs/{p['slug']}", headers=A)

# droits
for m, p in [("get", "/admin/ext-packs"), ("get", "/admin/ext-packs/example.zip"), ("get", "/admin/ext-packs/guide.md"), ("post", "/admin/ext-packs/inspect"), ("post", "/admin/ext-packs/exemple/activate"), ("post", "/admin/ext-packs/exemple/deactivate"), ("put", "/admin/ext-packs/exemple/values"), ("delete", "/admin/ext-packs/exemple")]:
    ok(getattr(requests, m)(B + p).status_code in (401, 403), f"{m.upper()} {p} : connexion obligatoire")

# kit
r = get("/admin/ext-packs/example.zip"); ok(r.status_code == 200 and r.content[:2] == b"PK", "exemple téléchargeable")
ok({"extension.json", "blocks/bandeau.html", "blocks/avis.html", "blocks/selection.json", "extension.css"} <= set(example().namelist()), "l'exemple contient manifeste, gabarits, assemblage, CSS")
g = get("/admin/ext-packs/guide.md").text
ok("{{#each" in g and "x_exemple_bandeau" not in g and "`talks`" in g and "`columns`" in g and "node api/ext-kit/validate.mjs" in g, "guide : syntaxe, blocs permis, validateur")
ok(all(t in g for t in ["`script`" if False else "`details`", "`aria-label`", "`mailto:`"]), "guide : balises, attributs, adresses")
ins = inspect(pack())
ok(ins["ok"] and ins["summary"]["blocks"] == 2 and ins["summary"]["composed"] == 1 and ins["summary"]["settings"] == 2 and ins["summary"]["features"] == 1, "inspection de l'exemple : valide")

# refus
refused(pack(edit={"blocks/bandeau.html": TPL + "<script>alert(1)</script>"}), "balise <script>", "script")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, '<h2>', '<h2 onclick="x()">')}), "attribut onclick", "onclick")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, '<h2>', '<h2 style="color:red">')}), "attribut style", "style")
refused(pack(edit={"blocks/bandeau.html": TPL + '<iframe src="https://x.test"></iframe>'}), "balise <iframe>", "iframe")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, 'href="{{btnUrl}}"', 'href="javascript:alert(1)"')}), "href javascript:", "href")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, 'href="{{btnUrl}}"', 'href="{{title}}"')}), "href lié à un champ texte", "type « url »")
refused(pack(edit={"blocks/bandeau.html": TPL + '<img src="{{title}}" alt="">'}), "src lié à un champ texte", "media")
refused(pack(edit={"blocks/bandeau.html": TPL + '<img src="https://x.test/a.png" alt="">'}), "src externe", "src")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, '{{title}}', '{{inconnu}}')}), "champ inconnu dans le gabarit", "inconnu")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, '{{t:badge}}', '{{t:absent}}')}), "texte inconnu", "absent")
refused(pack(edit={"blocks/bandeau.html": sub(TPL, '{{s:phone}}', '{{s:absent}}', ) if False else TPL.replace('{{s:phone}}', '{{s:absent}}')}), "réglage inconnu", "absent")
refused(pack(edit={"blocks/bandeau.html": TPL + "<p>"}), "balise non fermée", "fermée")
refused(pack(edit={"blocks/bandeau.html": TPL + "{{#if title}}"}), "{{#if}} non fermé", "jamais fermé")
refused(pack(edit={"blocks/avis.html": "{{#each items}}{{#each items}}x{{/each}}{{/each}}"}), "each imbriqué", "imbriqué")
refused(pack(edit={"extension.css": "body { background: red }"}), "CSS hors de l'extension", "Sélecteur")
refused(pack(edit={"extension.css": ":root { --accent: red }"}), "CSS :root", "Sélecteur")
refused(pack(edit={"extension.css": "@import url(https://x.test/a.css); .x-exemple-a{color:red}"}), "CSS @import", "@import")
refused(pack(edit={"extension.css": "@font-face { font-family: X; src: url(assets/a.woff2) } .x-exemple-a{color:red}"}), "CSS @font-face")
refused(pack(edit={"extension.css": ".x-exemple-a{background:url(https://x.test/a.png)}"}), "CSS url externe", "url()")
refused(pack(edit={"extension.css": ".other-class .x-exemple-a, .y{color:red}"}), "un sélecteur d'une liste sans classe de l'extension", "Sélecteur")
refused(pack(add={"blocks/x.js": "alert(1)"}), "fichier .js", "non permis")
refused(pack(add={"assets/a.png": b"\x89PNG\r\n\x1a\n"}), "image dans le .zip", "non permis")
refused(pack(edit={"extension.json": manifest(id="Bad_ID")}), "id invalide", "id")
refused(pack(edit={"extension.json": manifest(inconnue=1)}), "clé inconnue du manifeste", "inconnue")
refused(pack(edit={"extension.json": manifest(version="1")}), "version invalide", "version")
m = json.loads(manifest()); m["blocks"][0]["fields"][0]["kind"] = "script"
refused(pack(edit={"extension.json": json.dumps(m)}), "type de champ inconnu", "kind")
m = json.loads(manifest()); m["blocks"][0]["fields"].append({"k": "title", "kind": "t", "label": "x"})
refused(pack(edit={"extension.json": json.dumps(m)}), "champ en double", "double")
m = json.loads(manifest()); m["settings"][0]["default"] = "a\nb"
refused(pack(edit={"extension.json": json.dumps(m)}), "réglage multi-lignes", "default")
refused(pack(edit={"blocks/selection.json": json.dumps([{"type": "global", "props": {}}])}), "assemblage : bloc non permis", "non permis")
refused(pack(edit={"blocks/selection.json": json.dumps([{"type": "talks", "props": {"limit": "$title"}}])}), "assemblage : liaison de mauvais type", "attend")
refused(pack(edit={"blocks/selection.json": json.dumps([{"type": "talks", "props": {"limit": "$absent"}}])}), "assemblage : champ lié absent", "absent")
refused(pack(edit={"blocks/selection.json": json.dumps([{"type": "talks", "props": {"inconnu": 1}}])}), "assemblage : réglage inconnu", "inconnu")
refused(pack(edit={"blocks/selection.json": json.dumps([{"type": "talks", "props": {"limit": 99}}])}), "assemblage : valeur hors limite", "limit")
refused(b"pas un zip", "fichier qui n'est pas un .zip")

# installation (inactive)
r = post("/admin/ext-packs", {"file": data(pack())})
ok(r.status_code == 201 and r.json()["slug"] == "exemple" and r.json()["active"] is False, "installation (inactive)")
ok(len(r.json()["blocks"]) == 3 and r.json()["values"]["features"] == {"badge": True} and r.json()["values"]["settings"]["phone"] == "", "liste : blocs, valeurs par défaut")
th = requests.get(B + "/theme").json()
ok("x_exemple_bandeau" not in json.dumps(th.get("ext", {}).get("blocks", {})), "inactive : rien dans /theme")
# création d'une page avec un bloc d'extension inactive : refusée
pg = post("/admin/pages", {"kind": "custom", "title": "Essai X1", "slug": "essai-x1"}).json()
def blk(i, t, props): return {"id": i, "type": t, "props": props, "show": {"devices": ["m", "t", "d"], "audience": "all"}, "style": {}}
def put(blocks): return requests.put(B + f"/admin/pages/{pg['id']}/draft", headers=A, json={"content": {"meta": {}, "zones": {"main": blocks}}})
ok(put([blk("x1aaaa", "x_exemple_bandeau", {"title": {"fr": "Bonjour"}})]).status_code == 400, "bloc d'une extension inactive refusé")

# activation
r = post("/admin/ext-packs/exemple/activate"); ok(r.status_code == 200 and r.json()["active"], "activation")
th = requests.get(B + "/theme").json()["ext"]
ok({"x_exemple_bandeau", "x_exemple_avis", "x_exemple_selection"} <= set(th["blocks"]) and ".x-exemple-bandeau" in th["css"], "/theme : blocs et CSS de l'extension")
ok(th["texts"]["exemple"]["badge"]["ar"] and th["features"]["exemple"]["badge"] is True and th["settings"]["exemple"]["accent"] == "#C9A24B", "/theme : textes, fonctions, réglages")
ok(put([blk("x1aaaa", "x_exemple_bandeau", {"title": {"fr": "Bonjour"}, "look": "bold", "btnUrl": "/pricing"})]).status_code == 200, "bloc gabarit accepté en brouillon")
ok(put([blk("x1aaaa", "x_exemple_bandeau", {"look": "inconnu"})]).status_code == 400, "choix inconnu refusé")
ok(put([blk("x1aaaa", "x_exemple_bandeau", {"btnUrl": "javascript:alert(1)"})]).status_code == 400, "adresse javascript: refusée dans un champ")
ok(put([blk("x1bbbb", "x_exemple_avis", {"items": [{"quote": {"fr": "Super"}, "author": {"fr": "A"}}]})]).status_code == 200, "bloc avec liste accepté")
ok(put([blk("x1cccc", "x_exemple_selection", {"title": {"fr": "À voir"}, "limit": 6, "level": "beginner"})]).status_code == 200, "bloc composé accepté")
ok(put([blk("x1cccc", "x_exemple_selection", {"limit": 50})]).status_code == 400, "composé : valeur hors limite refusée")
all_blocks = [blk("x1aaaa", "x_exemple_bandeau", {"title": {"fr": "Bonjour"}}), blk("x1bbbb", "x_exemple_avis", {"items": [{"quote": {"fr": "Super"}, "author": {"fr": "A"}}]}), blk("x1cccc", "x_exemple_selection", {"title": {"fr": "À voir"}, "limit": 3})]
ok(put(all_blocks).status_code == 200, "trois blocs d'extension dans une page")
ok(post(f"/admin/pages/{pg['id']}/publish").status_code == 200, "publication")
v = requests.get(B + "/pages/view?path=/p/essai-x1").json()
ok([b["type"] for b in v["zones"]["main"]] == ["x_exemple_bandeau", "x_exemple_avis", "x_exemple_selection"], "vue publique")
k = post("/admin/pages", {"kind": "slot", "path": "/kids/histoires/essai"}) if False else None

# réglages et fonctions
ok(requests.put(B + "/admin/ext-packs/exemple/values", headers=A, json={"settings": {"phone": "01 02 03 04 05", "accent": "#112233"}, "features": {"badge": False}}).status_code == 200, "réglages enregistrés")
t2 = requests.get(B + "/theme").json()["ext"]
ok(t2["settings"]["exemple"]["phone"] == "01 02 03 04 05" and t2["features"]["exemple"]["badge"] is False, "/theme : nouvelles valeurs")
ok(requests.put(B + "/admin/ext-packs/exemple/values", headers=A, json={"settings": {"accent": "rouge"}}).status_code == 400, "couleur invalide refusée")
ok(requests.put(B + "/admin/ext-packs/exemple/values", headers=A, json={"settings": {"inconnu": "x"}}).status_code == 400, "réglage inconnu refusé")
ok(requests.put(B + "/admin/ext-packs/exemple/values", headers=A, json={"features": {"inconnue": True}}).status_code == 400, "fonction inconnue refusée")
ok(requests.put(B + "/admin/ext-packs/exemple/values", headers=A, json={"settings": {"phone": "a\nb"}}).status_code == 400, "texte multi-lignes refusé")

# désactivation / suppression refusées tant que des pages utilisent des blocs
r = post("/admin/ext-packs/exemple/deactivate"); ok(r.status_code == 409 and any(u["path"] == "/p/essai-x1" for u in r.json()["usedIn"]), "désactivation refusée : page utilisatrice listée")
ok(requests.delete(B + "/admin/ext-packs/exemple", headers=A).status_code == 409, "suppression refusée (active)")
# mise à jour retirant un bloc utilisé : refusée
m = json.loads(manifest()); m["version"] = "1.1.0"; m["composed"] = []
r = requests.post(B + "/admin/ext-packs", headers=A, json={"file": data(pack(edit={"extension.json": json.dumps(m)}, drop=["blocks/selection.json"]))})
ok(r.status_code == 409 and r.json().get("usedIn"), "mise à jour retirant un bloc utilisé : refusée")
# mise à jour compatible : réglages gardés
m = json.loads(manifest()); m["version"] = "1.2.0"
r = requests.post(B + "/admin/ext-packs", headers=A, json={"file": data(pack(edit={"extension.json": json.dumps(m)}))})
ok(r.status_code == 201 and r.json()["version"] == "1.2.0" and r.json()["values"]["settings"]["phone"] == "01 02 03 04 05", "mise à jour : réglages conservés")

# retrait de la page, puis désactivation, suppression
requests.delete(B + f"/admin/pages/{pg['id']}", headers=A)
r = post("/admin/ext-packs/exemple/deactivate"); ok(r.status_code == 200 and r.json()["active"] is False, "désactivation")
ok("x_exemple_bandeau" not in requests.get(B + "/theme").json()["ext"]["blocks"], "/theme : plus de blocs")
ok(requests.delete(B + "/admin/ext-packs/exemple", headers=A).status_code == 204, "suppression")
ok(not any(p["slug"] == "exemple" for p in get("/admin/ext-packs").json()), "extension absente de la liste")
print("\n%d échec(s)" % fails); raise SystemExit(1 if fails else 0)
