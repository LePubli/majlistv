"""Amélioration 7.2, étape 1 : tests A/B (moteur, affectation, comptage, inscription, appliquer le gagnant).
Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, time, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120"}  # un navigateur (les robots et python-requests sont ignorés)
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/features", headers=A, json={"values": {"experiments": True}})
cur.execute("update experiments set status='ended' where status in ('running','paused')")  # état propre
tag = uuid.uuid4().hex[:6]
VARS = [{"name": "Original", "weight": 50, "texts": {}}, {"name": "Accroche courte", "weight": 50, "texts": {"fr": {"vtLead": f"Apprenez mieux {tag}", "heroCta": "Je commence"}, "en": {"vtLead": f"Learn better {tag}"}}}]
mk = lambda **k: requests.post(B + "/admin/experiments", headers=A, json={"name": f"Test {tag}", "zone": "vitrine_hero", "variants": VARS, **k})
get = lambda i: next(e for e in requests.get(B + "/admin/experiments", headers=A).json()["experiments"] if e["id"] == i)

# Droits et validation
ok(requests.get(B + "/admin/experiments").status_code in (401, 403), "admin : réservé aux administrateurs")
ok(mk(zone="inconnue").status_code == 400, "zone inconnue refusée")
ok(requests.post(B + "/admin/experiments", headers=A, json={"name": "x", "zone": "vitrine_hero", "variants": [VARS[0]]}).status_code == 400, "un test a au moins 2 variantes")
bad = [VARS[0], {"name": "B", "weight": 50, "texts": {"fr": {"pasUneCle": "x"}}}]
ok(requests.post(B + "/admin/experiments", headers=A, json={"name": "x", "zone": "vitrine_hero", "variants": bad}).status_code == 400, "texte hors zone refusé")
empty = [VARS[0], {"name": "B", "weight": 50, "texts": {}}]
ok(requests.post(B + "/admin/experiments", headers=A, json={"name": "x", "zone": "vitrine_hero", "variants": empty}).status_code == 400, "variante B sans aucun texte refusée")
long = [VARS[0], {"name": "B", "weight": 50, "texts": {"fr": {"vtLead": "x" * 301}}}]
ok(requests.post(B + "/admin/experiments", headers=A, json={"name": "x", "zone": "vitrine_hero", "variants": long}).status_code == 400, "texte trop long refusé")

r = mk(); eid = r.json()["id"]
ok(r.status_code == 201 and get(eid)["status"] == "draft", "test créé en brouillon")
v = {x["key"]: x for x in get(eid)["variants"]}
ok(set(v) == {"A", "B"} and v["A"]["texts"] == {} and v["B"]["texts"]["fr"]["heroCta"] == "Je commence", "variantes A (original) et B enregistrées")
vis0 = "visiteur-" + uuid.uuid4().hex
ok(requests.get(B + "/xp/active", params={"visitor": vis0}).json()["experiments"] == [], "brouillon : aucun test servi au public")

# Modifier un brouillon, démarrer
ok(requests.patch(f"{B}/admin/experiments/{eid}", headers=A, json={"name": f"Test modifié {tag}"}).status_code == 200, "brouillon modifiable")
ok(requests.post(f"{B}/admin/experiments/{eid}/start", headers=A).status_code == 200 and get(eid)["status"] == "running", "test démarré")
other = requests.post(B + "/admin/experiments", headers=A, json={"name": "Autre", "zone": "vitrine_hero", "variants": VARS}).json()["id"]
r = requests.post(f"{B}/admin/experiments/{other}/start", headers=A)
ok(r.status_code == 409 and r.json()["code"] == "zone_busy", "un seul test en cours par zone")
ok(requests.patch(f"{B}/admin/experiments/{eid}", headers=A, json={"name": "x"}).status_code == 409, "test démarré : plus modifiable")
ok(requests.delete(f"{B}/admin/experiments/{eid}", headers=A).status_code == 409, "test en cours : non supprimable")
time.sleep(11)  # cache de 10 s des tests en cours

# Affectation
def active(vis):
    return requests.get(B + "/xp/active", params={"visitor": vis}).json()["experiments"]
a = active(vis0)
ok(len(a) == 1 and a[0]["zone"] == "vitrine_hero" and a[0]["variant"] in ("A", "B"), "visiteur : variante servie")
ok(active(vis0)[0]["variant"] == a[0]["variant"], "visiteur : la même variante à chaque visite")
ok(requests.get(B + "/xp/active").json()["experiments"] == [] and requests.get(B + "/xp/active", params={"visitor": "court"}).json()["experiments"] == [], "sans identifiant valide : rien (le site montre l'original)")
split = {"A": 0, "B": 0}; sample = {}
for i in range(300):
    vv = f"v{i:03d}-" + uuid.uuid4().hex
    x = active(vv)[0]; split[x["variant"]] += 1; sample[vv] = x
ok(100 < split["A"] < 200 and 100 < split["B"] < 200, f"répartition ~50/50 sur 300 visiteurs ({split})")
bv = next(x for x in sample.values() if x["variant"] == "B")
ok(bv["texts"]["fr"]["vtLead"] == f"Apprenez mieux {tag}" and active(next(k for k, x in sample.items() if x["variant"] == "A"))[0]["texts"] == {}, "B reçoit ses textes, A (original) aucun")

# Comptage
for vv in sample:
    requests.post(B + "/xp/expose", json={"visitor": vv, "experiment": eid}, headers=UA)
requests.post(B + "/xp/expose", json={"visitor": next(iter(sample)), "experiment": eid}, headers=UA)  # doublon
ok(requests.post(B + "/xp/expose", json={"visitor": "court", "experiment": eid}, headers=UA).status_code == 200, "identifiant invalide : ignoré sans erreur")
requests.post(B + "/xp/expose", json={"visitor": "bot-" + uuid.uuid4().hex, "experiment": eid}, headers={"user-agent": "Googlebot/2.1"})
e = get(eid); tot = sum(x["visitors"] for x in e["variants"])
ok(tot == 300, f"300 visiteurs comptés une seule fois (doublon, robot et identifiant invalide ignorés) : {tot}")
for x in e["variants"]:
    ok(x["visitors"] == split[x["key"]], f"variante {x['key']} : visiteurs = {split[x['key']]}")
vb = next(k for k, x in sample.items() if x["variant"] == "B")
requests.post(B + "/xp/click", json={"visitor": vb, "experiment": eid}, headers=UA)
ok({x["key"]: x["clicks"] for x in get(eid)["variants"]}["B"] == 1, "clic compté")

# Inscription : conversion du visiteur vb
em = f"xp-{tag}@test.local"
tok = requests.post(B + "/auth/register", json={"email": em, "password": "MotDePasse-test1", "locale": "fr"}).json()["token"]
H = {"authorization": "Bearer " + tok}
ok(requests.post(B + "/xp/convert", json={"visitor": vb}).status_code == 401, "conversion : connexion obligatoire")
ok(requests.post(B + "/xp/convert", headers=H, json={"visitor": vb}).json()["counted"] == 1, "inscription comptée pour le visiteur exposé")
ok(requests.post(B + "/xp/convert", headers=H, json={"visitor": vb}).json()["counted"] == 0, "pas de double comptage")
ok(requests.post(B + "/xp/convert", headers=H, json={"visitor": "inconnu-" + uuid.uuid4().hex}).json()["counted"] == 0, "visiteur jamais exposé : rien compté")
cur.execute("update users set created_at = now() - interval '1 hour' where email = %s", (em,))
ok(requests.post(B + "/xp/convert", headers=H, json={"visitor": next(k for k, x in sample.items() if x["variant"] == "A")}).json()["counted"] == 0, "compte ancien : conversion refusée")
st = {x["key"]: x for x in get(eid)["variants"]}
ok(st["B"]["conversions"] == 1 and st["A"]["conversions"] == 0 and st["B"]["verdict"] == "collecting", "chiffres : 1 inscription pour B, verdict « pas assez de données »")

# Pause, reprise, fin avec application du gagnant
ok(requests.post(f"{B}/admin/experiments/{eid}/pause", headers=A).status_code == 200, "pause")
time.sleep(11)
ok(active(vis0) == [], "en pause : le site montre l'original")
ok(requests.post(f"{B}/admin/experiments/{eid}/start", headers=A).status_code == 200, "reprise")
ok(requests.post(f"{B}/admin/experiments/{eid}/end", headers=A, json={"winner": "Z"}).status_code == 400, "gagnant inconnu refusé")
r = requests.post(f"{B}/admin/experiments/{eid}/end", headers=A, json={"winner": "B", "apply": True}).json()
ok(r["applied"] == 3, "fin : 3 textes de la variante B appliqués au site")
t = requests.get(B + "/texts").json()["texts"]
ok(t["fr"]["vtLead"] == f"Apprenez mieux {tag}" and t["fr"]["heroCta"] == "Je commence" and t["en"]["vtLead"] == f"Learn better {tag}", "les textes gagnants sont dans Admin → Textes (site_texts)")
e = get(eid); ok(e["status"] == "ended" and e["winner"] == "B", "test terminé, gagnant B")
ok(requests.post(f"{B}/admin/experiments/{eid}/end", headers=A, json={}).status_code == 409, "un test terminé ne se termine pas deux fois")
cur.execute("select summary from audit_log where route like '/admin/experiments%%' order by id desc limit 3")
ok(any("appliquée au site" in (x[0] or "") for x in cur.fetchall()), "journal : la fin du test et l'application sont inscrites")


# ---------- Zone « page Tarifs » : textes + réglages de présentation ----------
PV = [{"name": "Original", "weight": 50, "texts": {}}, {"name": "Mensuelle en avant", "weight": 50, "texts": {"fr": {"pricingTitle": f"Choisissez {tag}"}}, "options": {"highlight": "month", "order": "year_first"}}]
mkp = lambda v: requests.post(B + "/admin/experiments", headers=A, json={"name": f"Tarifs {tag}", "zone": "pricing", "variants": v})
ok(mkp([PV[0], {"name": "B", "weight": 50, "texts": {}, "options": {"highlight": "zzz"}}]).status_code == 400, "tarifs : valeur de réglage inconnue refusée")
ok(mkp([PV[0], {"name": "B", "weight": 50, "texts": {}, "options": {"prix": "1"}}]).status_code == 400, "tarifs : réglage inconnu refusé (aucun moyen de toucher aux prix)")
ok(mkp([PV[0], {"name": "B", "weight": 50, "texts": {}, "options": {}}]).status_code == 400, "tarifs : une variante qui ne change rien est refusée")
ok(mkp([PV[0], {"name": "B", "weight": 50, "texts": {}, "options": {"highlight": "month"}}]).status_code == 201, "tarifs : une variante avec seulement un réglage est acceptée")
cur.execute("delete from experiments where zone='pricing'")
pid = mkp(PV).json()["id"]
pv = {x["key"]: x for x in get(pid)["variants"]}
ok(pv["B"]["options"] == {"highlight": "month", "order": "year_first"}, "tarifs : réglages de la variante B enregistrés")
ok(requests.post(f"{B}/admin/experiments/{pid}/start", headers=A).status_code == 200, "tarifs : démarré en même temps que d'autres zones (une zone = un test)")
time.sleep(11)
seenB = None
for i in range(40):
    x = [e for e in active(f"p{i:03d}-" + uuid.uuid4().hex) if e["zone"] == "pricing"][0]
    if x["variant"] == "B": seenB = x; break
ok(seenB and seenB["options"] == {"highlight": "month", "order": "year_first"} and seenB["texts"]["fr"]["pricingTitle"] == f"Choisissez {tag}", "tarifs : le visiteur B reçoit textes et réglages")
lay = requests.get(B + "/billing/plans").json()["layout"]
ok(lay == {"highlight": "year", "order": "month_first"}, "tarifs : réglages du site par défaut (annuelle en avant, mensuelle d'abord)")
r = requests.post(f"{B}/admin/experiments/{pid}/end", headers=A, json={"winner": "B", "apply": True}).json()
ok(r["applied"] == 1 and r["appliedOptions"] == 2, "tarifs : gagnant appliqué (1 texte, 2 réglages)")
ok(requests.get(B + "/billing/plans").json()["layout"] == {"highlight": "month", "order": "year_first"}, "tarifs : les réglages gagnants sont ceux du site")
cur.execute("delete from app_settings where key in ('pricing_highlight','pricing_order')")
cur.execute("delete from site_texts where key='pricingTitle' and value like %s", (f"%{tag}",))
ok(requests.delete(f"{B}/admin/experiments/{pid}", headers=A).status_code == 200, "tarifs : test supprimé")

# Nettoyage
cur.execute("delete from site_texts where key in ('vtLead','heroCta') and (value like %s or value = 'Je commence' or value like %s)", (f"%{tag}", f"%{tag}"))
ok(requests.delete(f"{B}/admin/experiments/{eid}", headers=A).status_code == 200 and requests.delete(f"{B}/admin/experiments/{other}", headers=A).status_code == 200, "tests terminés/brouillons supprimables")
cur.execute("delete from users where email=%s", (em,))
print("TOUT OK : tests A/B")
