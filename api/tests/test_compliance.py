import email, glob, hashlib, hmac, json, os, re, sys, time, uuid, requests, psycopg2
from email import policy
B = "http://127.0.0.1:3055"; M = "http://127.0.0.1:12111"; MAILS = "/tmp/claude-0/mails"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
def mails():
    out = []
    for f in sorted(glob.glob(MAILS + "/*.eml")):
        msg = email.message_from_bytes(open(f, "rb").read(), policy=policy.default)
        body = msg.get_body(preferencelist=("plain",)).get_content()
        html = msg.get_body(preferencelist=("html",)).get_content()
        out.append({"to": msg["To"], "subject": str(msg["Subject"]), "text": body, "html": html, "from": msg["From"]})
    return out
def wait_mail(pred, label, timeout=40):
    for _ in range(timeout * 2):
        found = [m for m in mails() if pred(m)]
        if found: return found
        time.sleep(0.5)
    ok(False, label)
SECRET = "whsec_test"
def hook(event):
    payload = json.dumps(event); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=payload, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})
def ev(typ, obj, prev=None):
    e = {"id": "evt_" + uuid.uuid4().hex[:12], "object": "event", "type": typ, "created": int(time.time()), "data": {"object": obj}}
    if prev is not None: e["data"]["previous_attributes"] = prev
    return e

adm = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json(); A = {"authorization": "Bearer " + adm["token"]}

# 1) inscription sans envoi configuré : l'e-mail attend
em = f"c{uuid.uuid4().hex[:6]}@test.local"
r = requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test!", "name": "Amina", "locale": "fr"}); ok(r.status_code == 201, "inscription")
U = {"authorization": "Bearer " + r.json()["token"]}; uid = r.json()["user"]["id"]
time.sleep(1)
cur.execute("select status, kind from email_outbox where user_id=%s", (uid,)); ok(cur.fetchall() == [("pending", "welcome")], "bienvenue en file (envoi pas encore configuré)")
st = requests.get(B + "/admin/status", headers=A).json(); ok(st["emails"].get("pending", 0) >= 1, "tableau de bord : e-mails en attente")

# 2) réglages SMTP dans le back-office -> envoi
vals = {"app_name": "Mejliss TV", "web_url": "https://web.test", "smtp_host": "127.0.0.1", "smtp_port": "2525", "smtp_security": "none",
        "mail_from": "Mejliss TV <noreply@test.local>", "mail_reply_to": "contact@test.local", "smtp_user": "", "smtp_password": None}
r = requests.put(B + "/admin/settings", headers=A, json={"values": vals}); ok(r.status_code == 200, "réglages e-mail enregistrés")
groups = {g["id"] for g in r.json()["groups"]}; ok("email" in groups, "groupe E-mails présent dans Paramètres")
m = wait_mail(lambda m: em in m["to"], "bienvenue envoyée")[0]
ok(m["subject"] == "Bienvenue sur Mejliss TV" and "Bonjour Amina" in m["text"] and "https://web.test/brand/email-logo.png" in m["html"] and "https://web.test/" in m["text"], "bienvenue : sujet, prénom, logo, lien")
ok("noreply@test.local" in m["from"], "expéditeur correct")
r = requests.post(B + "/admin/settings/test", headers=A, json={"target": "smtp"}).json(); ok(r["ok"], "test SMTP : " + r["message"][:60])
wait_mail(lambda m: "admin@test.local" in m["to"] and "Test" in m["subject"], "e-mail de test reçu par l'admin")

# 3) mot de passe oublié
n0 = len(mails())
r = requests.post(B + "/auth/forgot", json={"email": "inconnu@test.local"}); ok(r.status_code == 200 and r.json() == {"ok": True}, "adresse inconnue : même réponse")
r = requests.post(B + "/auth/forgot", json={"email": em.upper()}); ok(r.status_code == 200, "demande de réinitialisation")
m = wait_mail(lambda m: em in m["to"] and "Réinitialiser" in m["subject"], "e-mail de réinitialisation")[0]
token = re.search(r"/reset\?token=([\w-]+)", m["text"]).group(1)
ok(len([x for x in mails() if "inconnu" in x["to"]]) == 0, "rien envoyé à l'adresse inconnue")
cur.execute("select count(*) from password_resets where token_hash=%s", (token,)); ok(cur.fetchone()[0] == 0, "jeton stocké seulement sous forme d'empreinte")
ok(requests.post(B + "/auth/reset", json={"token": token, "password": "short"}).status_code == 400, "mot de passe trop court refusé")
time.sleep(1.2)
ok(requests.post(B + "/auth/reset", json={"token": token, "password": "NouveauPass-123"}).status_code == 200, "nouveau mot de passe enregistré")
ok(requests.get(B + "/auth/me", headers=U).status_code == 401, "ancienne session déconnectée")
ok(requests.post(B + "/auth/reset", json={"token": token, "password": "Autre-Pass-123"}).status_code == 400, "lien utilisable une seule fois")
r = requests.post(B + "/auth/login", json={"email": em, "password": "NouveauPass-123"}); ok(r.status_code == 200, "connexion avec le nouveau mot de passe")
U = {"authorization": "Bearer " + r.json()["token"]}
ok(requests.get(B + "/auth/me", headers=U).status_code == 200, "nouvelle session valide")
cur.execute("insert into password_resets(token_hash,user_id,expires_at) values('x'||md5(random()::text), %s, now()-interval '1 minute') returning token_hash", (uid,))
ok(requests.post(B + "/auth/reset", json={"token": "a" * 43, "password": "Autre-Pass-123"}).status_code == 400, "jeton inconnu refusé")

# 4) paiement conforme
requests.put(B + "/admin/settings", headers=A, json={"values": {"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": SECRET, "stripe_price_monthly": "price_m", "stripe_price_yearly": "price_y", "stripe_automatic_tax": "false"}, "confirmStripeReset": True})
r = requests.post(B + "/billing/checkout", headers=U, json={"interval": "year"}); ok(r.status_code == 400 and r.json()["code"] == "waiver_required", "sans case de renonciation -> refus")
r = requests.post(B + "/billing/checkout", headers=U, json={"interval": "year", "waiver": True}); ok(r.status_code == 200 and r.json()["url"].startswith("https://checkout"), "avec renonciation -> page de paiement")
cur.execute("select kind, version, context, text, ip from consents where user_id=%s", (uid,)); row = cur.fetchone()
ok(row and row[0] == "withdrawal_waiver" and row[2] == "checkout:year" and "L221-28" in row[3] and row[4], "consentement horodaté enregistré (texte, version, IP)")
body = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]
ok(body.get("allow_promotion_codes") == "true" and "renouvelle" in body.get("custom_text[submit][message]", "") and "automatic_tax[enabled]" not in body, "codes promo + mention de renouvellement, sans TVA auto")
requests.put(B + "/admin/settings", headers=A, json={"values": {"stripe_automatic_tax": "true"}})
requests.post(B + "/billing/checkout", headers=U, json={"interval": "month", "waiver": True})
body = [x for x in requests.get(M + "/_log").json() if x["path"] == "/v1/checkout/sessions"][-1]["body"]
ok(body.get("automatic_tax[enabled]") == "true" and body.get("billing_address_collection") == "required" and body.get("tax_id_collection[enabled]") == "true", "TVA automatique : Stripe Tax + adresse de facturation")
r = requests.get(B + "/admin/users/" + uid + "/consents", headers=A).json(); ok(len(r) == 2, "preuves de consentement visibles par l'admin")

# 5) webhooks -> e-mails
price = {"id": "price_y", "unit_amount": 6999, "currency": "eur", "recurring": {"interval": "year"}}
sub = {"id": "sub_c1", "object": "subscription", "customer": "cus_1", "status": "trialing", "metadata": {"user_id": uid}, "trial_end": int(time.time()) + 3 * 86400,
       "cancel_at_period_end": False, "items": {"data": [{"price": price, "current_period_end": int(time.time()) + 3 * 86400}]}}
ok(hook(ev("customer.subscription.created", sub)).status_code == 200, "abonnement créé (webhook)")
e = ev("customer.subscription.trial_will_end", sub); ok(hook(e).status_code == 200, "fin d'essai annoncée")
hook(e); hook(ev("customer.subscription.trial_will_end", sub))
m = wait_mail(lambda m: em in m["to"] and "essai gratuit se termine" in m["subject"], "rappel de fin d'essai")
time.sleep(2)
ok(len([x for x in mails() if em in x["to"] and "essai gratuit se termine" in x["subject"]]) == 1, "rappel envoyé une seule fois malgré 3 webhooks")
ok("69,99" in m[0]["text"] and "annuel" in m[0]["text"] and "https://web.test/account" in m[0]["text"], "rappel : montant, formule, lien Mon compte")
inv = {"id": "in_1", "object": "invoice", "customer": "cus_1", "amount_paid": 6999, "amount_due": 6999, "currency": "eur", "hosted_invoice_url": "https://invoice.stripe.test/in_1"}
hook(ev("invoice.paid", inv)); m = wait_mail(lambda m: em in m["to"] and "Paiement reçu" in m["subject"], "confirmation de paiement")[0]
ok("https://invoice.stripe.test/in_1" in m["text"], "lien vers la facture")
hook(ev("invoice.paid", dict(inv, id="in_0", amount_paid=0)))
hook(ev("invoice.payment_failed", dict(inv, id="in_2", attempt_count=1))); wait_mail(lambda m: em in m["to"] and "Échec du paiement" in m["subject"], "échec de paiement")
canceled = dict(sub, status="active", cancel_at_period_end=True)
hook(ev("customer.subscription.updated", canceled, {"cancel_at_period_end": False})); wait_mail(lambda m: em in m["to"] and "Résiliation" in m["subject"], "résiliation")
hook(ev("customer.subscription.updated", canceled, {"status": "trialing"}))
hook(ev("customer.subscription.deleted", dict(sub, status="canceled"))); wait_mail(lambda m: em in m["to"] and "terminé" in m["subject"], "fin d'abonnement")
time.sleep(2)
ok(len([x for x in mails() if em in x["to"] and "Paiement reçu" in x["subject"]]) == 1, "facture à 0 € : pas d'e-mail")
ok(len([x for x in mails() if em in x["to"] and "Résiliation" in x["subject"]]) == 1, "mise à jour sans changement de résiliation : pas d'e-mail")

# 6) langue de l'utilisateur
em2 = f"e{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": em2, "password": "Passw0rd-test!", "name": "John", "locale": "en"})
m = wait_mail(lambda m: em2 in m["to"], "bienvenue en anglais")[0]; ok(m["subject"] == "Welcome to Mejliss TV" and "Hello John" in m["text"], "e-mail dans la langue du compte")
em3 = f"a{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": em3, "password": "Passw0rd-test!", "name": "Omar", "locale": "ar"})
m = wait_mail(lambda m: em3 in m["to"], "bienvenue en arabe")[0]; ok("أهلًا" in m["subject"] and 'dir="rtl"' in m["html"], "arabe : de droite à gauche")
ok(requests.post(B + "/auth/register", json={"email": "x" + em3, "password": "Passw0rd-test!", "name": "<script>x</script>", "locale": "fr"}).status_code == 201, "inscription avec nom piégé")
m = wait_mail(lambda m: ("x" + em3) in m["to"], "e-mail nom piégé")[0]; ok("<script>" not in m["html"] and "&lt;script&gt;" in m["html"], "nom échappé dans l'e-mail HTML")

# 7) pages légales
r = requests.get(B + "/legal/cgv"); ok(r.status_code == 200 and "L221-28" in r.json()["body"], "CGV publiques (modèle)")
ok(requests.get(B + "/legal").json() and len(requests.get(B + "/legal").json()) == 3, "3 pages légales")
ok(requests.put(B + "/admin/legal/cgv", headers=U, json={"title": "x", "body": "y"}).status_code == 403, "modification refusée à un utilisateur")
r = requests.put(B + "/admin/legal/mentions-legales", headers=A, json={"title": "Mentions légales", "body": "## Éditeur\nLe Publicitaire"}); ok(r.status_code == 200, "admin modifie une page")
ok(requests.get(B + "/legal/mentions-legales").json()["body"].startswith("## Éditeur"), "modification visible")
ok(requests.get(B + "/legal/../etc").status_code in (400, 404), "chemin piégé refusé")

# 8) SMTP en panne : réessais
requests.put(B + "/admin/settings", headers=A, json={"values": {"smtp_port": "2599"}})
requests.post(B + "/auth/forgot", json={"email": em2})
for _ in range(60):
    cur.execute("select attempts, status, last_error from email_outbox where to_email=%s and kind='password_reset'", (em2,)); row = cur.fetchone()
    if row and row[0] >= 1 and row[2]: break
    time.sleep(0.5)
ok(row and row[1] == "pending" and row[2], f"serveur injoignable : réessai prévu ({row[2][:40] if row and row[2] else ''})")
requests.put(B + "/admin/settings", headers=A, json={"values": {"smtp_port": "2525"}})
print("TOUT OK")
