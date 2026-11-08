"""7.2 étape 4 : test de prix (A/B des prix de l'abonnement). 
Prérequis : API (3055) lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (python3 api/tests/mock_stripe.py) et PG de test (5544)."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120"}
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v, "confirmStripeReset": True})
tag = uuid.uuid4().hex[:6]
SECRET = "whsec_price_test"
cur.execute("delete from experiments where zone in ('price','pricing')")
cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")

# --- sans Stripe : un test de prix ne peut pas être créé
put({"stripe_secret_key": None, "stripe_webhook_secret": None, "stripe_price_monthly": None, "stripe_price_yearly": None})
mk = lambda v, name="Prix": requests.post(B + "/admin/experiments", headers=A, json={"name": name + " " + tag, "zone": "price", "variants": v})
V0 = {"name": "Prix actuel", "weight": 50}
VB = lambda **p: {"name": "Moins cher", "weight": 50, "prices": p}
ok(mk([V0, VB(month="price_tm")]).status_code == 400, "sans Stripe configuré : refusé (message clair)")

r = put({"stripe_secret_key": "sk_test_px", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y",
         "stripe_price_learn_monthly": None, "stripe_price_learn_yearly": None, "paypal_enabled": None, "payment_methods_extra": None})
ok(r.status_code == 200, "réglages Stripe de test")
cur.execute("delete from price_regions")

# --- contrôles à la création
ok(mk([V0, VB()]).status_code == 400, "variante sans aucun prix refusée")
ok(mk([V0, VB(month="price_inconnu")]).status_code == 400, "prix inconnu chez Stripe refusé")
ok(mk([V0, VB(month="price_ty")]).status_code == 400, "prix annuel donné comme mensuel refusé")
ok(mk([V0, VB(month="price_old")]).status_code == 400 and "archiv" in mk([V0, VB(month="price_old")]).json()["error"], "prix archivé refusé")
ok(mk([V0, VB(month="price_once")]).status_code == 400, "prix non récurrent refusé")
ok(mk([V0, VB(month="price_usd")]).status_code == 400 and "devise" in mk([V0, VB(month="price_usd")]).json()["error"], "autre devise refusée")
ok(mk([V0, VB(month="price_m")]).status_code == 400, "prix identique au prix actuel refusé")
ok(mk([V0, {"name": "B", "weight": 50, "texts": {"fr": {"vtLead": "x"}}, "prices": {"month": "price_tm"}}]).status_code == 400, "texte dans un test de prix refusé")
c = mk([V0, VB(month="price_tm", year="price_ty")])
ok(c.status_code == 201, "test de prix valide créé en brouillon")
eid = c.json()["id"]
cur.execute("select goal from experiments where id=%s", (eid,))
ok(cur.fetchone()[0] == "subscription", "objectif : abonnement")

# --- conflit avec un test de la page Tarifs
pt = requests.post(B + "/admin/experiments", headers=A, json={"name": "Tarifs " + tag, "zone": "pricing", "variants": [V0, {"name": "B", "weight": 50, "texts": {"fr": {"pricingTitle": "x"}}}]}).json()["id"]
ok(requests.post(f"{B}/admin/experiments/{pt}/start", headers=A).status_code == 200, "test de la page Tarifs démarré")
r = requests.post(f"{B}/admin/experiments/{eid}/start", headers=A)
ok(r.status_code == 409 and r.json()["code"] == "zone_busy", "pas de test de prix en même temps qu'un test de la page Tarifs")
requests.post(f"{B}/admin/experiments/{pt}/pause", headers=A)
ok(requests.post(f"{B}/admin/experiments/{eid}/start", headers=A).status_code == 200, "test de prix démarré une fois l'autre en pause")
ok(requests.post(f"{B}/admin/experiments/{pt}/start", headers=A).status_code == 409, "et inversement")
requests.delete(f"{B}/admin/experiments/{pt}", headers=A)
time.sleep(11)  # cache de 10 s des tests en cours


def plans(vis=None, country=None, ua=UA):
    q = {}
    if vis: q["visitor"] = vis
    if country: q["country"] = country
    return requests.get(B + "/billing/plans", params=q, headers=ua).json()


amounts = lambda p: {x["interval"]: x["amount"] for x in p["plans"]}
ok(amounts(plans()) == {"month": 990, "year": 9900}, "sans identifiant de visiteur : prix du site")
split = {"A": 0, "B": 0}; seen = {}
for i in range(120):
    vv = f"p{i:03d}-" + uuid.uuid4().hex
    a = amounts(plans(vv))
    k = "B" if a == {"month": 790, "year": 7900} else "A"
    ok(a == ({"month": 790, "year": 7900} if k == "B" else {"month": 990, "year": 9900}), f"visiteur {i} : prix cohérents") if i < 3 else None
    split[k] += 1; seen[vv] = k
ok(30 < split["A"] < 90 and 30 < split["B"] < 90, f"répartition ~50/50 ({split})")
vA = next(v for v, k in seen.items() if k == "A"); vB = next(v for v, k in seen.items() if k == "B")
ok(amounts(plans(vB)) == {"month": 790, "year": 7900} and amounts(plans(vB)) == amounts(plans(vB)), "le visiteur B voit toujours les prix B")
ok(amounts(plans(vB, ua={"user-agent": "Googlebot/2.1"})) == {"month": 990, "year": 9900}, "robot : prix du site, non compté")
cur.execute("select count(*) from experiment_exposures where experiment_id=%s", (eid,))
ok(cur.fetchone()[0] == 120, "120 visiteurs comptés (une fois chacun, robot exclu)")

# --- /xp/expose ne peut pas servir à fabriquer une exposition de prix
fake = "fake-" + uuid.uuid4().hex
requests.post(B + "/xp/expose", json={"visitor": fake, "experiment": eid}, headers=UA)
cur.execute("select count(*) from experiment_exposures where experiment_id=%s and visitor_hash=%s", (eid, hashlib.sha256(fake.encode()).hexdigest()))
ok(cur.fetchone()[0] == 0, "/xp/expose ignoré pour un test de prix")

# --- pays à tarification régionale : pas de test
reg = {"name": "Maghreb", "countries": "ma", "priceMonthly": "price_rm", "priceYearly": "price_ry"}
gid = requests.post(B + "/admin/pricing-regions", headers=A, json=reg).json()["id"]
newv = "r000-" + uuid.uuid4().hex
pm = plans(newv, "MA")
ok(amounts(pm) == {"month": 399, "year": 3999}, "pays à tarif régional : son prix, pas de test")
cur.execute("select count(*) from experiment_exposures where experiment_id=%s and visitor_hash=%s", (eid, hashlib.sha256(newv.encode()).hexdigest()))
ok(cur.fetchone()[0] == 0, "…et non compté")
requests.delete(f"{B}/admin/pricing-regions/{gid}", headers=A)

# --- paiement : le prix facturé est celui qui a été montré
email = f"px{tag}@test.local"
reg = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test-1", "name": "PX"}).json()
H = {"authorization": "Bearer " + reg["token"], **UA}
cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
last = lambda: [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]
buy = lambda vis, interval="month": requests.post(B + "/billing/checkout", headers=H, json={"interval": interval, "waiver": True, **({"visitor": vis} if vis else {})})
ok(buy(vB).status_code == 200 and last().get("line_items[0][price]") == "price_tm", "visiteur B : facturé au prix B mensuel")
ok(last().get("subscription_data[metadata][xp_exp]") == eid, "…et le test est noté dans l'abonnement")
cur.execute("update users set stripe_customer_id = null where id=%s", (uid,))
buy(vB, "year")
ok(last().get("line_items[0][price]") == "price_ty", "visiteur B : facturé au prix B annuel")
buy(vA)
ok(last().get("line_items[0][price]") == "price_m" and last().get("subscription_data[metadata][xp_exp]") == eid, "visiteur A : prix du site (et compté dans le test)")
buy(None)
ok(last().get("line_items[0][price]") == "price_m" and "subscription_data[metadata][xp_exp]" not in last(), "sans identifiant : prix du site, hors test")
# un visiteur à qui aucun prix n'a été montré ne reçoit jamais un prix de test (même s'il serait tombé dans B)
for i in range(25):
    v = f"u{i:03d}-" + uuid.uuid4().hex
    buy(v); price = last().get("line_items[0][price]")
    cur.execute("update users set stripe_customer_id = null where id=%s", (uid,))
    if price != "price_m": ok(False, "un visiteur non exposé a reçu un prix de test")
ok(True, "25 visiteurs non exposés : tous au prix du site")

# --- webhooks : abonnement démarré, facture payée
def hook(ev):
    body = json.dumps(ev); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=body, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})


vh = hashlib.sha256(vB.encode()).hexdigest()
cur.execute("update users set stripe_customer_id = 'cus_1' where id=%s", (uid,))
sid = "sub_" + uuid.uuid4().hex[:10]
meta = {"user_id": str(uid), "xp_exp": eid, "xp_vh": vh}
sub = {"id": sid, "customer": "cus_1", "status": "trialing", "metadata": meta, "items": {"data": [{"price": {"id": "price_tm", "recurring": {"interval": "month"}}, "current_period_end": 4102444800}]}}
ok(hook({"id": "evt_" + uuid.uuid4().hex, "type": "customer.subscription.created", "created": int(time.time()), "data": {"object": sub}}).status_code == 200, "webhook : abonnement (essai) reçu")
cur.execute("select subscribed_at, paid_at, revenue_cents from experiment_exposures where experiment_id=%s and visitor_hash=%s", (eid, vh))
row = cur.fetchone()
ok(row[0] is not None and row[1] is None and row[2] == 0, "abonnement démarré compté, rien d'encaissé pendant l'essai")
inv = {"id": "in_" + uuid.uuid4().hex[:8], "customer": "cus_1", "amount_paid": 790, "currency": "eur", "subscription_details": {"metadata": meta}}
ok(hook({"id": "evt_" + uuid.uuid4().hex, "type": "invoice.paid", "created": int(time.time()), "data": {"object": inv}}).status_code == 200, "webhook : facture payée reçue")
inv2 = {**inv, "id": "in_" + uuid.uuid4().hex[:8]}
hook({"id": "evt_" + uuid.uuid4().hex, "type": "invoice.paid", "created": int(time.time()), "data": {"object": inv2}})
rep = {"id": "evt_same", "type": "invoice.paid", "created": int(time.time()), "data": {"object": {**inv, "id": "in_dup"}}}
cur.execute("delete from stripe_events where id='evt_same'")
hook(rep); hook(rep)  # événement rejoué : une seule fois
cur.execute("select paid_at, revenue_cents from experiment_exposures where experiment_id=%s and visitor_hash=%s", (eid, vh))
row = cur.fetchone()
ok(row[0] is not None and row[1] == 790 * 3, f"revenu encaissé : 3 factures de 7,90 € (rejeu ignoré) — {row[1]}")
ok(hook({"id": "evt_" + uuid.uuid4().hex, "type": "invoice.paid", "created": int(time.time()), "data": {"object": {**inv, "id": "in_free", "amount_paid": 0}}}).status_code == 200, "facture à 0 € ignorée")
cur.execute("select revenue_cents from experiment_exposures where experiment_id=%s and visitor_hash=%s", (eid, vh))
ok(cur.fetchone()[0] == 790 * 3, "facture à 0 € : revenu inchangé")
bad = {**meta, "xp_vh": "zz"}
ok(hook({"id": "evt_" + uuid.uuid4().hex, "type": "invoice.paid", "created": int(time.time()), "data": {"object": {**inv, "id": "in_bad", "subscription_details": {"metadata": bad}}}}).status_code == 200, "métadonnées invalides ignorées sans erreur")

# --- chiffres affichés à l'administrateur
e = [x for x in requests.get(B + "/admin/experiments", headers=A).json()["experiments"] if x["id"] == eid][0]
vb = [v for v in e["variants"] if v["key"] == "B"][0]
ok(vb["subscribers"] == 1 and vb["paid"] == 1 and vb["revenue"] == 2370 and vb["conversions"] == 1 and vb["prices"] == {"month": "price_tm", "year": "price_ty"}, "admin : abonnés, payés, revenu, prix de la variante")
ok(vb["visitors"] > 30 and vb["revenuePerVisitor"] == round(2370 / vb["visitors"]), "admin : revenu par visiteur")

# --- garder la variante B : les prix du site changent (nouveaux abonnés seulement)
r = requests.post(f"{B}/admin/experiments/{eid}/end", headers=A, json={"winner": "B", "apply": True}).json()
ok(r["appliedPrices"] == 2 and r["applied"] == 0, "variante gardée : 2 prix appliqués")
time.sleep(1)
cur.execute("select key, value from app_settings where key in ('stripe_price_monthly','stripe_price_yearly') order by key")
ok(dict(cur.fetchall()) == {"stripe_price_monthly": "price_tm", "stripe_price_yearly": "price_ty"}, "les prix du site sont ceux de la variante gardée")
cur.execute("select price_id from subscriptions where id=%s", (sid,))
ok(cur.fetchone()[0] == "price_tm", "l'abonnement existant n'est pas touché")
cur.execute("select summary from audit_log order by id desc limit 3")
ok(any("prix du site" in (x[0] or "") for x in cur.fetchall()), "journal d'audit : changement de prix inscrit")

# Nettoyage
put({"stripe_secret_key": None, "stripe_webhook_secret": None, "stripe_price_monthly": None, "stripe_price_yearly": None})
cur.execute("delete from subscriptions where id=%s", (sid,))
cur.execute("update users set stripe_customer_id = null where id=%s", (uid,))
ok(requests.delete(f"{B}/admin/experiments/{eid}", headers=A).status_code == 200, "test supprimé")
cur.execute("delete from consents where user_id=%s", (uid,))
cur.execute("delete from users where id=%s", (uid,))
print("TOUT OK : test de prix")
