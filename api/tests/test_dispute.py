"""Relecture 25/11 — litige Stripe (charge.dispute.created) : abonnements du compte terminés, trace dans le journal d'audit.
Hors suite CI. Prérequis : API :3055 avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (tests/mock_stripe.py), Postgres :5544."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"; SECRET = "whsec_test"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: sys.exit(1)
def hook(event):
    payload = json.dumps(event); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=payload, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})
def ev(obj): return {"id": "evt_" + uuid.uuid4().hex[:12], "object": "event", "type": "charge.dispute.created", "created": int(time.time()), "data": {"object": obj}}
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/settings", headers=A, json={"values": {"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y", "stripe_automatic_tax": "false", "paypal_enabled": "false"}, "confirmStripeReset": True})
em = f"litige-{uuid.uuid4().hex[:6]}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Litige"})
cur.execute("update users set stripe_customer_id=NULL where stripe_customer_id='cus_dispute'")
cur.execute("update users set stripe_customer_id='cus_dispute' where email=%s returning id", (em,)); uid = str(cur.fetchone()[0])
n0 = len(requests.get(M + "/_log").json())
d = {"id": "dp_" + uuid.uuid4().hex[:8], "object": "dispute", "charge": "ch_1", "amount": 699, "currency": "eur", "reason": "fraudulent"}
e = ev(d)
ok(hook(e).status_code == 200, "webhook accepté")
log = requests.get(M + "/_log").json()[n0:]
ok([x["path"] for x in log if x.get("method") == "DELETE"] == ["/v1/subscriptions/sub_d1"], "seul l'abonnement actif est terminé chez Stripe")
cur.execute("select summary, target, actor_role from audit_log where route like '%%charge.dispute.created' and summary like %s", (f"%{d['id']}%",)); row = cur.fetchone()
ok(row and row[1] == f"user={uid}" and "6.99 EUR" in row[0] and "terminé(s) : 1" in row[0] and row[2] == "system", "trace dans le journal d'audit")
n1 = len(requests.get(M + "/_log").json())
ok(hook(e).status_code == 200 and len(requests.get(M + "/_log").json()) == n1, "événement rejoué : rien n'est refait")
cur.execute("update users set stripe_customer_id=NULL where id=%s", (uid,))
d2 = dict(d, id="dp_" + uuid.uuid4().hex[:8])
ok(hook(ev(d2)).status_code == 200, "compte non retrouvé : le webhook répond quand même 200")
cur.execute("select summary from audit_log where summary like %s", (f"%{d2['id']}%",)); ok("non retrouvé" in cur.fetchone()[0], "… et le journal le dit")
print("TOUT OK")
