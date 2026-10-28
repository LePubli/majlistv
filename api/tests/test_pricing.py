"""15 : formules visibles sans Stripe, prix Stripe quand il est configuré, PayPal avec repli sur la carte.
Prérequis : API (3055) lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (python3 api/tests/mock_stripe.py) et PG de test (5544)."""
import os, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"; FLAG = "/tmp/claude-0/paypal_reject"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
# Le faux Stripe renvoie toujours « cus_1 » : on libère cet identifiant pour les autres tests (clé unique).
free = lambda: cur.execute("update users set stripe_customer_id = null where stripe_customer_id = 'cus_1'")
free()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


if os.path.exists(FLAG):
    os.remove(FLAG)
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v, "confirmStripeReset": True})
plans = lambda: requests.get(B + "/billing/plans").json()
checkouts = lambda: [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"]

# --- 1) Stripe non configuré : les formules sont quand même visibles
put({"stripe_secret_key": None, "stripe_webhook_secret": None, "stripe_price_monthly": None, "stripe_price_yearly": None,
     "plan_price_monthly": None, "plan_price_yearly": None, "plan_currency": None, "paypal_enabled": None})
p = plans()
ok(p["enabled"] is False and p["source"] == "settings", "sans Stripe : paiement fermé mais formules annoncées")
ok({x["interval"]: x["amount"] for x in p["plans"]} == {"month": 699, "year": 6999} and p["plans"][0]["currency"] == "eur", "prix par défaut : 6,99 € / 69,99 €")
ok(p["methods"] == ["card"], "moyen de paiement : carte seule par défaut")
r = put({"plan_price_monthly": "9,90", "plan_price_yearly": "99", "plan_currency": "usd"})
ok(r.status_code == 200, "prix saisis dans le back-office")
p = plans()
ok({x["interval"]: x["amount"] for x in p["plans"]} == {"month": 990, "year": 9900} and p["plans"][0]["currency"] == "usd", "virgule acceptée, montants en centimes, devise appliquée")
ok(put({"plan_price_monthly": "abc"}).status_code == 400 and put({"plan_price_monthly": "-3"}).status_code == 400, "montant invalide refusé")
put({"plan_price_yearly": "0"})
ok([x["interval"] for x in plans()["plans"]] == ["month"], "prix annuel à 0 : formule annuelle masquée")
put({"plan_price_monthly": None, "plan_price_yearly": None, "plan_currency": None})
ok(requests.post(B + "/billing/checkout", json={"interval": "month", "waiver": True}).status_code == 401, "payer exige un compte")

# --- 2) Stripe configuré : les prix de Stripe font foi
put({"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": "whsec_test", "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y"})
p = plans()
ok(p["enabled"] is True and p["source"] == "stripe" and {x["interval"]: x["amount"] for x in p["plans"]} == {"month": 990, "year": 9900}, "avec Stripe : montants lus chez Stripe")

# --- 3) PayPal
em = f"pp{uuid.uuid4().hex[:6]}@test.local"
tok = requests.post(B + "/auth/register", json={"email": em, "password": "MotDePasse-123"}).json()["token"]
U = {"authorization": "Bearer " + tok}
buy = lambda: requests.post(B + "/billing/checkout", headers=U, json={"interval": "year", "waiver": True})
n0 = len(checkouts())
ok(buy().status_code == 200, "PayPal désactivé : paiement possible")
b = checkouts()[-1]["body"]
ok("payment_method_types[0]" not in b, "PayPal désactivé : Stripe choisit les moyens de paiement (réglage du tableau de bord)")
put({"paypal_enabled": "true"})
ok(plans()["methods"] == ["card", "paypal"], "PayPal activé : annoncé sur la page Abonnement")
n1 = len(checkouts())
ok(buy().status_code == 200, "PayPal activé : paiement possible")
b = checkouts()[-1]["body"]
ok(len(checkouts()) == n1 + 1 and b.get("payment_method_types[0]") == "card" and b.get("payment_method_types[1]") == "paypal", "PayPal activé : carte et PayPal demandés à Stripe")
open(FLAG, "w").close()
n2 = len(checkouts())
r = buy()
ok(r.status_code == 200 and r.json()["url"].startswith("https://checkout"), "PayPal refusé par Stripe : le paiement fonctionne quand même")
last = checkouts()[n2:]
ok(len(last) == 2 and last[0]["body"].get("payment_method_types[1]") == "paypal" and "payment_method_types[0]" not in last[1]["body"], "repli automatique : 2e essai sans PayPal (carte)")
os.remove(FLAG)
put({"paypal_enabled": None})
ok(plans()["methods"] == ["card"], "PayPal remis à « non »")
# --- Essai sans carte (étape 42)
put({"trial_days": "7", "trial_no_card": None})
ok(plans().get("trialNoCard") is False, "essai sans carte : désactivé par défaut")
ok(buy().status_code == 200, "essai avec carte : paiement possible")
b = checkouts()[-1]["body"]
ok(b.get("subscription_data[trial_period_days]") == "7" and "payment_method_collection" not in b, "essai avec carte : carte demandée dès le départ")
put({"trial_no_card": "true"})
ok(plans().get("trialNoCard") is True, "essai sans carte : annoncé sur la page Abonnement")
ok(buy().status_code == 200, "essai sans carte : paiement possible")
b = checkouts()[-1]["body"]
ok(b.get("payment_method_collection") == "if_required" and b.get("subscription_data[trial_settings][end_behavior][missing_payment_method]") == "cancel", "essai sans carte : Stripe ne demande pas de carte, abonnement annulé en fin d'essai sans carte")
put({"trial_days": "0"})
ok(plans().get("trialNoCard") is False, "essai à 0 jour : pas d'essai sans carte annoncé")
ok(buy().status_code == 200, "sans essai : paiement possible")
b = checkouts()[-1]["body"]
ok("payment_method_collection" not in b and "subscription_data[trial_period_days]" not in b, "sans essai : carte toujours demandée")
put({"trial_no_card": None, "trial_days": None})
free()
print("TOUT OK")
