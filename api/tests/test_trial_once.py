"""Relecture 25/11 — essai gratuit une seule fois par personne (boîte e-mail simplifiée). Hors suite CI.
Prérequis : API :3055 avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (tests/mock_stripe.py), Postgres :5544."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: sys.exit(1)
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/settings", headers=A, json={"values": {"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": "whsec_test", "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y", "stripe_automatic_tax": "false", "paypal_enabled": "false", "trial_days": "7", "trial_no_card": "false"}, "confirmStripeReset": True})
tag = uuid.uuid4().hex[:6]
def user(email):
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "T"})
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}
def checkout(h):
    cur.execute("update users set stripe_customer_id = NULL where stripe_customer_id = 'cus_1'")  # le faux Stripe renvoie toujours cus_1
    n = len(requests.get(M + "/_log").json())
    r = requests.post(B + "/billing/checkout", headers=h, json={"interval": "month", "waiver": True})
    body = [x for x in requests.get(M + "/_log").json()[n:] if x["path"] == "/v1/checkout/sessions"]
    return r, (body[-1]["body"] if body else {})
u1 = user(f"jean.dupont{tag}@gmail.com"); u2 = user(f"jeandupont{tag}+essai@googlemail.com"); u3 = user(f"autre{tag}@test.local")
r, b = checkout(u1); ok(r.status_code == 200 and b.get("subscription_data[trial_period_days]") == "7", f"première personne : essai de 7 jours ({r.status_code})")
r, b = checkout(u1); ok(r.status_code == 200 and b.get("subscription_data[trial_period_days]") == "7", "même compte qui recommence le paiement : essai toujours offert")
r, b = checkout(u2); ok(r.status_code == 200 and "subscription_data[trial_period_days]" not in b, "même boîte Gmail (points, +étiquette, googlemail) : pas d'essai")
r, b = checkout(u3); ok(r.status_code == 200 and b.get("subscription_data[trial_period_days]") == "7", "autre personne : essai offert")
cur.execute("delete from trial_claims where key = any(%s)", ([f"jeandupont{tag}@gmail.com", f"autre{tag}@test.local"],))
requests.put(B + "/admin/settings", headers=A, json={"values": {"trial_days": None, "trial_no_card": None}})
print("TOUT OK")
