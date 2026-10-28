"""43 : parrainage. Prérequis : API (3055) lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (python3 api/tests/mock_stripe.py) et PG de test (5544).
Les factures payées arrivent par le webhook signé de Stripe : ici on le signe avec le secret de test."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
put = lambda v: requests.put(B + "/admin/settings", headers=A, json={"values": v, "confirmStripeReset": True})
SECRET = "whsec_referral_test"
r = put({"stripe_secret_key": "sk_test_ref", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y"})
ok(r.status_code == 200, "réglages Stripe de test enregistrés " + r.text[:120])


def signup(tag):
    email = f"ref-{tag}-{uuid.uuid4().hex[:8]}@test.local"
    r = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test!", "locale": "fr"})
    assert r.status_code == 201, r.text
    return email, {"authorization": "Bearer " + r.json()["token"]}, r.json()["user"]["id"]


def paid_invoice(customer, amount=699):
    ev = {"id": "evt_" + uuid.uuid4().hex, "type": "invoice.paid", "created": int(time.time()),
          "data": {"object": {"id": "in_" + uuid.uuid4().hex, "customer": customer, "amount_paid": amount, "currency": "eur", "status": "paid"}}}
    body = json.dumps(ev)
    ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return ev, requests.post(B + "/billing/webhook", data=body, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})


def until(u):
    cur.execute("select premium_until from users where id=%s", (u,)); return cur.fetchone()[0]


def outbox(kind, uid):
    cur.execute("select count(*) from email_outbox where kind=%s and user_id=%s", (kind, uid)); return cur.fetchone()[0]


put({"referral_months": "1", "referral_max_per_year": "12"})
# --- code personnel
pe, P, pid = signup("parrain")
r = requests.get(B + "/me/referral", headers=P).json()
code = r["code"]
ok(len(code) == 8 and r["months"] == 1 and r["stats"]["invited"] == 0, "le parrain a un code de 8 caractères")
ok(requests.get(B + "/me/referral", headers=P).json()["code"] == code, "le code est stable")
ok(requests.get(B + "/me/referral").status_code == 401, "connexion requise")
# --- rattachement
fe, F, fid = signup("filleul")
ok(requests.post(B + "/me/referral/claim", headers=F, json={"code": "zz"}).status_code == 400, "code mal formé refusé")
ok(requests.post(B + "/me/referral/claim", headers=F, json={"code": "ABCDEFGH"}).status_code == 404, "code inconnu refusé")
ok(requests.post(B + "/me/referral/claim", headers=P, json={"code": code}).status_code == 400, "son propre code refusé")
ok(requests.post(B + "/me/referral/claim", headers=F, json={"code": code.lower()[:4] + "-" + code.lower()[4:]}).status_code == 200, "rattachement (casse et tiret tolérés)")
ok(requests.post(B + "/me/referral/claim", headers=F, json={"code": code}).status_code == 409, "un filleul n'a qu'un parrain")
s = requests.get(B + "/me/referral", headers=P).json()["stats"]
ok(s["invited"] == 1 and s["pending"] == 1 and s["rewarded"] == 0, "compteurs du parrain : 1 invité en attente")
ok(requests.get(B + "/me/referral", headers=F).json()["referredBy"]["status"] == "pending", "le filleul voit qu'il est parrainé")
# compte ancien : refusé
oe, O, oid = signup("ancien")
cur.execute("update users set created_at = now() - interval '3 days' where id=%s", (oid,))
ok(requests.post(B + "/me/referral/claim", headers=O, json={"code": code}).status_code == 409, "compte de plus de 48 h refusé")
# --- pas de récompense à l'inscription ni sans paiement
ok(until(fid) is None and until(pid) is None, "aucun mois offert avant le premier paiement")
cus = "cus_" + uuid.uuid4().hex[:10]
cur.execute("update users set stripe_customer_id=%s where id=%s", (cus, fid))
ev, w = paid_invoice(cus, 0)
ok(w.status_code == 200 and until(fid) is None, "facture à 0 € (essai) : rien n'est versé")
# --- premier vrai paiement
ev, w = paid_invoice(cus, 699)
ok(w.status_code == 200, "webhook accepté")
uf, up = until(fid), until(pid)
ok(uf is not None and up is not None, "filleul et parrain reçoivent leur mois offert")
ok(28 <= (uf.replace(tzinfo=None) - __import__('datetime').datetime.utcnow()).days <= 32, "environ un mois offert")
ok(outbox("referral_reward_referee", fid) == 1 and outbox("referral_reward_referrer", pid) == 1, "e-mails de récompense mis en file")
# --- rejeu et 2e facture : une seule récompense
requests.post(B + "/billing/webhook", data=json.dumps(ev), headers={"content-type": "application/json"})
paid_invoice(cus, 699)
ok(until(fid) == uf and until(pid) == up, "2e facture : pas de 2e récompense")
s = requests.get(B + "/me/referral", headers=P).json()["stats"]
ok(s["rewarded"] == 1 and s["pending"] == 0 and s["monthsEarned"] == 1, "compteurs du parrain après récompense")
# --- plafond annuel
put({"referral_max_per_year": "1"})
f2e, F2, f2id = signup("filleul2")
requests.post(B + "/me/referral/claim", headers=F2, json={"code": code})
cus2 = "cus_" + uuid.uuid4().hex[:10]
cur.execute("update users set stripe_customer_id=%s where id=%s", (cus2, f2id))
paid_invoice(cus2, 699)
ok(until(f2id) is not None and until(pid) == up, "plafond atteint : le filleul reçoit son mois, pas le parrain")
ok(requests.get(B + "/me/referral", headers=P).json()["stats"]["capReached"] is True, "le parrain voit que le plafond est atteint")
# --- réglage du nombre de mois
put({"referral_max_per_year": "0", "referral_months": "3"})
f3e, F3, f3id = signup("filleul3")
requests.post(B + "/me/referral/claim", headers=F3, json={"code": code})
cus3 = "cus_" + uuid.uuid4().hex[:10]
cur.execute("update users set stripe_customer_id=%s where id=%s", (cus3, f3id))
paid_invoice(cus3, 699)
ok((until(f3id).replace(tzinfo=None) - __import__('datetime').datetime.utcnow()).days >= 88 and until(pid) > up, "3 mois offerts quand le réglage est à 3 ; plafond 0 = sans limite")
# --- administration
ok(requests.get(B + "/admin/referrals", headers=P).status_code == 403, "écran admin réservé aux administrateurs")
a = requests.get(B + "/admin/referrals", headers=A).json()
ok(a["totals"]["rewarded"] >= 3 and any(x["refereeEmail"] == fe and x["status"] == "rewarded" for x in a["referrals"]), "écran admin : parrainages listés")
# --- fonction coupée
put({"feat_referral": "false"})
ok(requests.get(B + "/me/referral", headers=P).status_code == 404, "fonction coupée : routes fermées")
f4e, F4, f4id = signup("filleul4")
cur.execute("insert into referrals(referrer_id, referee_id) values (%s, %s)", (pid, f4id))
cus4 = "cus_" + uuid.uuid4().hex[:10]
cur.execute("update users set stripe_customer_id=%s where id=%s", (cus4, f4id))
paid_invoice(cus4, 699)
ok(until(f4id) is None, "fonction coupée : aucune récompense versée")
put({"feat_referral": None, "referral_months": None, "referral_max_per_year": None, "stripe_secret_key": None, "stripe_webhook_secret": None, "stripe_price_monthly": None, "stripe_price_yearly": None})
print("TOUT OK")
