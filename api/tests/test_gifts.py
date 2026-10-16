"""21 (cartes cadeaux) : achat Stripe (faux serveur), webhook, activation, annulation, remboursement, administration.
Prérequis : API (3055) lancée avec STRIPE_API_BASE=http://127.0.0.1:12111, faux Stripe (tests/mock_stripe.py), PG de test (5544)."""
import hashlib, hmac, json, sys, time, uuid, threading, requests, psycopg2

B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"; SECRET = "whsec_test"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def user(prefix="gf"):
    email = f"{prefix}-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Marie"})
    cur.execute("select id from users where email=%s", (email,)); uid = str(cur.fetchone()[0])
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}, uid, email


def hook(event):
    payload = json.dumps(event); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=payload, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})


def ev(typ, obj):
    return {"id": "evt_" + uuid.uuid4().hex[:12], "object": "event", "type": typ, "created": int(time.time()), "data": {"object": obj}}


def outbox(kind, key=None, to=None):
    cur.execute("select count(*) from email_outbox where kind=%s and (%s::text is null or dedupe_key=%s) and (%s::text is null or to_email=%s)", (kind, key, key, to, to))
    return cur.fetchone()[0]


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y",
    "stripe_automatic_tax": "false", "gift_enabled": "false", "gift_price_1": "6.99", "gift_price_3": "19,99", "gift_price_12": "69.99"}, "confirmStripeReset": True})
U, uid, uemail = user("buyer"); R, rid, _ = user("recv"); R2, rid2, _ = user("recv")

# --- boutique
o = requests.get(B + "/gifts/options").json()
ok(o["enabled"] is False and o["options"] == [], "cartes cadeaux désactivées par défaut : rien en vente")
ok(requests.post(B + "/gifts/checkout", headers=U, json={"months": 1, "terms": True}).status_code == 503, "achat refusé tant que c'est désactivé")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"gift_enabled": "true"}})
o = requests.get(B + "/gifts/options").json()
ok(o["enabled"] and [x["months"] for x in o["options"]] == [1, 3, 12] and o["options"][1]["amount"] == 1999 and o["currency"] == "eur", "durées 1/3/12 mois et prix en centimes (virgule acceptée)")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"gift_price_3": "0"}})
ok([x["months"] for x in requests.get(B + "/gifts/options").json()["options"]] == [1, 12], "prix à 0 : durée retirée de la vente")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"gift_price_3": "19.99"}})

# --- achat
ok(requests.post(B + "/gifts/checkout", json={"months": 1, "terms": True}).status_code == 401, "achat : connexion requise")
r = requests.post(B + "/gifts/checkout", headers=U, json={"months": 1}); ok(r.status_code == 400 and r.json()["code"] == "terms_required", "sans acceptation des conditions : refus")
ok(requests.post(B + "/gifts/checkout", headers=U, json={"months": 5, "terms": True}).status_code == 400, "durée inconnue refusée")
ok(requests.post(B + "/gifts/checkout", headers=U, json={"months": 1, "terms": True, "recipientEmail": uemail}).status_code == 400, "se l'offrir à soi-même : refusé")
ok(requests.post(B + "/gifts/checkout", headers=U, json={"months": 1, "terms": True, "recipientEmail": "pas-un-mail"}).status_code == 400, "e-mail du destinataire invalide refusé")
remail = f"dest-{uuid.uuid4().hex[:6]}@test.local"
r = requests.post(B + "/gifts/checkout", headers=U, json={"months": 3, "terms": True, "recipientEmail": remail, "recipientName": "Yasmine", "message": "Qu'Allah t'accorde la science <b>utile</b>."})
ok(r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.test/"), "achat : page de paiement Stripe")
body = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]
ok(body["mode"] == "payment" and body["line_items[0][price_data][unit_amount]"] == "1999" and body["line_items[0][price_data][currency]"] == "eur" and body["customer_email"] == uemail, "Stripe : paiement unique du bon montant")
gid = body["metadata[gift_id]"]; ok(len(gid) == 36, "l'identifiant de la carte accompagne le paiement")
cur.execute("select status, code, months, recipient_email, stripe_session_id from gift_cards where id=%s", (gid,)); st, code, months, rec, sess = cur.fetchone()
ok(st == "pending" and months == 3 and rec == remail and sess and len(code) == 14 and code[4] == "-", "carte créée « en attente » avec un code XXXX-XXXX-XXXX")
cur.execute("select kind, version, context, text, ip from consents where user_id=%s and kind='gift_terms'", (uid,)); row = cur.fetchone()
ok(row and row[2] == "gift:3" and "14 jours" in row[3] and row[4], "acceptation horodatée enregistrée (texte, version, IP)")
ok(requests.get(B + "/me/gifts", headers=U).json() == [], "carte non payée : invisible, code non révélé")
ok(requests.post(B + "/gifts/redeem", headers=R, json={"code": code}).status_code == 404, "carte non payée : code inutilisable")

# --- webhook
session = {"id": sess, "object": "checkout.session", "mode": "payment", "payment_status": "unpaid", "amount_total": 1999, "currency": "eur", "payment_intent": "pi_" + gid[:8], "metadata": {"gift_id": gid}}
hook(ev("checkout.session.completed", session))
cur.execute("select status from gift_cards where id=%s", (gid,)); ok(cur.fetchone()[0] == "pending", "paiement pas encore reçu (unpaid) : la carte reste en attente")
session["payment_status"] = "paid"
e = ev("checkout.session.completed", session)
ok(hook(e).status_code == 200, "webhook : paiement confirmé")
cur.execute("select status, amount, stripe_payment_intent from gift_cards where id=%s", (gid,)); st, amt, pi = cur.fetchone()
ok(st == "paid" and amt == 1999 and pi == "pi_" + gid[:8], "carte payée (montant et paiement enregistrés)")
ok(outbox("gift_purchased", f"gift-buy:{gid}") == 1 and outbox("gift_received", f"gift-recv:{gid}", remail) == 1, "e-mails : confirmation à l'acheteur, carte au destinataire")
cur.execute("select vars from email_outbox where dedupe_key=%s", (f"gift-recv:{gid}",)); v = cur.fetchone()[0]
ok(v["code"] == code and v["from"] == "Marie" and v["months"] == "3 mois" and v["path"] == f"/redeem?code={code}", "e-mail du destinataire : code, expéditeur, durée, lien d'activation")
hook(e); hook(ev("checkout.session.completed", session)); hook(ev("checkout.session.async_payment_succeeded", session))
ok(outbox("gift_purchased", f"gift-buy:{gid}") == 1 and outbox("gift_received", f"gift-recv:{gid}") == 1, "événement rejoué : aucun doublon")
mine = requests.get(B + "/me/gifts", headers=U).json()
ok(len(mine) == 1 and mine[0]["code"] == code and mine[0]["status"] == "paid" and mine[0]["recipientEmail"] == remail, "Mon compte : la carte payée et son code")
ok(requests.get(B + "/me/gifts", headers=R).json() == [], "les cartes d'un autre compte restent privées")

# --- activation
ok(requests.post(B + "/gifts/redeem", headers=R, json={"code": "abc"}).status_code == 400, "code trop court refusé")
ok(requests.post(B + "/gifts/redeem", headers=R, json={"code": "ZZZZ-ZZZZ-ZZZZ"}).status_code == 404, "code inconnu refusé")
ok(requests.post(B + "/gifts/redeem", json={"code": code}).status_code == 401, "activation : connexion requise")
messy = code.lower().replace("-", " ")
res = []
def go(h): res.append(requests.post(B + "/gifts/redeem", headers=h, json={"code": messy}).status_code)
ts = [threading.Thread(target=go, args=(h,)) for h in (R, R2)]
[t.start() for t in ts]; [t.join() for t in ts]
ok(sorted(res) == [200, 409], f"deux activations simultanées du même code : une seule réussit ({res})")
cur.execute("select redeemed_by from gift_cards where id=%s", (gid,)); winner = str(cur.fetchone()[0]); WIN = R if winner == rid else R2
cur.execute("select premium_until > now() + interval '89 days' and premium_until < now() + interval '93 days' from users where id=%s", (winner,)); ok(cur.fetchone()[0], "accès offert pour 3 mois")
bs = requests.get(B + "/billing/status", headers=WIN).json()
ok(bs["active"] is True and bs["complimentaryUntil"], "l'abonnement apparaît actif (offert) dans Mon compte")
ok(outbox("gift_activated", f"gift-act:{gid}") == 1 and outbox("gift_redeemed", f"gift-red:{gid}") == 1, "e-mails : confirmation au bénéficiaire, information à l'acheteur")
r = requests.post(B + "/gifts/redeem", headers=WIN, json={"code": code}); ok(r.status_code == 409 and r.json()["code"] == "used", "code déjà utilisé : refusé")
mine = requests.get(B + "/me/gifts", headers=U).json(); ok(mine[0]["status"] == "redeemed" and mine[0]["redeemedAt"], "l'acheteur voit que sa carte est activée")
ok("redeemedBy" not in json.dumps(mine) and "redeemerEmail" not in json.dumps(mine), "l'acheteur ne voit pas QUI l'a activée")

# --- cartes de l'administration : génération, cumul, annulation
ok(requests.post(B + "/admin/gifts/generate", headers=U, json={"months": 1, "count": 2}).status_code == 403, "génération réservée à l'administrateur")
ok(requests.post(B + "/admin/gifts/generate", headers=ADM, json={"months": 7, "count": 2}).status_code == 400 and requests.post(B + "/admin/gifts/generate", headers=ADM, json={"months": 1, "count": 51}).status_code == 400, "durée ou quantité invalide refusée")
g = requests.post(B + "/admin/gifts/generate", headers=ADM, json={"months": 12, "count": 3, "note": "Concours test"}).json()["codes"]
ok(len(g) == 3 and len(set(g)) == 3, "3 cartes offertes générées, codes distincts")
before = None
cur.execute("select premium_until from users where id=%s", (winner,)); before = cur.fetchone()[0]
r = requests.post(B + "/gifts/redeem", headers=WIN, json={"code": g[0]}).json()
cur.execute("select premium_until from users where id=%s", (winner,)); after = cur.fetchone()[0]
ok(r["months"] == 12 and 360 < (after - before).days < 370, "une 2e carte s'ajoute à la durée restante (cumul)")
cur.execute("select count(*) from email_outbox where kind='gift_redeemed' and dedupe_key like 'gift-red:%%' and dedupe_key in (select 'gift-red:'||id from gift_cards where code=%s)", (g[0],)); ok(cur.fetchone()[0] == 0, "carte de l'agence : pas d'acheteur à prévenir")
lst = requests.get(B + "/admin/gifts?status=paid", headers=ADM).json()
voidable = [x for x in lst["gifts"] if x["code"] == g[1]][0]
ok(requests.post(B + f"/admin/gifts/{voidable['id']}/void", headers=U).status_code == 403, "annulation réservée à l'administrateur")
ok(requests.post(B + f"/admin/gifts/{voidable['id']}/void", headers=ADM).status_code == 200, "l'administrateur annule une carte")
r = requests.post(B + "/gifts/redeem", headers=WIN, json={"code": g[1]}); ok(r.status_code == 410 and r.json()["code"] == "void", "carte annulée : inutilisable")
ok(requests.post(B + f"/admin/gifts/{voidable['id']}/void", headers=ADM).status_code == 409, "annuler deux fois : refusé")
full = requests.get(B + "/admin/gifts", headers=ADM).json()
ok(full["totals"]["redeemed"] >= 2 and full["totals"]["voided"] >= 1 and full["totals"]["revenue"] >= 1999, "totaux : activées, annulées, ventes Stripe (hors cartes offertes)")
ok(any(x["code"] == code and x["purchaserEmail"] == uemail and x["redeemerEmail"] for x in full["gifts"]), "l'administrateur voit acheteur et bénéficiaire")
ok(len(requests.get(B + "/admin/gifts?q=" + code[:9], headers=ADM).json()["gifts"]) == 1, "recherche par code")
ok(requests.get(B + "/admin/gifts", headers=U).status_code == 403, "liste réservée à l'administrateur")
cur.execute("select route from audit_log where route like '/admin/gifts%' and at > now() - interval '10 minutes'"); routes = {r[0] for r in cur.fetchall()}
ok({"/admin/gifts/generate", "/admin/gifts/:id/void"} <= routes, f"actions de l'administrateur inscrites au journal (génération, annulation) : {sorted(routes)}")

# --- remboursement Stripe
ok(requests.post(B + "/gifts/checkout", headers=U, json={"months": 1, "terms": True}).status_code == 200, "2e achat")
body = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]; gid2 = body["metadata[gift_id]"]
cur.execute("select stripe_session_id, code from gift_cards where id=%s", (gid2,)); sess2, code2 = cur.fetchone()
hook(ev("checkout.session.completed", {"id": sess2, "mode": "payment", "payment_status": "paid", "amount_total": 699, "currency": "eur", "payment_intent": "pi_second", "metadata": {"gift_id": gid2}}))
ok(outbox("gift_received", f"gift-recv:{gid2}") == 0, "sans destinataire : aucun e-mail à un tiers")
hook(ev("charge.refunded", {"id": "ch_1", "payment_intent": "pi_second", "refunded": False}))
cur.execute("select status, refunded_at from gift_cards where id=%s", (gid2,)); ok(cur.fetchone() == ("paid", None), "remboursement partiel : carte inchangée")
hook(ev("charge.refunded", {"id": "ch_1", "payment_intent": "pi_second", "refunded": True}))
cur.execute("select status, refunded_at is not null from gift_cards where id=%s", (gid2,)); ok(cur.fetchone() == ("void", True), "remboursement complet : carte annulée")
ok(requests.post(B + "/gifts/redeem", headers=R, json={"code": code2}).status_code == 410, "carte remboursée : inutilisable")
hook(ev("charge.refunded", {"id": "ch_2", "payment_intent": "pi_" + gid[:8], "refunded": True}))
cur.execute("select status, refunded_at is not null from gift_cards where id=%s", (gid,)); ok(cur.fetchone() == ("redeemed", True), "remboursement d'une carte déjà activée : marquée, accès conservé")

# --- ménage : cartes jamais payées
cur.execute("insert into gift_cards(code, months, status, created_at) values ('OLDD-OLDD-OLDD', 1, 'pending', now() - interval '5 days')")
requests.post(B + "/gifts/checkout", headers=U, json={"months": 1, "terms": True})
cur.execute("select count(*) from gift_cards where code='OLDD-OLDD-OLDD'"); ok(cur.fetchone()[0] == 0, "paiements abandonnés depuis plus de 3 jours : nettoyés")
cur.execute("update app_settings set value='false' where key='gift_enabled'")
print("TOUT EST OK")
