"""Étape C-1 — paiement Stripe des contenus à l'unité (faux Stripe) : page de paiement, montant (prix abonné), webhook, e-mail,
événement rejoué, location (fin 48 h), remboursement (admin et webhook). Hors suite CI, comme test_gifts.py.
Prérequis : API :3055 lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (tests/mock_stripe.py), Postgres :5544."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"; SECRET = "whsec_test"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails += 1
def hook(event):
    payload = json.dumps(event); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=payload, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})
def ev(typ, obj): return {"id": "evt_" + uuid.uuid4().hex[:12], "object": "event", "type": typ, "created": int(time.time()), "data": {"object": obj}}
def outbox(kind, key):
    cur.execute("select count(*) from email_outbox where kind=%s and dedupe_key=%s", (kind, key)); return cur.fetchone()[0]
tag = uuid.uuid4().hex[:6]
A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/settings", headers=A, json={"values": {"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y",
    "stripe_automatic_tax": "false", "paypal_enabled": "false"}, "confirmStripeReset": True})
requests.put(B + "/admin/features", headers=A, json={"values": {"sales": True}})
def user(p):
    em = f"{p}-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": p})
    cur.execute("select id from users where email=%s", (em,)); u = str(cur.fetchone()[0])
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}, u, em
U, uid, uem = user("acheteur"); S, sid, sem = user("abonne")
cur.execute("update users set premium_until = now() + interval '30 days' where id=%s", (sid,))
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh','upload',%s,%s,'published','ready','premium',600,'fr','fr','unavailable') returning id""", (f"Conférence {tag}", f"v-{tag}", aid)); T = str(cur.fetchone()[0])
requests.put(f"{B}/studio/sales/talk/{T}", headers=A, json={"buyPrice": "5", "rentPrice": "2", "rentHours": 48, "memberDiscountPct": 30})

# --- achat par un membre sans abonnement
r = requests.post(B + "/sales/checkout", headers=U, json={"kind": "talk", "id": T, "mode": "buy", "terms": True})
ok(r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test/") and r.json()["amount"] == 500, "achat : page de paiement Stripe, 5,00 €")
body = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]
pid = body["metadata[sale_purchase_id]"]
ok(body["mode"] == "payment" and body["line_items[0][price_data][unit_amount]"] == "500" and f"/talk/{T}?paid=1" in body["success_url"] and "achat" in body["line_items[0][price_data][product_data][name]"], "Stripe : paiement unique, bon montant, retour sur la vidéo")
cur.execute("select status, mode, amount, stripe_session_id from sale_purchases where id=%s", (pid,)); st, mode, amt, sess = cur.fetchone()
ok(st == "pending" and mode == "buy" and amt == 500 and sess, "achat « en attente » enregistré")
cur.execute("select count(*) from consents where user_id=%s and kind='sale_terms' and text like %s", (uid, "%rétractation%")); ok(cur.fetchone()[0] == 1, "renonciation au délai de rétractation horodatée")
ok(requests.get(f"{B}/talks/{T}", headers=U).json().get("locked") is True, "pas encore payé : toujours verrouillée")
session = {"id": sess, "object": "checkout.session", "mode": "payment", "payment_status": "paid", "amount_total": 500, "currency": "eur", "payment_intent": "pi_" + pid[:8], "metadata": {"sale_purchase_id": pid}}
e = ev("checkout.session.completed", session)
ok(hook(e).status_code == 200, "webhook : paiement confirmé")
t = requests.get(f"{B}/talks/{T}", headers=U).json(); ok(not t.get("locked") and t["sale"]["owned"]["mode"] == "buy", "payé : vidéo ouverte pour toujours")
ok(outbox("sale_bought", f"sale-paid:{pid}") == 1, "e-mail de confirmation d'achat")
hook(e); hook(ev("checkout.session.async_payment_succeeded", session))
ok(outbox("sale_bought", f"sale-paid:{pid}") == 1, "événement rejoué : pas de doublon")
r = requests.post(B + "/sales/checkout", headers=U, json={"kind": "talk", "id": T, "mode": "rent", "terms": True}); ok(r.status_code == 409 and r.json()["code"] == "owned", "déjà acheté : pas de nouvelle location")
ok(requests.post(B + "/sales/checkout", headers=A, json={"kind": "talk", "id": T, "mode": "buy", "terms": True}).json().get("code") == "owner", "le responsable n'achète pas son propre contenu")

# --- location par un abonné (−30 %)
r = requests.post(B + "/sales/checkout", headers=S, json={"kind": "talk", "id": T, "mode": "rent", "terms": True}); ok(r.json().get("amount") == 140, "abonné : location à 1,40 € (−30 %)")
body = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]; rid = body["metadata[sale_purchase_id]"]
ok(body["line_items[0][price_data][unit_amount]"] == "140" and "48 h" in body["line_items[0][price_data][product_data][name]"], "Stripe : prix abonné et durée de location dans le libellé")
cur.execute("select stripe_session_id, member_price from sale_purchases where id=%s", (rid,)); rs, mp = cur.fetchone(); ok(mp is True, "prix abonné noté")
hook(ev("checkout.session.completed", {"id": rs, "object": "checkout.session", "mode": "payment", "payment_status": "paid", "amount_total": 140, "currency": "eur", "payment_intent": "pi_r" + rid[:8], "metadata": {"sale_purchase_id": rid}}))
cur.execute("select expires_at - paid_at from sale_purchases where id=%s", (rid,)); d = cur.fetchone()[0]
ok(abs(d.total_seconds() - 48 * 3600) < 5, "location : accès pendant 48 h à partir du paiement")
ok(outbox("sale_rented", f"sale-paid:{rid}") == 1, "e-mail de location (avec la date de fin)")
ok(requests.post(B + "/sales/checkout", headers=S, json={"kind": "talk", "id": T, "mode": "rent", "terms": True}).json().get("code") == "rented", "location en cours : pas de 2e location")

# --- remboursements
ok(requests.post(f"{B}/admin/sales/{pid}/refund", headers=U).status_code == 403, "remboursement réservé à l'administrateur")
r = requests.post(f"{B}/admin/sales/{pid}/refund", headers=A); ok(r.status_code == 200, "remboursement par l'administrateur")
ref = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/refunds"][-1]["body"]; ok(ref["payment_intent"] == "pi_" + pid[:8], "Stripe : remboursement du bon paiement")
ok(requests.get(f"{B}/talks/{T}", headers=U).json().get("locked") is True, "remboursé : accès coupé tout de suite")
ok(requests.post(f"{B}/admin/sales/{pid}/refund", headers=A).status_code == 409, "déjà remboursé : refusé")
hook(ev("charge.refunded", {"id": "ch_1", "object": "charge", "refunded": True, "payment_intent": "pi_r" + rid[:8]}))
cur.execute("select status from sale_purchases where id=%s", (rid,)); ok(cur.fetchone()[0] == "refunded", "remboursement fait depuis Stripe (webhook) : location coupée")
ok(requests.get(f"{B}/talks/{T}", headers=S).json().get("locked") is True, "abonné remboursé : vidéo de nouveau verrouillée")
mine = requests.get(B + "/me/purchases", headers=U).json(); ok(len(mine) == 1 and mine[0]["status"] == "refunded" and mine[0]["active"] is False, "Mes achats : l'achat apparaît remboursé")

requests.delete(f"{B}/studio/sales/talk/{T}", headers=A); cur.execute("delete from sale_purchases where item_id=%s", (T,)); cur.execute("delete from talks where id=%s", (T,))
requests.put(B + "/admin/features", headers=A, json={"values": {"sales": False}})
print("TOUT EST OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
