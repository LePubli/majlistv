"""44 : tarifs par pays, moyens de paiement locaux, Apple Pay / Google Pay (affichage).
Prérequis : API (3055) lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (python3 api/tests/mock_stripe.py) et PG de test (5544)."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v, "confirmStripeReset": True})
plans = lambda country=None: requests.get(B + "/billing/plans", params={"country": country} if country else {}).json()
checkouts = lambda: [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"]
SECRET = "whsec_regions_test"
r = put({"stripe_secret_key": "sk_test_reg", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y",
         "stripe_price_learn_monthly": "price_lm", "stripe_price_learn_yearly": "price_ly", "paypal_enabled": None, "payment_methods_extra": None, "payment_wallets_shown": None})
ok(r.status_code == 200, "réglages Stripe de test " + r.text[:100])
cur.execute("delete from price_regions")

# --- sans groupe : rien ne change
p = plans("MA")
ok(p["regionalPricing"] is False and p["region"] is None and {x["interval"]: x["amount"] for x in p["plans"]} == {"month": 990, "year": 9900}, "sans groupe : tarif général, pas de choix du pays")

# --- administration : contrôles
reg = lambda **kw: {"name": "Maghreb", "countries": "ma, dz tn", "priceMonthly": "price_rm", "priceYearly": "price_ry", **kw}
post = lambda body, h=A: requests.post(B + "/admin/pricing-regions", headers=h, json=body)
ok(post(reg(), {"authorization": "Bearer x"}).status_code in (401, 403), "réservé aux administrateurs")
ok(post(reg(countries="maroc")).status_code == 400, "pays mal écrit refusé (codes à 2 lettres)")
ok(post(reg(countries="")).status_code == 400, "liste de pays vide refusée")
ok(post(reg(priceMonthly="price_inconnu")).status_code == 400, "prix inconnu chez Stripe refusé")
ok(post(reg(priceMonthly="price_ry")).status_code == 400, "prix annuel donné comme mensuel refusé")
ok(post(reg(priceMonthly="price_once")).status_code == 400, "prix non récurrent refusé")
ok(post(reg(priceMonthly="price_usd")).status_code == 400, "autre devise refusée")
ok("devise" in post(reg(priceMonthly="price_usd")).json()["error"], "message clair sur la devise")
ok(post(reg(priceLearnMonthly="price_rlm")).status_code == 400, "Apprentissage : un seul des deux prix refusé")
c = post(reg())
ok(c.status_code == 201, "groupe valide créé")
gid = c.json()["id"]
lst = requests.get(B + "/admin/pricing-regions", headers=A).json()
ok(len(lst) == 1 and lst[0]["countries"] == ["MA", "DZ", "TN"] and lst[0]["priceLearnMonthly"] is None, "liste : pays normalisés, Apprentissage vide")

# --- page Abonnement
p = plans()
ok(p["regionalPricing"] is True and p["region"] is None and p["plans"][0]["amount"] == 990, "choix du pays proposé ; sans pays : tarif général")
p = plans("ma")
ok(p["region"]["name"] == "Maghreb" and p["region"]["country"] == "MA" and {x["interval"]: x["amount"] for x in p["plans"]} == {"month": 399, "year": 3999}, "pays du groupe : prix du groupe")
ok({x["interval"]: x["amount"] for x in p["learning"]["plans"]} == {"month": 999, "year": 9999}, "groupe sans prix Apprentissage : prix général Apprentissage")
ok(plans("FR")["region"] is None and plans("FR")["plans"][0]["amount"] == 990, "pays hors groupe : tarif général")
ok(plans("zzz")["region"] is None, "code pays invalide ignoré")

# --- groupe avec Apprentissage
u = requests.put(B + f"/admin/pricing-regions/{gid}", headers=A, json=reg(priceLearnMonthly="price_rlm", priceLearnYearly="price_rly"))
ok(u.status_code == 200, "groupe modifié (prix Apprentissage ajoutés)")
p = plans("DZ")
ok({x["interval"]: x["amount"] for x in p["learning"]["plans"]} == {"month": 599, "year": 5999}, "Apprentissage : prix du groupe")

# --- paiement
email = f"reg-{uuid.uuid4().hex[:8]}@test.local"
tok = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test!", "locale": "fr"}).json()["token"]
U = {"authorization": "Bearer " + tok}
def buy(**kw):
    # le faux Stripe renvoie toujours « cus_1 » : on libère l'identifiant avant chaque paiement (clé unique)
    cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1' and id <> (select id from users where email = %s)", (email,))
    return requests.post(B + "/billing/checkout", headers=U, json={"waiver": True, **kw})
cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")
ok(buy(interval="month", country="ma").status_code == 200, "paiement avec un pays du groupe")
b = checkouts()[-1]["body"]
ok(b.get("line_items[0][price]") == "price_rm" and b.get("subscription_data[metadata][pricing_region]") == "Maghreb", "Stripe reçoit le prix du groupe")
buy(interval="year", tier="learning", country="TN")
ok(checkouts()[-1]["body"].get("line_items[0][price]") == "price_rly", "Apprentissage annuel : prix du groupe")
buy(interval="month", country="FR")
ok(checkouts()[-1]["body"].get("line_items[0][price]") == "price_m", "pays hors groupe : prix général")
buy(interval="month")
ok(checkouts()[-1]["body"].get("line_items[0][price]") == "price_m", "sans pays : prix général")
ok(buy(interval="month", country="MAR").status_code == 400, "code pays trop long refusé")

# --- le palier Apprentissage est reconnu avec un prix de groupe
ev = {"id": "evt_" + uuid.uuid4().hex, "type": "customer.subscription.created", "created": int(time.time()),
      "data": {"object": {"id": "sub_" + uuid.uuid4().hex[:10], "customer": "cus_1", "status": "active", "metadata": {},
                          "items": {"data": [{"price": {"id": "price_rlm", "recurring": {"interval": "month"}}, "current_period_end": 4102444800}]}}}}
cur.execute("update users set stripe_customer_id = 'cus_1' where email = %s", (email,))
body = json.dumps(ev); ts = int(time.time())
sig = hmac.new(SECRET.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
w = requests.post(B + "/billing/webhook", data=body, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})
cur.execute("select tier from subscriptions where id = %s", (ev["data"]["object"]["id"],)); row = cur.fetchone()
ok(w.status_code == 200 and row and row[0] == "learning", "abonnement au prix Apprentissage d'un groupe : palier « learning »")
cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")

# --- groupe désactivé, fonction coupée
requests.put(B + f"/admin/pricing-regions/{gid}", headers=A, json=reg(priceLearnMonthly="price_rlm", priceLearnYearly="price_rly", enabled=False))
p = plans("MA")
ok(p["regionalPricing"] is False and p["region"] is None, "groupe désactivé : tarif général")
requests.put(B + f"/admin/pricing-regions/{gid}", headers=A, json=reg(priceLearnMonthly="price_rlm", priceLearnYearly="price_rly", enabled=True))
ok(plans("MA")["region"] is not None, "groupe réactivé")
put({"feat_regional_pricing": "false"})
ok(plans("MA")["region"] is None and plans()["regionalPricing"] is False, "fonction coupée : tarif général")
ok(requests.get(B + "/admin/pricing-regions", headers=A).status_code == 404, "fonction coupée : écran fermé")
put({"feat_regional_pricing": None})
ok(requests.delete(B + f"/admin/pricing-regions/{gid}", headers=A).status_code == 200 and requests.get(B + "/admin/pricing-regions", headers=A).json() == [], "groupe supprimé")

# --- moyens de paiement (nouveau membre : le précédent a déjà un abonnement actif)
email = f"reg2-{uuid.uuid4().hex[:8]}@test.local"
U = {"authorization": "Bearer " + requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test!", "locale": "fr"}).json()["token"]}
cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")
p = plans()
ok(p["methods"] == ["card"] and p["wallets"] is False, "par défaut : carte seule, Apple Pay / Google Pay non annoncés")
n = len(checkouts()); r = buy(interval="month")
ok(r.status_code == 200 and len(checkouts()) == n + 1 and "payment_method_types[0]" not in checkouts()[-1]["body"], "par défaut : Stripe choisit les moyens (Apple Pay, Google Pay selon le tableau de bord)")
put({"payment_wallets_shown": "true"})
ok(plans()["wallets"] is True, "Apple Pay / Google Pay annoncés quand le réglage est coché")
put({"payment_methods_extra": "ideal, SEPA_debit; foo"})
ok(plans()["methods"] == ["card", "sepa_debit", "ideal"], "moyens locaux : inconnus ignorés, ordre fixe")
n = len(checkouts()); r = buy(interval="month")
b = checkouts()[-1]["body"]
ok(r.status_code == 200 and len(checkouts()) == n + 1 and [b.get(f"payment_method_types[{i}]") for i in range(3)] == ["card", "sepa_debit", "ideal"], "moyens locaux demandés à Stripe")
put({"paypal_enabled": "true"})
ok(plans()["methods"] == ["card", "paypal", "sepa_debit", "ideal"], "PayPal et moyens locaux ensemble")
put({"payment_methods_extra": None, "payment_wallets_shown": None, "paypal_enabled": None, "stripe_secret_key": None, "stripe_webhook_secret": None,
     "stripe_price_monthly": None, "stripe_price_yearly": None, "stripe_price_learn_monthly": None, "stripe_price_learn_yearly": None})
print("TOUT OK")
