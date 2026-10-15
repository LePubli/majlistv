"""Étape D (rémunération des chaînes) : interrupteur, crédit de visionnage (plafonné par le temps réel), factures Stripe (webhook, remboursement),
calcul de la cagnotte et de la part des chaînes, plafond par membre et par jour, clôture, seuil et report, paiement, CSV, droits, journal.
Prérequis : API (3055), PG de test (5544). Mois de test : 2024-03 et 2024-04 (nettoyés avant et après)."""
import hashlib, hmac, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"; SECRET = "whsec_test"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]
users, talks = [], []


def cleanup():
    cur.execute("delete from payout_periods where month in ('2024-03-01','2024-04-01')")
    cur.execute("delete from revenue_invoices where id like 'in_rt%'")
    cur.execute("delete from watch_credit where channel_slug like %s", (f"%{tag}%",))
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from speakers where slug like %s", (f"%{tag}%",))
    for u in users: cur.execute("delete from users where id=%s", (u,))
    cur.execute("delete from app_settings where key in ('feat_revenue','rev_count_free','rev_min_payout','rev_share_pct','rev_costs_pct','rev_user_day_cap')")


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def mk(role, label):
    email = f"rv-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label.title()} {tag}"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]; users.append(uid)
    return str(uid), {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}


def hook(event):
    payload = json.dumps(event); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=payload, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})


def setting(**kv):
    r = requests.put(B + "/admin/settings", headers=ADMIN, json={"values": {k: str(v) for k, v in kv.items()}}); assert r.status_code == 200, r.text
    time.sleep(5.3)


def feature(on):
    assert requests.put(B + "/admin/features", json={"values": {"revenue": on}}, headers=ADMIN).status_code == 200; time.sleep(5.3)


cleanup()
ADMIN = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/settings", headers=ADMIN, json={"values": {"stripe_webhook_secret": SECRET}}); time.sleep(5.3)
a_id, A = mk("organizer", "orga"); b_id, Bh = mk("organizer", "orgb"); u1, U1 = mk("user", "mem1"); u2, U2 = mk("user", "mem2"); u3, U3 = mk("user", "mem3")
S1, S2 = f"Chaine Un {tag}", f"Chaine Deux {tag}"
SL1, SL2 = f"chaine-un-{tag}", f"chaine-deux-{tag}"
for s in (S1, S2):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d',%s,'youtube',%s,%s,'published','ready','free',3600) returning id",
                (f"Conf {s}", s, "v" + uuid.uuid4().hex[:9], a_id)); talks.append(cur.fetchone()[0])
T1 = str(talks[0])
requests.get(B + "/studio/channels", headers=A)  # synchronisation des chaînes
cur.execute("update speakers set owner_id=%s, owner_locked=true where slug=%s", (a_id, SL1))
cur.execute("update speakers set owner_id=null, owner_locked=true where slug=%s", (SL2,))

# --- Interrupteur : coupé par défaut
ok(requests.get(B + "/studio/revenue", headers=A).json().get("code") == "feature_off", "fonction coupée par défaut : /studio/revenue fermé")
ok(requests.get(B + "/admin/revenue", headers=ADMIN).status_code == 404, "fonction coupée : /admin/revenue fermé")
requests.put(B + f"/me/progress/{T1}", json={"positionMs": 0, "durationMs": 3600000}, headers=U1); time.sleep(3)
requests.put(B + f"/me/progress/{T1}", json={"positionMs": 3000, "durationMs": 3600000}, headers=U1)
cur.execute("select count(*) from watch_credit where user_id=%s", (u1,))
ok(cur.fetchone()[0] == 0, "fonction coupée : aucun temps de visionnage crédité")
feature(True)

# --- Crédit de visionnage : suit le temps réel, pas la position annoncée
requests.put(B + f"/me/progress/{T1}", json={"positionMs": 0, "durationMs": 3600000}, headers=U2); time.sleep(3)
requests.put(B + f"/me/progress/{T1}", json={"positionMs": 3000, "durationMs": 3600000}, headers=U2)
cur.execute("select sum(seconds), bool_or(paid), min(channel_slug) from watch_credit where user_id=%s", (u2,)); s, paid, slug = cur.fetchone()
ok(s is not None and 2 <= s <= 5 and paid is False and slug == SL1, f"visionnage réel crédité à la bonne chaîne, membre gratuit ({s} s)")
requests.put(B + f"/me/progress/{T1}", json={"positionMs": 900000, "durationMs": 3600000}, headers=U2)
cur.execute("select sum(seconds) from watch_credit where user_id=%s", (u2,))
ok(cur.fetchone()[0] <= 8, "un saut de position ne crédite pas des heures de visionnage")
cur.execute("delete from watch_credit where user_id=%s", (u2,))

# --- Factures (webhook) et remboursement
cur.execute("update users set stripe_customer_id=%s where id=%s", (f"cus_rt{tag}", u1))
def invoice(i, gross, net, ch, paid_at):
    return {"id": f"evt_{uuid.uuid4().hex[:10]}", "type": "invoice.paid", "created": int(time.time()), "data": {"object": {"id": i, "customer": f"cus_rt{tag}", "amount_paid": gross, "total_excluding_tax": net,
            "currency": "eur", "charge": ch, "status_transitions": {"paid_at": paid_at}}}}
T = int(time.mktime(time.strptime("2024-03-10 12:00", "%Y-%m-%d %H:%M"))) + 7200
ok(hook(invoice("in_rt1", 12000, 10000, "ch_rt1", T)).status_code == 200, "webhook invoice.paid : facture enregistrée")
ok(hook(invoice("in_rt2", 5000, 5000, "ch_rt2", T)).status_code == 200, "webhook invoice.paid : seconde facture")
ok(hook(invoice("in_rt0", 0, 0, "ch_rt0", T)).status_code == 200, "facture à zéro (essai) acceptée")
cur.execute("select count(*) from revenue_invoices where id like 'in_rt%'"); ok(cur.fetchone()[0] == 2, "la facture à zéro n'est pas comptée")
hook(invoice("in_rt1", 12000, 10000, "ch_rt1", T))
cur.execute("select count(*) from revenue_invoices where id='in_rt1'"); ok(cur.fetchone()[0] == 1, "doublon : une seule ligne par facture")
ref = {"id": f"evt_{uuid.uuid4().hex[:10]}", "type": "charge.refunded", "created": int(time.time()), "data": {"object": {"id": "ch_rt2", "amount": 5000, "amount_refunded": 5000, "invoice": "in_rt2"}}}
ok(hook(ref).status_code == 200, "webhook charge.refunded")
cur.execute("select refunded_cents from revenue_invoices where id='in_rt2'"); ok(cur.fetchone()[0] == 5000, "remboursement déduit de la facture")

# --- Visionnage de mars 2024 (directement en base) : plafond de 8 h par membre et par jour
def credit(day, uid, slug, secs, paid):
    cur.execute("insert into watch_credit(day,user_id,talk_id,channel_slug,paid,seconds) values (%s,%s,%s,%s,%s,%s)", (day, uid, T1, slug, paid, secs))
credit("2024-03-05", u1, SL1, 3600, True); credit("2024-03-05", u3, SL1, 7200, False)
credit("2024-03-05", u2, SL2, 3600, True); credit("2024-03-06", u2, SL2, 100000, True)

d = requests.get(B + "/admin/revenue?month=2024-03", headers=ADMIN).json()
L = {l["slug"]: l for l in d["lines"]}
ok(d["closed"] is False and d["closable"] is True and d["netCents"] == 10000, "brouillon : encaissé net = 10000 (facture 1 + facture 2 remboursée)")
ok(d["poolCents"] == 5335, "cagnotte = 10000 × (100−3 %) × 55 % = 5335")
ok(L[SL1]["seconds"] == 10800 and L[SL2]["seconds"] == 32400, "temps compté : plafond de 8 h par jour appliqué (100000 s → 28800 s)")
ok(L[SL1]["amountCents"] == 1333 and L[SL2]["amountCents"] == 4001, "répartition au prorata (1333 + 4001)")
setting(rev_count_free="false")
L = {l["slug"]: l for l in requests.get(B + "/admin/revenue?month=2024-03", headers=ADMIN).json()["lines"]}
ok(L[SL1]["seconds"] == 3600 and L[SL1]["amountCents"] == 533 and L[SL2]["amountCents"] == 4801, "membres gratuits exclus quand le réglage est coupé")
setting(rev_count_free="true")

# --- Droits et validations
ok(requests.get(B + "/admin/revenue", headers=A).status_code == 403, "organisateur : pas d'accès à l'administration")
ok(requests.get(B + "/admin/revenue?month=2024-13", headers=ADMIN).status_code == 400, "mois invalide refusé")
ok(requests.post(B + "/admin/revenue/2099-01/close", headers=ADMIN).status_code == 400, "un mois non terminé ne se clôture pas")
ok(requests.post(B + "/admin/revenue/2024-03/close", headers=A).status_code == 403, "clôture réservée à l'administrateur")

# --- Clôture mars (seuil 20 € : tout est reporté)
r = requests.post(B + "/admin/revenue/2024-03/close", headers=ADMIN); ok(r.status_code == 200 and r.json()["lines"] == 2, "clôture de mars")
ok(requests.post(B + "/admin/revenue/2024-03/close", headers=ADMIN).status_code == 409, "double clôture refusée")
d = requests.get(B + "/admin/revenue?month=2024-03", headers=ADMIN).json(); L = {l["slug"]: l for l in d["lines"]}
ok(d["closed"] is True and L[SL1]["status"] == "carried" and L[SL2]["status"] == "carried", "sous le seuil (20 €) ou sans propriétaire : reporté")
ok(d["unassigned"] >= 1, "chaîne sans propriétaire signalée")

# --- Avril : la facture de 40 € et le report permettent le paiement ; seuil abaissé à 10 €
setting(rev_min_payout="10")
hook(invoice("in_rt3", 4000, 4000, "ch_rt3", int(time.mktime(time.strptime("2024-04-10 12:00", "%Y-%m-%d %H:%M"))) + 7200))
credit("2024-04-03", u1, SL1, 3600, True)
ok(requests.post(B + "/admin/revenue/2024-04/close", headers=ADMIN).status_code == 200, "clôture d'avril")
d = requests.get(B + "/admin/revenue?month=2024-04", headers=ADMIN).json(); L = {l["slug"]: l for l in d["lines"]}
ok(L[SL1]["amountCents"] == 2134 and L[SL1]["carriedInCents"] == 1333 and L[SL1]["status"] == "due", "report de mars repris : 2134 + 1333 à payer")
ok(L[SL2]["status"] == "carried" and L[SL2]["carriedInCents"] == 4001 and L[SL2]["amountCents"] == 0, "chaîne sans propriétaire : le report continue de s'accumuler")
cur.execute("select status from payout_lines where month='2024-03-01' and channel_slug=%s", (SL1,)); ok(cur.fetchone()[0] == "rolled", "la ligne de mars est marquée reprise")

# --- Relevé de l'organisateur
r = requests.get(B + "/studio/revenue", headers=A).json()
ok(r["channels"] >= 1 and any(h["slug"] == SL1 and h["status"] == "due" for h in r["history"]), "l'organisateur voit son relevé à payer")
ok(all(h["slug"] != SL2 for h in r["history"]), "il ne voit pas la chaîne d'un autre")
ok(requests.get(B + "/studio/revenue", headers=U1).status_code == 403, "un membre n'a pas accès au relevé")
rb = requests.get(B + "/studio/revenue", headers=Bh).json(); ok(rb["history"] == [] and rb["channels"] == 0, "un autre organisateur : relevé vide")

# --- Paiement
lid = L[SL1]["id"]
ok(requests.post(B + f"/admin/revenue/lines/{lid}/paid", json={"note": "Virement 15/05"}, headers=A).status_code == 403, "paiement réservé à l'administrateur")
ok(requests.post(B + f"/admin/revenue/lines/{lid}/paid", json={"note": "Virement 15/05"}, headers=ADMIN).status_code == 200, "ligne marquée payée")
ok(requests.post(B + f"/admin/revenue/lines/{lid}/paid", json={}, headers=ADMIN).status_code == 409, "déjà payée : refusé")
ok(requests.post(B + f"/admin/revenue/lines/{L[SL2]['id']}/paid", json={}, headers=ADMIN).status_code == 409, "une ligne reportée ne peut pas être payée")

# --- CSV
r = requests.get(B + "/admin/revenue/2024-04/export.csv", headers=ADMIN)
ok(r.status_code == 200 and "text/csv" in r.headers["content-type"] and "34.67" in r.text and "Virement 15/05" in r.text, "export CSV : total 34,67 et note")
ok(requests.get(B + "/admin/revenue/2024-02/export.csv", headers=ADMIN).status_code == 404, "CSV d'un mois sans relevé : 404")
ok(requests.get(B + "/admin/revenue/2024-04/export.csv", headers=A).status_code == 403, "CSV réservé à l'administrateur")

# --- Journal
al = requests.get(B + "/admin/audit?limit=60", headers=ADMIN).text
ok("Rémunération 2024-04 clôturée" in al and "payée" in al, "actions inscrites au journal")

feature(False)
ok(requests.get(B + "/studio/revenue", headers=A).status_code == 404, "fonction recoupée : relevé fermé")
cleanup(); print("TOUT OK")
