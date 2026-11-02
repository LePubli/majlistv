"""Étape B2 : écran « Par quoi commencer ? » — champ `onboarded` de /auth/me, PUT /me/onboarding (vu / à revoir),
comptes existants marqués « vus » par la migration 090, fonction « onboarding » coupée.
Démarre sa propre copie de l'API (port 3075). Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3075
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
cur.execute("delete from app_settings where key = 'feat_onboarding'")
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


cur.execute("select id from users where email='admin@test.local'"); ADM = token(cur.fetchone()[0], "admin")
cur.execute("select name from schema_migrations where name = '090_onboarding.sql'"); ok(cur.fetchone() is not None, "migration 090 appliquée")
cur.execute("select count(*) from users u where onboarded_at is null and created_at < (select applied_at from schema_migrations where name = '090_onboarding.sql')")
ok(cur.fetchone()[0] == 0, "comptes existants au déploiement : marqués « vus » (pas d'écran de démarrage)")

# Nouveau compte par l'inscription réelle
email = f"ob-{uuid.uuid4().hex[:8]}@test.local"
r = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test-123", "name": "Nouveau"})
ok(r.status_code in (200, 201), f"inscription ({r.status_code})"); H = {"authorization": "Bearer " + r.json()["token"]}
me = requests.get(B + "/auth/me", headers=H).json(); ok(me.get("onboarded") is False, "nouveau compte : onboarded = false (écran affiché)")
ok(requests.put(B + "/me/onboarding", json={"done": True}).status_code == 401, "connexion obligatoire")
ok(requests.put(B + "/me/onboarding", headers=H, json={}).status_code == 400, "corps invalide refusé")
ok(requests.put(B + "/me/onboarding", headers=H, json={"done": True}).json() == {"onboarded": True}, "marqué vu")
ok(requests.get(B + "/auth/me", headers=H).json()["onboarded"] is True, "/auth/me : onboarded = true")
cur.execute("select onboarded_at from users where email = %s", (email,)); t1 = cur.fetchone()[0]
requests.put(B + "/me/onboarding", headers=H, json={"done": True}); cur.execute("select onboarded_at from users where email = %s", (email,))
ok(cur.fetchone()[0] == t1, "marqué vu deux fois : date d'origine conservée")
ok(requests.put(B + "/me/onboarding", headers=H, json={"done": False}).json() == {"onboarded": False} and requests.get(B + "/auth/me", headers=H).json()["onboarded"] is False, "à revoir (done = false)")

# Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_onboarding": "false"}})
ok(requests.put(B + "/me/onboarding", headers=H, json={"done": True}).status_code in (403, 404), "fonction coupée : route fermée")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_onboarding": None}})
ok(requests.put(B + "/me/onboarding", headers=H, json={"done": True}).status_code == 200, "fonction réactivée")

cur.execute("delete from users where email = %s", (email,))
stop(); print("onboarding OK")
