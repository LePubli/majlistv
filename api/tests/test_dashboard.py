"""11.1 : tableau de bord admin (GET /admin/dashboard). Prérequis : API (3055) et PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


admin = login("admin@test.local", "AdminPassw0rd-test")
email = f"u-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Visiteur"})
user = login(email, "Passw0rd-test")

ok(requests.get(B + "/admin/dashboard").status_code == 401, "anonyme refusé")
ok(requests.get(B + "/admin/dashboard", headers=user).status_code == 403, "simple utilisateur refusé")
d = requests.get(B + "/admin/dashboard", headers=admin).json()
for k in ("users", "talks", "subscribers", "todo", "health", "signups", "failedTalks"):
    ok(k in d, f"clé {k} présente")
ok(d["users"]["total"] >= 2 and d["users"]["week"] >= 1, "compteurs d'utilisateurs")
ok(d["signups"][0]["email"] == email, "dernière inscription en tête")
ok(len(d["signups"]) <= 8, "8 inscriptions max")
hk = {h["key"]: h for h in d["health"]}
ok(hk["db"]["state"] == "ok", "base de données ok")
ok({"worker", "transcriber", "translator", "search", "stripe", "smtp", "storage", "insights"} <= set(hk), "tous les services listés")
ok(all(h["state"] in ("ok", "warn", "error", "off") for h in d["health"]), "états valides")

# Un abonné payant, un en essai, un en retard
def mkuser():
    e = f"s-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": e, "password": "Passw0rd-test", "name": "Abonné"})
    cur.execute("select id from users where email=%s", (e,)); return cur.fetchone()[0]

# Point de départ connu : Stripe non configuré (d'autres suites de tests enregistrent des clés et des prix de test).
cur.execute("delete from app_settings where key like 'stripe_%'")
time.sleep(6)  # cache des réglages de l'API : 5 s
before = requests.get(B + "/admin/dashboard", headers=admin).json()["subscribers"]
for status, cancel in (("active", False), ("trialing", False), ("past_due", False), ("active", True)):
    uid = mkuser()
    cur.execute("insert into subscriptions(id,user_id,status,billing_interval,cancel_at_period_end) values(%s,%s,%s,'month',%s)", ("sub_t" + uuid.uuid4().hex[:10], uid, status, cancel))
s = requests.get(B + "/admin/dashboard", headers=admin).json()["subscribers"]
ok(s["paying"] - before["paying"] == 3, "abonnés payants +3 (2 actifs + 1 en retard)")
ok(s["trialing"] - before["trialing"] == 1, "essais +1")
ok(s["pastDue"] - before["pastDue"] == 1, "retards +1")
ok(s["cancelling"] - before["cancelling"] == 1, "résiliations programmées +1")
ok(s["mrr"] is None, "revenu estimé absent sans Stripe configuré")
d = requests.get(B + "/admin/dashboard", headers=admin).json()
ok(any(t["key"] == "past_due" for t in d["todo"]), "« À traiter » signale le paiement en retard")

# Conférences : en échec + bloquée
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
def mktalk(title, **cols):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,video_status,transcript_status) values(%s,'X','upload','x',%s,%s,%s) returning id",
                (title, aid, cols.get("video", "ready"), cols.get("tr", "unavailable")))
    return cur.fetchone()[0]
b = requests.get(B + "/admin/dashboard", headers=admin).json()
f = mktalk("Dash échec", video="failed")
g = mktalk("Dash bloquée", video="processing")
cur.execute("update talk_events set at = now() - interval '5 hours' where talk_id=%s", (g,))
d = requests.get(B + "/admin/dashboard", headers=admin).json()
keys = {t["key"]: t for t in d["todo"]}
ok(d["talks"]["failed"] == b["talks"]["failed"] + 1, "conférence en échec comptée")
ok("video_failed" in keys and keys["video_failed"]["severity"] == "error", "« À traiter » : conversion en échec")
ok("stuck_video" in keys, "« À traiter » : conversion bloquée")
ok(any(t["title"] == "Dash échec" for t in d["failedTalks"]), "liste des conférences en échec")
ok({h["key"]: h for h in d["health"]}["worker"]["state"] == "error", "worker signalé en erreur")
ok(keys["video_failed"]["link"].startswith("/studio"), "lien vers le studio")
cur.execute("delete from talks where id in (%s,%s)", (f, g))
d = requests.get(B + "/admin/dashboard", headers=admin).json()
ok("stuck_video" not in {t["key"] for t in d["todo"]}, "plus de blocage après nettoyage")

# E-mails en échec
cur.execute("insert into email_outbox(to_email,kind,status,last_error) values('x@test.local','welcome','failed','boom')")
d = requests.get(B + "/admin/dashboard", headers=admin).json()
ok("email_failed" in {t["key"] for t in d["todo"]}, "« À traiter » : e-mails en échec")
cur.execute("delete from email_outbox where to_email='x@test.local'")
print("TOUT OK")
