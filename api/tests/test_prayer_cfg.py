"""Amélioration 4.3 : /config → prayer.hijriOffset (décalage de la date hégirienne repris des Saisons, borné à ±2) et feuille Prière ouverte à tous. Données FICTIVES.
Démarre sa propre copie de l'API (port 3071). Prérequis : PG de test (5544, ou PGTEST_PORT)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3067
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "SEASONS_NOW": "2026-03-19T12:00:00Z",
})
db = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGTEST_PORT", 5544)), dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
LOG = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
proc = subprocess.Popen(["node", "src/index.js"], cwd=API_DIR, env=ENV, stdout=LOG, stderr=subprocess.STDOUT)


def stop():
    proc.terminate()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        stop(); sys.exit(1)


for _ in range(60):
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


cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ADM = token(aid, "admin")
cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"se-{uuid.uuid4().hex[:8]}@test.local",)); uid = cur.fetchone()[0]
USR = token(uid)
tag = uuid.uuid4().hex[:6]
cur.execute("update season_pages set enabled=false, collection_id=null, lead_days=null, notify=true, last_notified_year=null, title_fr='',title_en='',title_ar='',text_fr='',text_en='',text_ar='', theme=false")
cur.execute("delete from app_settings where key in ('feat_seasons','hijri_offset_days')")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_seasons": None, "hijri_offset_days": None}})


def prayer_cfg():
    return requests.get(B + "/config", timeout=10).json().get("prayer")


def setv(**kv):
    r = requests.put(B + "/admin/settings", headers=ADM, json={"values": kv}); return r

cur.execute("delete from app_settings where key in ('feat_prayer','hijri_offset_days')")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_prayer": None, "hijri_offset_days": None}})
p = prayer_cfg()
ok(p is not None and "hijriOffset" in p, "la configuration publique de la Prière contient hijriOffset")
ok(p["hijriOffset"] == 0, "décalage par défaut : 0")
for v in (1, 2, -1, -2):
    ok(setv(hijri_offset_days=str(v)).status_code == 200 and prayer_cfg()["hijriOffset"] == v, f"décalage {v} repris par /config")
r = setv(hijri_offset_days="5")
ok(r.status_code in (200, 400) and prayer_cfg()["hijriOffset"] in (0, 1, 2, -1, -2) and abs(prayer_cfg()["hijriOffset"]) <= 2, "valeur hors limites : jamais au-delà de ±2 dans /config")
setv(hijri_offset_days=None)
ok(prayer_cfg()["hijriOffset"] == 0, "retour au décalage par défaut")
# Fonction Prière coupée : plus de bloc « prayer »
setv(feat_prayer="false"); ok(prayer_cfg() is None, "fonction coupée : pas de configuration Prière")
setv(feat_prayer="true"); ok(prayer_cfg() is not None, "fonction réactivée")
# Les autres réglages de la Prière sont toujours là
p = prayer_cfg(); ok(all(k in p for k in ("method", "asr", "blockMinutes", "maxBlockMinutes", "city", "pill", "defaultEnabled")), "réglages d'origine conservés")
print("TOUT EST OK"); stop()
