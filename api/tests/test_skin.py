"""Thème visuel « Nuit et or » : réglages skin_default / skin_choice (Admin → Paramètres → Général) exposés par GET /config.
Démarre sa propre copie de l'API (port 3077). Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3077
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
cur.execute("delete from app_settings where key in ('skin_default','skin_choice')")
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
ok(requests.get(B + "/config").json()["skin"] == {"def": "classique", "choice": False}, "par défaut : thème classique, choisi par l'administrateur seul (pas de choix pour les visiteurs)")
ok(requests.put(B + "/admin/settings", headers=ADM, json={"values": {"skin_default": "violet"}}).status_code == 400, "valeur inconnue refusée")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"skin_default": "nuit"}})
ok(requests.get(B + "/config").json()["skin"] == {"def": "nuit", "choice": False}, "l'administrateur passe tout le site en Nuit et or")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"skin_default": None, "skin_choice": None}})
ok(requests.get(B + "/config").json()["skin"]["def"] == "classique", "retour au réglage d'origine")
stop(); print("skin OK")
