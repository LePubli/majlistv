"""Étape B5 : validations des enfants en attente — GET /me/kids/pending (petites actions + circuit de Ramadan des enfants),
champ `pending` et `pendingEmail` de /me/kids, PUT /me/kids/pending-prefs, mise à jour après validation, séparation entre parents,
Ramadan coupé, espace Kids coupé. Données FICTIVES. Démarre sa propre copie de l'API (port 3076). Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3076
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
cur.execute("delete from app_settings where key in ('feat_ramadan','kids_enabled','kids_pending_enabled')")
try:
    requests.get(B + "/health", timeout=1); print(f"FAIL le port {PORT} est déjà occupé"); sys.exit(1)
except requests.exceptions.ConnectionError:
    pass
LOG = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
proc = subprocess.Popen(["node", "src/index.js"], cwd=API_DIR, env=ENV, stdout=LOG, stderr=subprocess.STDOUT)


def stop():
    proc.terminate()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        stop(); sys.exit(1)


for _ in range(80):
    try:
        if requests.get(B + "/health", timeout=1).status_code == 200:
            break
    except Exception:
        time.sleep(0.5)
else:
    print("FAIL l'API de test ne démarre pas"); print(open(LOG.name).read()[-1500:]); stop(); sys.exit(1)


def b64(x):
    return base64.urlsafe_b64encode(x).decode().rstrip("=")


def token(uid, role="user"):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); p = b64(json.dumps({"sub": str(uid), "role": role, "iat": int(time.time())}).encode())
    return {"authorization": "Bearer " + h + "." + p + "." + b64(hmac.new(ENV["JWT_SECRET"].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())}


def parent():
    cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','Parent','user') returning id", (f"kp-{uuid.uuid4().hex[:8]}@test.local",)); u = cur.fetchone()[0]
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created) values (%s,%s,'active','p','month',now()+interval '20 days',1)", ("sub_" + uuid.uuid4().hex[:12], u))
    return token(u), u


cur.execute("select id from users where email='admin@test.local'"); ADM = token(cur.fetchone()[0], "admin")
P, pid = parent(); Q, qid = parent()
cur.execute("insert into kid_profiles(user_id, name, band) values (%s,'Amina','7-10') returning id", (pid,)); k1 = cur.fetchone()[0]
cur.execute("insert into kid_profiles(user_id, name, band) values (%s,'Yusuf','3-6') returning id", (pid,)); k2 = cur.fetchone()[0]
cur.execute("insert into kid_profiles(user_id, name, band) values (%s,'Autre','7-10') returning id", (qid,)); k3 = cur.fetchone()[0]

ok(requests.get(B + "/me/kids/pending").status_code == 401, "connexion obligatoire")
ok(requests.get(B + "/me/kids/pending", headers=P).json() == {"total": 0, "profiles": []}, "rien en attente : total 0")

# Petites actions : 2 déclarées faites par Amina, 1 à faire (non comptée), 1 validée (non comptée)
ids = []
for st in ("claimed", "claimed", "todo", "validated"):
    cur.execute("insert into kid_actions(profile_id, title, status, claimed_at) values (%s,%s,%s, case when %s in ('claimed','validated') then now() end) returning id", (k1, f"Action {st}", st, st)); ids.append(cur.fetchone()[0])
cur.execute("insert into kid_actions(profile_id, title, status, claimed_at) values (%s,'Action autre parent','claimed',now())", (k3,))
# Ramadan des enfants : 1 action déclarée par Yusuf
cur.execute("insert into ramadan_items(audience, day, title_fr, enabled, reviewed_at) values ('kid', 0, 'Action fictive enfants', true, now()) returning id"); rid = cur.fetchone()[0]
cur.execute("insert into ramadan_kid_marks(profile_id, hyear, day, item_id, status, claimed_at) values (%s, 1447, 3, %s, 'claimed', now())", (k2, rid))

p = requests.get(B + "/me/kids/pending", headers=P).json()
by = {x["name"]: x for x in p["profiles"]}
ok(p["total"] == 3 and by["Amina"]["actions"] == 2 and by["Amina"]["ramadan"] == 0 and by["Yusuf"]["ramadan"] == 1 and by["Yusuf"]["total"] == 1, "3 en attente : 2 petites actions (Amina) + 1 action de Ramadan (Yusuf)")
ok("Autre" not in by, "les enfants d'un autre parent ne sont jamais comptés")
ok(requests.get(B + "/me/kids/pending", headers=Q).json()["total"] == 1, "l'autre parent voit seulement son enfant")
k = requests.get(B + "/me/kids", headers=P).json(); ok(k["pending"]["total"] == 3 and k["pendingEmail"] is True, "/me/kids : bandeau (pending) et e-mail activé par défaut")

# Préférence e-mail
ok(requests.put(B + "/me/kids/pending-prefs", headers=P, json={}).status_code == 400, "préférence : corps invalide refusé")
ok(requests.put(B + "/me/kids/pending-prefs", headers=P, json={"email": False}).json() == {"email": False} and requests.get(B + "/me/kids", headers=P).json()["pendingEmail"] is False, "e-mail désactivé")
requests.put(B + "/me/kids/pending-prefs", headers=P, json={"email": True})

# Validation par le parent : le compte baisse
r = requests.post(B + f"/me/kids/profiles/{k1}/actions/{ids[0]}/validate", headers=P); ok(r.status_code == 200, "le parent valide une petite action")
ok(requests.get(B + "/me/kids/pending", headers=P).json()["total"] == 2, "après validation : 2 en attente")

# Ramadan coupé : ses actions ne comptent plus
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ramadan": "false"}})
ok(requests.get(B + "/me/kids/pending", headers=P).json()["total"] == 1, "Ramadan coupé : seules les petites actions comptent")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ramadan": None}})

# Espace Kids coupé
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"kids_enabled": "false"}})
ok(requests.get(B + "/me/kids/pending", headers=P).status_code == 404, "espace Kids coupé : indisponible")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"kids_enabled": None}})

cur.execute("delete from ramadan_items where id = %s", (rid,)); cur.execute("delete from users where id in (%s,%s)", (pid, qid))
stop(); print("kids pending OK")
