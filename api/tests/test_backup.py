"""37 : suivi des sauvegardes — jeton, rapport, évaluation, alerte e-mail, retour à la normale, rétention.
Prérequis : API de test (3055), PG de test (5544), SMTP factice (tests/smtp_sink.py 2525)."""
import sys, requests, psycopg2

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


def report(token, kind, good, summary="", details=None):
    return requests.post(B + "/backup/report", headers={"authorization": "Bearer " + token} if token else {}, json={"kind": kind, "ok": good, "summary": summary, "details": details or {}})


def bk():
    return requests.get(B + "/admin/health", headers=A).json()["backup"]


def alerts():
    cur.execute("select to_email, vars->>'title', vars->>'summary' from email_outbox where kind = 'health_alert' and vars->>'title' like 'Sauvegardes%' order by id")
    return cur.fetchall()


A = login("admin@test.local", "AdminPassw0rd-test")
TOKEN = "backup-token-for-tests-0123456789"
cur.execute("delete from backup_reports"); cur.execute("delete from health_alerts"); cur.execute("delete from email_outbox where kind = 'health_alert'")

# 1) Sans jeton configuré
setting(A, backup_report_token="", health_alerts_enabled="true", smtp_host="127.0.0.1", smtp_port="2525", smtp_security="none", mail_from="Test <noreply@test.local>", health_alert_to="")
ok(report(TOKEN, "backup", True).status_code == 503, "jeton non configuré : 503 lisible")
ok(bk()["level"] == "off", "suivi désactivé affiché 'off'")

# 2) Jeton configuré : refus et droits
setting(A, backup_report_token=TOKEN)
ok(report(None, "backup", True).status_code == 401, "sans jeton : 401")
ok(report("mauvais-jeton", "backup", True).status_code == 401, "mauvais jeton : 401")
ok(requests.post(B + "/backup/report", headers={"authorization": "Bearer " + TOKEN}, json={"kind": "autre", "ok": True}).status_code == 400, "type inconnu : 400")
ok(requests.post(B + "/backup/report", headers={"authorization": "Bearer " + TOKEN}, json={"kind": "backup"}).status_code == 400, "champ « ok » obligatoire : 400")
ok(requests.get(B + "/admin/health").status_code == 401, "rapport santé toujours réservé aux administrateurs")

# 3) Rien reçu : attention, pas d'e-mail critique
requests.post(B + "/admin/health/check", headers=A)
b = bk()
ok(b["level"] == "warn" and len(b["reasons"]) == 2, "aucun rapport : attention (sauvegarde + test)")
cur.execute("select level from health_alerts where kind = 'backup'"); ok(cur.fetchone()[0] == "warn", "niveau 'backup' mémorisé")

# 4) Rapports de réussite → ok, retour à la normale signalé
cur.execute("delete from email_outbox where kind = 'health_alert'")
r = report(TOKEN, "backup", True, "Sauvegarde nocturne terminée, tout est OK.", {"snapshots": 7, "dumpBytes": 1000, "garageOk": True, "snapshotAt": "2026-10-27T04:20:00Z", "evil": "x"})
ok(r.status_code == 200 and r.json()["ok"], "rapport de sauvegarde accepté")
r = report(TOKEN, "restore_test", True, "Test réussi.", {"restoreTalks": 12, "prodTalks": 12, "repoBytes": 5000000})
ok(r.status_code == 200, "rapport de test de restauration accepté")
requests.post(B + "/admin/health/check", headers=A)
b = bk()
ok(b["level"] == "ok" and b["reasons"] == [], "tout à jour : ok")
cur.execute("select details from backup_reports where kind = 'backup' order by id desc limit 1"); d = cur.fetchone()[0]
ok(d.get("snapshots") == 7 and "evil" not in d, "détails filtrés avant enregistrement")
ok(b["last"]["backup"]["details"]["garageOk"] is True and len(b["history"]) == 2, "dernier rapport et historique renvoyés à l'écran")

# 5) Échec rapporté → critique + e-mail (aussitôt, sans attendre la mesure suivante)
cur.execute("delete from email_outbox where kind = 'health_alert'")
report(TOKEN, "backup", False, "majlisstv : pg_dump a échoué")
import time; time.sleep(1.5)
requests.post(B + "/admin/health/check", headers=A)
b = bk()
ok(b["level"] == "crit" and "pg_dump" in b["reasons"][0], "échec de sauvegarde : critique avec le motif")
ok(requests.get(B + "/admin/health", headers=A).json()["level"] == "crit", "niveau global du serveur : critique")
rows = alerts(); ok(len(rows) >= 1 and "pg_dump" in (rows[0][2] or ""), "e-mail d'alerte avec le motif")
n = len(alerts()); requests.post(B + "/admin/health/check", headers=A)
ok(len(alerts()) == n, "mesure suivante : pas de doublon")

# 6) Retour à la normale
report(TOKEN, "backup", True, "ok", {"garageOk": True})
requests.post(B + "/admin/health/check", headers=A)
ok(bk()["level"] == "ok", "nouvelle sauvegarde réussie : ok")
ok(any("retour à la normale" in (r[1] or "") for r in alerts()), "e-mail « retour à la normale »")

# 7) Silence : dernier rapport trop ancien → critique
cur.execute("update backup_reports set at = now() - interval '40 hours' where kind = 'backup'")
requests.post(B + "/admin/health/check", headers=A)
b = bk(); ok(b["level"] == "crit" and "Aucune sauvegarde reçue depuis" in b["reasons"][0], "silence de 40 h : critique")
setting(A, backup_max_age_hours="72")
ok(bk()["level"] == "ok", "seuil de silence réglable (72 h)")
setting(A, backup_max_age_hours="30")
cur.execute("update backup_reports set at = now() where kind = 'backup'")

# 8) Test de restauration trop ancien → attention
cur.execute("update backup_reports set at = now() - interval '12 days' where kind = 'restore_test'")
b = bk(); ok(b["level"] == "warn" and "restauration" in b["reasons"][0], "test de restauration de 12 jours : attention")
cur.execute("update backup_reports set at = now() where kind = 'restore_test'")

# 9) Vidéos non sauvegardées → attention
report(TOKEN, "backup", True, "ok", {"garageOk": False})
ok(bk()["level"] == "warn", "garageOk=false : attention")

# 10) Rétention : 200 rapports par type
for i in range(205):
    cur.execute("insert into backup_reports(kind, ok, summary) values ('backup', true, %s)", (f"x{i}",))
report(TOKEN, "backup", True, "ok", {"garageOk": True})
cur.execute("select count(*) from backup_reports where kind = 'backup'"); ok(cur.fetchone()[0] == 200, "200 rapports gardés par type")

# 11) Réglages bornés
ok(requests.put(B + "/admin/settings", headers=A, json={"values": {"backup_max_age_hours": "2"}}).status_code == 400, "délai hors limites refusé")

# 12) Le jeton n'est jamais renvoyé en clair
r = requests.get(B + "/admin/settings", headers=A)
ok(TOKEN not in r.text, "jeton absent de la liste des réglages")
setting(A, backup_report_token="")
cur.execute("delete from backup_reports"); cur.execute("delete from health_alerts"); cur.execute("delete from email_outbox where kind = 'health_alert'")
print("\nTout est OK")
