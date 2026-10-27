"""29 : santé du serveur — droits, forme du rapport, mesure immédiate, alertes e-mail (déclenchement, pas de doublon, retour à la normale).
Prérequis : API de test (3055), PG de test (5544), SMTP factice (tests/smtp_sink.py 2525 → /tmp/claude-0/mails)."""
import sys, time, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def setting(A, **kv):
    r = requests.put(B + "/admin/settings", headers=A, json={"values": kv})
    ok(r.status_code == 200, f"réglage {list(kv)} : {r.status_code} {r.text[:120] if r.status_code != 200 else ''}")


def outbox():
    cur.execute("select to_email, status, vars->>'title' from email_outbox where kind = 'health_alert' order by id")
    return cur.fetchall()


A = login("admin@test.local", "AdminPassw0rd-test")

# 1) Droits
ok(requests.get(B + "/admin/health").status_code == 401, "sans jeton : 401")
em = "org-health@test.local"
cur.execute("delete from users where email = %s", (em,))
requests.post(B + "/auth/register", json={"email": em, "password": "OrgPassw0rd-test", "name": "Org"})
cur.execute("update users set role = 'organizer' where email = %s", (em,))
O = login(em, "OrgPassw0rd-test")
for m, p in (("get", "/admin/health"), ("post", "/admin/health/check"), ("post", "/admin/health/test-alert")):
    ok(getattr(requests, m)(B + p, headers=O).status_code == 403, f"organisateur : 403 sur {p}")

# 2) Rapport
cur.execute("delete from health_samples"); cur.execute("delete from health_alerts"); cur.execute("delete from email_outbox where kind = 'health_alert'")
setting(A, health_alerts_enabled="true", health_disk_warn_pct="80", health_disk_crit_pct="90", health_mem_crit_pct="99", health_alert_to="", smtp_host="", mail_from="")
r = requests.get(B + "/admin/health", headers=A); j = r.json()
ok(r.status_code == 200, "GET /admin/health : 200")
ok(j["disk"]["total"] > 0 and 0 <= j["disk"]["pct"] <= 100 and j["mem"]["total"] > 0, "disque et mémoire mesurés")
ok(len(j["cpu"]["load"]) == 3 and j["cpu"]["cpus"] >= 1, "charge et nombre de cœurs")
ok(j["database"]["size"] > 0 and len(j["database"]["tables"]) >= 1, "taille de la base et plus grosses tables")
ok(j["alerts"]["mailConfigured"] is False and j["alerts"]["recipients"] >= 1, "e-mail non configuré, administrateur destinataire par défaut")
ok(j["thresholds"]["diskWarn"] == 80 and j["thresholds"]["diskCrit"] == 90, "seuils lus dans les réglages")
ok(j["level"] in ("ok", "warn", "crit"), "niveau global présent")

# 3) Mesure immédiate
r = requests.post(B + "/admin/health/check", headers=A)
ok(r.status_code == 200 and "disk" in r.json(), "POST check : 200 + rapport")
cur.execute("select count(*) from health_samples"); ok(cur.fetchone()[0] == 1, "un échantillon enregistré")
cur.execute("select kind, level from health_alerts order by kind"); st = dict(cur.fetchall())
ok({"disk", "mem"} <= set(st), "niveaux disque et mémoire mémorisés")
ok(len(r.json()["series"]) == 1, "série horaire de 7 jours (1 point)")

# 4) Alertes e-mail
pct = requests.get(B + "/admin/health", headers=A).json()["disk"]["pct"]
setting(A, smtp_host="127.0.0.1", smtp_port="2525", smtp_security="none", mail_from="Test <noreply@test.local>", health_disk_warn_pct=str(max(10, pct - 1)), health_disk_crit_pct="99")
before = len(outbox())
requests.post(B + "/admin/health/check", headers=A)
if pct >= 11:
    rows = outbox()
    ok(len(rows) > before and all(r[0] for r in rows), "seuil franchi : e-mail d'alerte mis en file")
    ok(any("à surveiller" in (r[2] or "") or "critique" in (r[2] or "") for r in rows), "titre d'alerte lisible")
    n1 = len(rows)
    requests.post(B + "/admin/health/check", headers=A)
    ok(len(outbox()) == n1, "mesure suivante : pas de doublon")
    # retour à la normale
    setting(A, health_disk_warn_pct="80", health_disk_crit_pct="90")
    requests.post(B + "/admin/health/check", headers=A)
    ok(any("revenu à la normale" in (r[2] or "") for r in outbox()), "retour à la normale : e-mail envoyé")
    n2 = len(outbox())
    requests.post(B + "/admin/health/check", headers=A)
    ok(len(outbox()) == n2, "retour à la normale : un seul e-mail")
else:
    print("SKIP alertes disque (disque utilisé < 11 %)")

# 5) Alerte coupée
cur.execute("delete from health_alerts"); cur.execute("delete from email_outbox where kind = 'health_alert'")
setting(A, health_alerts_enabled="false", health_disk_warn_pct="10", health_disk_crit_pct="10")
requests.post(B + "/admin/health/check", headers=A)
ok(len(outbox()) == 0, "alertes désactivées : aucun e-mail")
setting(A, health_alerts_enabled="true", health_disk_warn_pct="80", health_disk_crit_pct="90")

# 6) Essai d'alerte
r = requests.post(B + "/admin/health/test-alert", headers=A)
ok(r.status_code == 200 and r.json()["sent"] >= 1, "e-mail d'essai envoyé")
ok(any((x[2] or "").startswith("[Essai]") for x in outbox()), "titre [Essai]")
setting(A, smtp_host="", mail_from="")
ok(requests.post(B + "/admin/health/test-alert", headers=A).status_code == 400, "essai sans e-mail configuré : 400 lisible")

# 7) Validation des réglages
r = requests.put(B + "/admin/settings", headers=A, json={"values": {"health_disk_warn_pct": "5"}})
ok(r.status_code == 400, "seuil hors limites refusé")

# 8) Purge des vieux échantillons
cur.execute("insert into health_samples(at, disk_total, disk_free, mem_total, mem_avail, load1) values (now() - interval '40 days', 1, 1, 1, 1, 0)")
requests.post(B + "/admin/health/check", headers=A)
cur.execute("select count(*) from health_samples where at < now() - interval '35 days'"); ok(cur.fetchone()[0] == 0, "échantillons de plus de 35 jours supprimés")
print("\nTout est OK")
