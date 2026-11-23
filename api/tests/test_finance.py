"""Administration → Revenus & abonnements : GET /admin/finance — droits, sources réelles, devise, remboursements, aucun code de carte exposé.
Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]


def member(role=None):
    email = f"fin-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Test Fin"})
    if role: cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); uid = str(cur.fetchone()[0])
    return login(email, "Passw0rd-test"), uid


def get(tok):
    return requests.get(B + "/admin/finance", headers={"authorization": "Bearer " + tok})


ADM = login("admin@test.local", "AdminPassw0rd-test")
ORG, o1 = member("organizer"); USER, u1 = member()
ok(requests.get(B + "/admin/finance").status_code == 401, "visiteur : 401")
ok(get(USER).status_code == 403, "membre : 403")
ok(get(ORG).status_code == 403, "organisateur : 403")

base = get(ADM).json()
cur_ = base["currency"]
ok(len(cur_) == 3 and len(base["series"]) == 12, "12 mois, devise principale")
ok(set(base["subscribers"]) >= {"paying", "trialing", "pastDue", "cancelling", "monthly", "yearly"}, "abonnés : tous les états")

tag = uuid.uuid4().hex[:8]
# Une facture de 10 € (remboursée à moitié), une dans une autre devise, une vente de 5 €, une vente remboursée, une carte cadeau de 20 €.
cur.execute("insert into revenue_invoices(id,user_id,amount_cents,refunded_cents,currency,paid_at) values (%s,%s,1000,500,%s,now())", ("in_t" + tag, u1, cur_))
cur.execute("insert into revenue_invoices(id,user_id,amount_cents,currency,paid_at) values (%s,%s,9900,'xyz',now())", ("in_x" + tag, u1))
tid = None
cur.execute("insert into talks(title,source,video_ref,organizer_id,access,publication,video_status) values ('Conf finance','youtube','v1',%s,'free','published','ready') returning id", (o1,)); tid = str(cur.fetchone()[0])
cur.execute("insert into sale_purchases(user_id,email,kind,item_id,title,mode,amount,currency,status,paid_at) values (%s,'a@b.c','talk',%s,'Conf finance','buy',500,%s,'paid',now())", (u1, tid, cur_))
cur.execute("insert into sale_purchases(user_id,email,kind,item_id,title,mode,amount,currency,status,paid_at,refunded_at) values (%s,'a@b.c','talk',%s,'Conf finance','buy',700,%s,'refunded',now(),now())", (u1, tid, cur_))
code = "SECRETCODE" + tag
cur.execute("insert into gift_cards(code,months,status,source,purchaser_id,purchaser_name,amount,currency,paid_at) values (%s,12,'paid','stripe',%s,'Donateur',2000,%s,now())", (code, u1, cur_))

d = get(ADM).json()
dl = lambda k: d["totals"][k] - base["totals"][k]
ok(dl("subscriptions") == 500, "facture : montant moins remboursement (10 € − 5 € = 5 €), autre devise écartée")
ok(dl("sales") == 500, "ventes : seule la vente payée compte (la remboursée est écartée)")
ok(dl("gifts") == 2000, "carte cadeau payée comptée")
ok(dl("all") == 3000 and dl("last30") == 3000, "total et 30 jours = 30 €")
ok(d["otherCurrencyCount"] - base["otherCurrencyCount"] == 1, "autre devise comptée à part")
ok(d["invoicesRecorded"]["count"] - base["invoicesRecorded"]["count"] == 2 and d["invoicesRecorded"]["since"], "historique des factures signalé")
refs = {t["ref"]: t for t in d["transactions"]}
ok(refs.get("in_t" + tag, {}).get("state") == "partial", "facture partiellement remboursée = « partial »")
ok(any(t["kind"] == "sale" and t["state"] == "refunded" for t in d["transactions"]) and any(t["kind"] == "gift" for t in d["transactions"]), "opérations de chaque source présentes")
ok(code not in requests.get(B + "/admin/finance", headers={"authorization": "Bearer " + ADM}).text, "le code secret d'une carte n'est jamais renvoyé")
ok(len(d["transactions"]) <= 12, "12 opérations au plus")

cur.execute("delete from revenue_invoices where id in (%s,%s)", ("in_t" + tag, "in_x" + tag)); cur.execute("delete from gift_cards where code=%s", (code,))
cur.execute("delete from talks where id=%s", (tid,))
cur.execute("delete from sale_purchases where item_id=%s", (tid,))
print("TOUT OK")
