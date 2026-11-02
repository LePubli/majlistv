"""45G : bilan de Ramadan — ouverture (20e jour), chiffres, note personnelle chiffrée, droits.
Données FICTIVES. Démarre sa propre copie de l'API (port 3073) avec une date simulée : RAMADAN_NOW = 12 mars 2026 (23 Ramadan 1447).
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3073
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "RAMADAN_NOW": "2026-03-12T10:00:00Z",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
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
def member(tier=None):
    cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"ak-{uuid.uuid4().hex[:8]}@test.local",)); u = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], u, tier))
    return token(u), u
USR, uid = member(); LRN, lid = member("learning")
cur.execute("delete from ramadan_items"); cur.execute("delete from app_settings where key in ('feat_ramadan', 'hijri_offset_days')")




cur.execute("insert into ramadan_items(day, title_fr, enabled, reviewed_at) values (0, 'Action fictive', true, now()) returning id"); i0 = cur.fetchone()[0]
cur.execute("insert into ramadan_marks(user_id, hyear, day, item_id) values (%s,1447,1,%s),(%s,1447,2,%s)", (uid, i0, uid, i0))
cur.execute("insert into ramadan_tarawih(user_id, hyear, day, rakaat, place) values (%s,1447,1,8,'mosque')", (uid,))
ok(requests.get(B + "/ramadan/bilan").status_code == 401, "bilan : connexion obligatoire")
b = requests.get(B + "/ramadan/bilan", headers=USR).json()["bilan"]
ok(b["hyear"] == 1447 and b["daysPassed"] == 23 and b["actions"] == {"done": 2, "expected": 23, "fullDays": 2}, "bilan au 23e jour : 2 actions sur 23, 2 jours complets")
ok(b["tarawih"] == {"nights": 1, "rakaat": 8, "mosque": 1, "home": 0} and b["note"] == "", "bilan : tarawih, pas encore de note")
ok(requests.put(B + "/ramadan/bilan/note", headers=USR, json={"text": "x" * 4001}).status_code == 400, "note trop longue refusée")
ok(requests.put(B + "/ramadan/bilan/note", headers=USR, json={"text": "Ma note fictive : garder la lecture du matin."}).status_code == 200, "note enregistrée")
cur.execute("select text_enc from ramadan_notes where user_id=%s", (uid,)); enc = cur.fetchone()[0]
ok("Ma note" not in enc, "note chiffrée en base")
ok(requests.get(B + "/ramadan/bilan", headers=USR).json()["bilan"]["note"] == "Ma note fictive : garder la lecture du matin.", "note relue")
ok(requests.get(B + "/ramadan/bilan", headers=LRN).json()["bilan"]["note"] == "" and requests.get(B + "/ramadan/bilan", headers=LRN).json()["bilan"]["actions"]["done"] == 0, "bilan personnel (un autre membre ne voit rien)")
ok(requests.put(B + "/ramadan/bilan/note", headers=USR, json={"text": "  "}).status_code == 200 and requests.get(B + "/ramadan/bilan", headers=USR).json()["bilan"]["note"] == "", "note effacée")
cur.execute("delete from ramadan_items"); cur.execute("delete from users where id in (%s,%s)", (uid, lid))
stop(); print("ramadan bilan OK")
