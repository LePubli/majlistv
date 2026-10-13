"""24.4 : palier « Apprentissage » côté Stripe — prix, paiement, webhook (palier déduit du prix souscrit).
Prérequis : API (3055) lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (python3 api/tests/mock_stripe.py) et PG de test (5544)."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
free = lambda: cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")
free()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v, "confirmStripeReset": True})
plans = lambda: requests.get(B + "/billing/plans").json()
checkouts = lambda: [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"]
SECRET = "whsec_test"

# --- 1) Sans Stripe : les prix du palier Apprentissage sont visibles (9,99 € / 99,99 €), paiement « bientôt »
put({"stripe_secret_key": None, "stripe_webhook_secret": None, "stripe_price_monthly": None, "stripe_price_yearly": None,
     "stripe_price_learn_monthly": None, "stripe_price_learn_yearly": None, "plan_price_monthly": None, "plan_price_yearly": None,
     "plan_learn_price_monthly": None, "plan_learn_price_yearly": None, "plan_currency": None, "paypal_enabled": None})
p = plans()
ok({x["interval"]: x["amount"] for x in p["learning"]["plans"]} == {"month": 999, "year": 9999} and p["learning"]["enabled"] is False, "sans Stripe : Apprentissage 9,99 € / 99,99 € affichés, paiement non ouvert")
ok({x["interval"]: x["amount"] for x in p["plans"]} == {"month": 699, "year": 6999}, "la formule standard reste 6,99 € / 69,99 €")
put({"plan_learn_price_monthly": "0", "plan_learn_price_yearly": "0"})
ok(plans()["learning"]["plans"] == [], "prix Apprentissage à 0 : palier non affiché")
put({"plan_learn_price_monthly": None, "plan_learn_price_yearly": None})

# --- 2) Stripe configuré SANS prix Apprentissage : formule standard seule payable
put({"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y"})
p = plans()
ok(p["enabled"] is True and p["learning"]["enabled"] is False and len(p["learning"]["plans"]) == 2, "Stripe sans prix Apprentissage : prix affichés, pas de paiement Apprentissage")
em = f"lr{uuid.uuid4().hex[:6]}@test.local"
tok = requests.post(B + "/auth/register", json={"email": em, "password": "MotDePasse-123", "name": "Lea"}).json()["token"]
U = {"authorization": "Bearer " + tok}
cur.execute("select id from users where email=%s", (em,)); uid = cur.fetchone()[0]
buy = lambda tier, interval="month": requests.post(B + "/billing/checkout", headers=U, json={"interval": interval, "tier": tier, "waiver": True})
r = buy("learning"); ok(r.status_code == 503, "paiement Apprentissage refusé tant que ses prix Stripe ne sont pas configurés")

# --- 3) Stripe configuré avec les prix Apprentissage
put({"stripe_price_learn_monthly": "price_lm", "stripe_price_learn_yearly": "price_ly"})
p = plans()
ok(p["learning"]["enabled"] is True and {x["interval"]: x["amount"] for x in p["learning"]["plans"]} == {"month": 999, "year": 9999}, "avec Stripe : prix Apprentissage lus chez Stripe")
ok({x["interval"]: x["amount"] for x in p["plans"]} == {"month": 990, "year": 9900}, "la formule standard est inchangée")
n = len(checkouts())
ok(buy("learning", "year").status_code == 200, "paiement Apprentissage annuel")
c = checkouts()[-1]["body"]
ok(len(checkouts()) == n + 1 and c["line_items[0][price]"] == "price_ly", "Stripe reçoit le prix annuel Apprentissage")
ok(buy("learning", "month").status_code == 200 and checkouts()[-1]["body"]["line_items[0][price]"] == "price_lm", "prix mensuel Apprentissage")
ok(buy("standard").status_code == 200 and checkouts()[-1]["body"]["line_items[0][price]"] == "price_m", "formule standard : prix standard")
ok(requests.post(B + "/billing/checkout", headers=U, json={"interval": "month", "waiver": True}).status_code == 200 and checkouts()[-1]["body"]["line_items[0][price]"] == "price_m", "sans palier précisé : formule standard")
ok(requests.post(B + "/billing/checkout", headers=U, json={"interval": "month", "tier": "vip", "waiver": True}).status_code == 400, "palier inconnu refusé")
cur.execute("select context from consents where user_id=%s order by created_at desc limit 1", (uid,)); ok(cur.fetchone()[0] == "checkout:standard:month", "la preuve de consentement garde le palier choisi")

# --- 4) Webhook : le palier se déduit du prix souscrit
def hook(typ, price, sub_id, status="active"):
    body = {"id": "evt_" + uuid.uuid4().hex[:12], "object": "event", "type": typ, "created": int(time.time()),
            "data": {"object": {"id": sub_id, "object": "subscription", "customer": "cus_x", "status": status, "metadata": {"user_id": str(uid)},
                                "cancel_at_period_end": False, "current_period_end": 4102444800, "trial_end": None,
                                "items": {"data": [{"price": {"id": price, "recurring": {"interval": "month"}}}]}}}}
    raw = json.dumps(body); t = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{t}.{raw}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=raw, headers={"content-type": "application/json", "stripe-signature": f"t={t},v1={sig}"})


sid = "sub_" + uuid.uuid4().hex[:8]
ok(hook("customer.subscription.created", "price_m", sid).status_code == 200, "webhook : abonnement standard reçu")
s = requests.get(B + "/billing/status", headers=U).json()
ok(s["tier"] == "standard" and s["learning"] is False and s["active"] is True, "statut : standard")
ok(requests.get(B + "/me/learning", headers=U).status_code == 403, "standard : pas d'accès à Apprentissage")
time.sleep(1.1)
ok(hook("customer.subscription.updated", "price_ly", sid).status_code == 200, "webhook : passage au palier Apprentissage (changement de prix)")
cur.execute("select tier, price_id from subscriptions where id=%s", (sid,)); ok(cur.fetchone() == ("learning", "price_ly"), "palier « learning » enregistré d'après le prix")
s = requests.get(B + "/billing/status", headers=U).json(); ok(s["tier"] == "learning" and s["learning"] is True, "statut : Apprentissage")
ok(requests.get(B + "/me/learning", headers=U).status_code == 200, "accès au tableau Apprentissage ouvert")
time.sleep(1.1)
ok(hook("customer.subscription.updated", "price_m", sid).status_code == 200, "webhook : retour au standard")
ok(requests.get(B + "/me/learning", headers=U).status_code == 403, "retour au standard : accès retiré")
time.sleep(1.1)
hook("customer.subscription.deleted", "price_ly", sid, "canceled")
s = requests.get(B + "/billing/status", headers=U).json(); ok(s["tier"] is None and s["active"] is False, "abonnement résilié : plus de palier")
put({"stripe_price_learn_monthly": None, "stripe_price_learn_yearly": None})
free()
print("TOUT OK")
