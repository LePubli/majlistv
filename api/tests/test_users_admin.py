"""11.2 : utilisateurs — filtres, tri, fiche détaillée, lien de réinitialisation. Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


A = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]


def mk(name, role="user"):
    e = f"{name}-{tag}@test.local"
    r = requests.post(B + "/admin/users", headers=A, json={"email": e, "name": f"Z{name} {tag}", "role": role, "password": "Passw0rd-test"})
    assert r.status_code == 201, r.text
    return r.json()["user"]


def sub(uid, status, cancel=False):
    cur.execute("insert into subscriptions(id,user_id,status,billing_interval,cancel_at_period_end) values(%s,%s,%s,'month',%s)", ("sub_u" + uuid.uuid4().hex[:10], uid, status, cancel))


def lst(**p):
    p.setdefault("q", tag); p.setdefault("limit", 100)
    return requests.get(B + "/admin/users", headers=A, params=p).json()["users"]


pay, tri, off, sus, plain = (mk(n) for n in ("pay", "tri", "off", "sus", "plain"))
sub(pay["id"], "active"); sub(tri["id"], "trialing")
requests.patch(f"{B}/admin/users/{off['id']}", headers=A, json={"premiumUntil": "2099-01-01T00:00:00Z"})
requests.patch(f"{B}/admin/users/{sus['id']}", headers=A, json={"disabled": True})
ids = lambda **p: {u["id"] for u in lst(**p)}

ok(ids(status="paying") == {pay["id"]}, "filtre abonnés payants")
ok(ids(status="trialing") == {tri["id"]}, "filtre essais")
ok(ids(status="offered") == {off["id"]}, "filtre accès offerts")
ok(ids(status="suspended") == {sus["id"]}, "filtre suspendus")
ok(ids(status="none") == {plain["id"], sus["id"]}, "filtre sans abonnement (suspendu inclus)")
ok(requests.get(B + "/admin/users", headers=A, params={"status": "xx"}).status_code == 400, "statut invalide refusé")
names = [u["name"] for u in lst(sort="name")]
ok(names == sorted(names, key=str.lower), "tri par nom")
ok(lst(sort="oldest")[0]["createdAt"] <= lst(sort="oldest")[-1]["createdAt"], "tri ancien → récent")
ok(len(lst(sort="activity")) == 5, "tri activité fonctionne")

c = requests.get(B + "/admin/users-counts", headers=A).json()
ok(all(k in c for k in ("all", "suspended", "paying", "trialing", "offered", "none")), "compteurs de filtres")
ok(c["all"] >= 5 and c["suspended"] >= 1 and c["paying"] >= 1, "compteurs cohérents")
ok(requests.get(B + "/admin/users-counts", headers=login(f"pay-{tag}@test.local", "Passw0rd-test")).status_code == 403, "compteurs réservés aux admins")

# Fiche détaillée
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id) values('Fiche conf','X','youtube','abc',%s) returning id", (pay["id"],)); tid = cur.fetchone()[0]
cur.execute("insert into favorites(user_id,talk_id) values(%s,%s)", (pay["id"], tid))
cur.execute("insert into watch_progress(user_id,talk_id,position_ms,duration_ms,completed) values(%s,%s,1000,2000,true)", (pay["id"], tid))
d = requests.get(f"{B}/admin/users/{pay['id']}", headers=A).json()
ok(d["user"]["email"] == pay["email"] and d["user"]["role"] == "user", "fiche : identité")
ok(d["subscriptions"][0]["status"] == "active", "fiche : abonnement")
ok(d["stats"]["favorites"] == 1 and d["stats"]["watched"] == 1 and d["stats"]["completed"] == 1 and d["stats"]["lastWatchAt"], "fiche : activité")
ok(d["talks"][0]["title"] == "Fiche conf", "fiche : conférences")
ok("emails" in d, "fiche : e-mails")
ok("password_hash" not in str(d), "fiche : aucun hash de mot de passe")
ok(requests.get(f"{B}/admin/users/{uuid.uuid4()}", headers=A).status_code == 404, "fiche : 404 si inconnu")
ok(requests.get(f"{B}/admin/users/xyz", headers=A).status_code == 400, "fiche : id invalide")
ok(requests.get(f"{B}/admin/users/{pay['id']}", headers=login(f"tri-{tag}@test.local", "Passw0rd-test")).status_code == 403, "fiche réservée aux admins")

# Lien de réinitialisation
r = requests.post(f"{B}/admin/users/{plain['id']}/reset-link", headers=A)
ok(r.status_code == 200 and r.json()["email"] == plain["email"], "lien de réinitialisation envoyé")
cur.execute("select count(*) from password_resets where user_id=%s and used_at is null", (plain["id"],)); ok(cur.fetchone()[0] == 1, "jeton créé")
cur.execute("select count(*) from email_outbox where user_id=%s and kind='password_reset'", (plain["id"],)); ok(cur.fetchone()[0] == 1, "e-mail en file d'envoi")
ok(requests.post(f"{B}/admin/users/{sus['id']}/reset-link", headers=A).status_code == 400, "refusé pour un compte suspendu")
ok(requests.post(f"{B}/admin/users/{uuid.uuid4()}/reset-link", headers=A).status_code == 404, "404 si inconnu")
ok(requests.post(f"{B}/admin/users/{plain['id']}/reset-link", headers=login(f"tri-{tag}@test.local", "Passw0rd-test")).status_code == 403, "réservé aux admins")

# Garde-fous existants
me = requests.get(B + "/auth/me", headers=A).json()
mid = me.get("id") or me.get("user", {}).get("id")
ok(requests.patch(f"{B}/admin/users/{mid}", headers=A, json={"disabled": True}).status_code == 400, "impossible de se suspendre")
ok(requests.delete(f"{B}/admin/users/{pay['id']}", headers=A).status_code == 409, "suppression refusée : abonnement actif")
ok(requests.delete(f"{B}/admin/users/{plain['id']}", headers=A).status_code == 204, "suppression d'un compte simple")
print("TOUT OK")
