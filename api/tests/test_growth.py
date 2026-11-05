"""Entonnoir et cohortes (amélioration 7.1) : droits, définitions (payant, fidélité, activité), mois d'activité enregistré à l'usage, RGPD.
Prérequis : API (3055), PG de test (5544), compte admin admin@test.local. Les chiffres sont comparés AVANT/APRÈS (la base de test contient d'autres comptes)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def mk(created="now()", role="user"):
    email = f"gr-{uuid.uuid4().hex[:8]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Gr Test"})
    cur.execute("update users set role=%s, created_at=" + created + " where email=%s returning id", (role, email))
    return email, cur.fetchone()[0]


def ts(expr):
    cur.execute("select (" + ("'" + expr + "'" if expr[:1].isdigit() else expr) + ")::timestamptz::text"); return cur.fetchone()[0]


def sub(uid, status, created, trial_end=None, updated=None, tier="standard"):
    created, updated = ts(created), ts(updated or created)
    cur.execute("insert into subscriptions(id,user_id,status,trial_end,created_at,updated_at,tier) values (%s,%s,%s,%s,%s,%s,%s)",
                ("sub_" + uuid.uuid4().hex[:12], uid, status, trial_end, created, updated, tier))


def get(h, days=30):
    r = requests.get(f"{B}/admin/stats/growth?days={days}", headers=h); return r


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
em, _ = mk(); MEM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}

# --- droits
ok(requests.get(f"{B}/admin/stats/growth").status_code == 401, "sans connexion → 401")
ok(get(MEM).status_code == 403, "membre simple → 403")
ok(requests.get(f"{B}/admin/stats/growth?days=5", headers=ADM).status_code in (400, 422, 500), "période invalide refusée")
r = get(ADM); ok(r.status_code == 200 and r.headers.get("cache-control", "").startswith("private"), "admin → 200, jamais en cache partagé")
for k in ("funnel", "retention", "activity", "since", "until"):
    ok(k in r.json(), f"réponse : champ {k}")
ok(len(r.json()["retention"]) == 12 and len(r.json()["activity"]) == 12, "12 cohortes mensuelles")
raw = r.text
ok("@test.local" not in raw and "email" not in raw, "aucune identité dans la réponse")

# --- entonnoir (avant / après)
b = get(ADM).json()["funnel"]
e1, u1 = mk(); e2, u2 = mk(); e3, u3 = mk(); e4, u4 = mk(); e5, u5 = mk(role="organizer")
cur.execute("select (now() + interval '3 days')::text, (now() - interval '2 days')::text"); fut, past = cur.fetchone()
sub(u1, "trialing", "now()", trial_end=fut)                                    # essai en cours : essai, pas payant
sub(u2, "active", "now()", trial_end=past, updated="now()")                    # essai terminé, abonné : essai + payant
sub(u3, "active", "now()", tier="learning")                                    # sans essai, formule Apprentissage : payant
sub(u4, "canceled", "now()", trial_end=past, updated=past)                     # résilié pendant l'essai : essai, pas payant
sub(u5, "active", "now()")                                                      # organisateur : ni inscrit ni payant
a = get(ADM).json()["funnel"]
ok(a["signups"] - b["signups"] == 4, "inscrits : +4 (l'organisateur ne compte pas)")
ok(a["trials"] - b["trials"] == 3, "essais : +3")
ok(a["paid"] - b["paid"] == 2, "payants : +2 (essai en cours et essai résilié exclus)")
ok(a["paidLearning"] - b["paidLearning"] == 1 and a["paidStandard"] - b["paidStandard"] == 1, "répartition Apprentissage / standard")
ok(a["rates"]["paidPerTrial"] is None or 0 <= a["rates"]["paidPerTrial"] <= 100, "taux essai → payant cohérent")

# --- fidélité des abonnés (cohorte il y a 2 mois : 3 payants, 1 résilié le mois dernier)
def cell(res, month_offset, k):
    cur.execute("select to_char(date_trunc('month', now() at time zone 'Europe/Paris') - make_interval(months => %s), 'YYYY-MM')", (month_offset,))
    m = cur.fetchone()[0]
    row = next(x for x in res["retention"] if x["cohort"] == m)
    return row, (row["cells"][k] if k < len(row["cells"]) else None)
r0, c0 = cell(get(ADM).json(), 2, 1)
ids = []
for i in range(3):
    _, u = mk("now() - interval '2 months'")
    ids.append(u)
    sub(u, "active" if i < 2 else "canceled", "now() - interval '2 months'",
        updated=("now()" if i < 2 else "now() - interval '1 month'"))
r1, c1 = cell(get(ADM).json(), 2, 1)
ok(r1["size"] - r0["size"] == 3, "cohorte du 1er paiement : +3 abonnés")
ok(c1["n"] - c0["n"] == 2, "fin du mois +1 : 2 encore abonnés sur 3 (1 résilié)")
ok(r1["cells"][0]["n"] - r0["cells"][0]["n"] == 3, "mois 0 : 3 abonnés")

# --- activité : enregistrée à l'usage (une ligne par compte et par mois), sans autre donnée
em6, u6 = mk("now() - interval '3 months'")
tok = requests.post(B + "/auth/login", json={"email": em6, "password": "Passw0rd-test"}).json()["token"]
cur.execute("delete from user_activity_month where user_id=%s", (u6,))
for _ in range(3):
    requests.get(B + "/me/learning/summary", headers={"authorization": "Bearer " + tok}); requests.get(B + "/auth/me", headers={"authorization": "Bearer " + tok})
time.sleep(1.0)
cur.execute("select count(*), min(month)=date_trunc('month', now() at time zone 'Europe/Paris')::date from user_activity_month where user_id=%s", (u6,))
n, same = cur.fetchone()
ok(n == 1 and same, "usage connecté → une seule ligne (compte, mois en cours)")
cur.execute("select column_name from information_schema.columns where table_name='user_activity_month' order by 1")
ok([c[0] for c in cur.fetchall()] == ["month", "user_id"], "la table ne contient que le compte et le mois")
# un jeton enfant ou un visiteur n'enregistre rien
cur.execute("select count(*) from user_activity_month"); n0 = cur.fetchone()[0]
requests.get(B + "/talks"); time.sleep(0.5)
cur.execute("select count(*) from user_activity_month"); ok(cur.fetchone()[0] == n0, "visiteur anonyme : rien d'enregistré")

# --- RGPD : l'export personnel contient ses mois d'activité
ex = requests.get(B + "/me/export", headers={"authorization": "Bearer " + tok})
ok(ex.status_code == 200 and "user_activity_month" in ex.text, "export RGPD : mois d'activité inclus")

# --- RGPD : suppression du compte → mois supprimés ; export inclut la table
cur.execute("select count(*) from user_activity_month where user_id=%s", (u6,)); ok(cur.fetchone()[0] == 1, "mois présent avant suppression")
cur.execute("delete from users where id=%s", (u6,))
cur.execute("select count(*) from user_activity_month where user_id=%s", (u6,)); ok(cur.fetchone()[0] == 0, "compte supprimé → mois d'activité supprimés (cascade)")

# --- nettoyage
for u in (u1, u2, u3, u4, u5, *ids):
    cur.execute("delete from users where id=%s", (u,))
print("Tous les contrôles passent.")
