"""39 : suivi des erreurs — réception des erreurs du navigateur, regroupement, masquage, erreurs serveur, états, alertes, droits.
Prérequis : API de test (3055), PG de test (5544), SMTP factice (tests/smtp_sink.py 2525)."""
import sys, uuid, time, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def setting(A, **kv):
    r = requests.put(B + "/admin/settings", headers=A, json={"values": kv}); ok(r.status_code == 200, f"réglage {list(kv)}")


def mails():
    # Un message par destinataire (tous les administrateurs) : on compte les alertes distinctes.
    cur.execute("select vars->>'title' as t from email_outbox where kind='health_alert' and (vars->>'title' like 'Nouvelle erreur%' or vars->>'title' like 'Erreur revenue%') group by 1 order by min(id)")
    return [r[0] for r in cur.fetchall()]


def web(msg, path="/talks/abc", stack=""):
    return requests.post(B + "/errors/client", json={"message": msg, "path": path, "stack": stack})


def groups(A, **q):
    return requests.get(B + "/admin/errors", headers=A, params=q).json()


A = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
cur.execute("delete from error_groups"); cur.execute("delete from email_outbox where kind='health_alert'")
setting(A, errors_alerts_enabled="true", smtp_host="127.0.0.1", smtp_port="2525", smtp_security="none", mail_from="Test <noreply@test.local>", health_alert_to="")

# 1) Droits
ok(requests.get(B + "/admin/errors").status_code == 401, "liste sans compte : 401")
em = f"org-err-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": em, "password": "OrgPassw0rd-test", "name": "Org"})
cur.execute("update users set role='organizer' where email=%s", (em,))
O = login(em, "OrgPassw0rd-test")
for m, p in (("get", "/admin/errors"), ("get", "/admin/errors/0123456789abcdef"), ("put", "/admin/errors/0123456789abcdef"), ("post", "/admin/errors/test")):
    ok(getattr(requests, m)(B + p, headers=O).status_code == 403, f"organisateur : 403 sur {m.upper()} {p}")

# 2) Erreur du navigateur : enregistrement et regroupement
ok(web(f"TypeError: x{tag} is undefined 12", "/talks/11111111-2222-4333-8444-555555555555?x=1", "at app.js:1").status_code == 204, "erreur du navigateur reçue : 204")
g = groups(A)
ok(len(g["items"]) == 1 and g["items"][0]["source"] == "web" and g["items"][0]["count"] == 1 and g["items"][0]["route"] == "/talks/:id", "un groupe créé, route normalisée")
ok(web(f"TypeError: x{tag} is undefined 99", "/talks/99999999-2222-4333-8444-555555555555").status_code == 204, "même erreur, autre conférence")
g = groups(A); ok(len(g["items"]) == 1 and g["items"][0]["count"] == 2, "regroupée : un seul groupe, 2 occurrences")
ok(g["counts"]["open"] == 1 and g["last24h"] >= 2, "compteurs : 1 ouverte, occurrences des dernières 24 h")
ok(len(mails()) == 1 and mails()[0].startswith("Nouvelle erreur sur le site"), "un seul e-mail pour la nouvelle erreur (pas pour la répétition)")

# 3) Bruit et masquage
n = len(groups(A)["items"])
ok(web("ResizeObserver loop limit exceeded").status_code == 204 and web("Script error.").status_code == 204 and web("").status_code == 204, "bruit du navigateur : accepté mais ignoré")
ok(len(groups(A)["items"]) == n, "bruit non enregistré")
web(f"Échec pour jean{tag}@exemple.fr avec Bearer abcdef0123456789abcdef", "/compte?token=SECRET", "at https://s/x.js?key=SECRET:1")
d = groups(A)["items"]; secret = [x for x in d if "Échec pour" in x["message"]][0]
det = requests.get(f"{B}/admin/errors/{secret['fingerprint']}", headers=A).json()
raw = str(det) + str(secret)
ok("exemple.fr" not in raw and "abcdef0123456789" not in raw and "SECRET" not in raw, "e-mails, jetons et paramètres d'adresse masqués")
ok(det["events"] and "SECRET" not in str(det["events"]), "occurrences sans donnée personnelle")
cur.execute("select count(*) from information_schema.columns where table_name in ('error_groups','error_events') and column_name in ('user_id','ip','email')")
ok(cur.fetchone()[0] == 0, "aucune colonne d'identifiant de membre ni d'adresse IP")

# 4) Erreur serveur réelle (passe par le gestionnaire d'erreurs)
before = len(mails())
r = requests.post(B + "/admin/errors/test", headers=A)
ok(r.status_code == 500 and r.json()["error"] == "Erreur serveur", "erreur d'essai : 500 sans détail renvoyé au client")
time.sleep(1.5)
api = [x for x in groups(A, source="api")["items"] if x["route"] == "/admin/errors/test"]
ok(len(api) == 1 and api[0]["source"] == "api" and api[0]["method"] == "POST" and api[0]["httpStatus"] == 500, "erreur serveur enregistrée (route, méthode, statut)")
ok(len(mails()) == before + 1 and mails()[-1].startswith("Nouvelle erreur sur le serveur"), "e-mail d'alerte serveur")
fp = api[0]["fingerprint"]
det = requests.get(f"{B}/admin/errors/{fp}", headers=A).json()
ok("Erreur d'essai" in det["message"] and "errors.js" in det["stack"] or "routes" in det["stack"], "trace complète disponible dans le détail")

# 5) Refus 4xx : jamais enregistrés
cnt = sum(x["count"] for x in groups(A, state="all")["items"])
requests.get(f"{B}/talks/{uuid.uuid4()}"); requests.post(B + "/auth/login", json={"email": "x@y.z", "password": "mauvais"}); requests.put(B + "/admin/errors/zzz", headers=A, json={"state": "open"})
time.sleep(1)
ok(sum(x["count"] for x in groups(A, state="all")["items"]) == cnt, "erreurs 400, 401, 404 : non enregistrées")

# 6) États : résolue → revient → alerte « revenue » ; ignorée → silence
ok(requests.put(f"{B}/admin/errors/{fp}", headers=A, json={"state": "resolved"}).json()["state"] == "resolved", "marquée résolue")
ok(fp not in [x["fingerprint"] for x in groups(A)["items"]] and fp in [x["fingerprint"] for x in groups(A, state="resolved")["items"]], "sort de « ouvertes », entre dans « résolues »")
b = len(mails()); requests.post(B + "/admin/errors/test", headers=A); time.sleep(1.5)
g = [x for x in groups(A)["items"] if x["fingerprint"] == fp]
ok(len(g) == 1 and g[0]["state"] == "open" and g[0]["count"] == 2, "erreur résolue qui revient : rouverte")
ok(len(mails()) == b + 1 and mails()[-1].startswith("Erreur revenue sur le serveur"), "e-mail « erreur revenue »")
requests.put(f"{B}/admin/errors/{fp}", headers=A, json={"state": "ignored"})
b = len(mails()); requests.post(B + "/admin/errors/test", headers=A); time.sleep(1.5)
g = [x for x in groups(A, state="ignored")["items"] if x["fingerprint"] == fp]
ok(len(g) == 1 and g[0]["count"] == 3 and len(mails()) == b, "erreur ignorée : comptée, reste ignorée, aucun e-mail")
ok(requests.put(f"{B}/admin/errors/{fp}", headers=A, json={"state": "bof"}).status_code == 400, "état invalide : 400")
ok(requests.put(f"{B}/admin/errors/{'0' * 16}", headers=A, json={"state": "open"}).status_code == 404, "erreur inconnue : 404")
ok(requests.get(f"{B}/admin/errors/zzz", headers=A).status_code == 400, "empreinte invalide : 400")

# 7) Alertes coupées
setting(A, errors_alerts_enabled="false")
b = len(mails()); web(f"Nouvelle erreur sans alerte {tag}"); time.sleep(0.5)
ok(len(mails()) == b and len(groups(A)["items"]) >= 1, "alertes coupées : erreur enregistrée, aucun e-mail")
setting(A, errors_alerts_enabled="true")

# 8) Filtres et limites de l'entrée publique
ok(all(x["source"] == "web" for x in groups(A, source="web", state="all")["items"]), "filtre par source")
ok(requests.post(B + "/errors/client", json={"message": "x" * 5000}).status_code == 400, "message démesuré : 400")
codes = [web(f"Avalanche {tag} {i} a", f"/p{i}").status_code for i in range(30)]
ok(429 in codes, "entrée publique limitée (429 au-delà de 20 par minute)")
cur.execute("delete from error_groups"); cur.execute("delete from email_outbox where kind='health_alert'")
print("\nTout est OK")
