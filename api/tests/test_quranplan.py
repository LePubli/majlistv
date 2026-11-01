"""45E : lecture du Coran en 30 jours — juz publics, programme du membre (début, juz du jour, cases, rappel, recommencer, arrêter), droits, fonction coupée.
Démarre sa propre copie de l'API (port 3071) avec une date simulée : PLAN_NOW = 6 novembre 2026, 10 h UTC.
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3071
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "PLAN_NOW": "2026-11-06T10:00:00Z",
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
cur.execute("delete from app_settings where key in ('feat_quranplan', 'feat_quran')")


P = B + "/quran/plan"
# Juz publics
j = requests.get(B + "/quran/juzs").json()
ok(len(j) == 30 and j[0]["start"] == {"sura": 1, "aya": 1, "name": "Al-Fatiha", "ar": "الفاتحة"} and j[29]["end"]["sura"] == 114, "les 30 juz (début, fin, noms)")
# Droits
ok(requests.get(P).status_code == 401 and requests.post(P + "/start", json={}).status_code == 401, "programme : connexion obligatoire")
ok(requests.get(P, headers=USR).json() == {"plan": None}, "pas encore de programme")
ok(requests.put(P + "/juz/1", headers=USR, json={"read": True}).status_code == 404, "cocher sans programme : refusé")
# Début aujourd'hui (6 nov., Paris) : gratuit, pas besoin de la formule Apprentissage
p = requests.post(P + "/start", headers=USR, json={}).json()["plan"]
ok(p["startedOn"] == "2026-11-06" and p["day"] == 1 and p["todayJuz"] == 1 and p["reads"] == [] and p["completed"] == 0, "début aujourd'hui : jour 1, juz 1 (membre sans formule Apprentissage)")
# Début dans le passé
p = requests.post(P + "/start", headers=USR, json={"startedOn": "2026-11-01"}).json()["plan"]
ok(p["day"] == 6 and p["todayJuz"] == 6, "commencé le 1er : jour 6, juz 6")
for bad in ("2026-09-01", "2027-06-01", "06/11/2026"):
    ok(requests.post(P + "/start", headers=USR, json={"startedOn": bad}).status_code == 400, f"date de début refusée : {bad}")
# Cases
ok(requests.put(P + "/juz/31", headers=USR, json={"read": True}).status_code == 400 and requests.put(P + "/juz/0", headers=USR, json={"read": True}).status_code == 400, "juz hors 1 à 30 refusé")
for n in (1, 2, 6):
    p = requests.put(f"{P}/juz/{n}", headers=USR, json={"read": True}).json()["plan"]
ok(p["reads"] == [1, 2, 6], "juz cochés (même en avance ou en retard)")
p = requests.put(P + "/juz/2", headers=USR, json={"read": False}).json()["plan"]; ok(p["reads"] == [1, 6], "juz décoché")
ok(requests.put(P + "/juz/6", headers=USR, json={"read": True}).status_code == 200 and requests.get(P, headers=USR).json()["plan"]["reads"] == [1, 6], "cocher deux fois : sans doublon")
# Rappel
ok(requests.put(P + "/prefs", headers=USR, json={"remindHour": 25}).status_code == 400, "heure invalide refusée")
ok(requests.put(P + "/prefs", headers=USR, json={"remindHour": 7}).json()["plan"]["remindHour"] == 7, "rappel à 7 h")
ok(requests.put(P + "/prefs", headers=USR, json={"remindHour": None}).json()["plan"]["remindHour"] is None, "rappel coupé")
# Lecture complète puis recommencer : comptée
for n in range(1, 31):
    requests.put(f"{P}/juz/{n}", headers=USR, json={"read": True})
p = requests.get(P, headers=USR).json()["plan"]; ok(p["finished"] is True and len(p["reads"]) == 30, "30 juz lus : lecture terminée")
p = requests.post(P + "/start", headers=USR, json={}).json()["plan"]; ok(p["completed"] == 1 and p["reads"] == [] and p["day"] == 1, "recommencer : 1 lecture complète comptée, cases remises à zéro")
requests.put(P + "/juz/1", headers=USR, json={"read": True})
p = requests.post(P + "/start", headers=USR, json={}).json()["plan"]; ok(p["completed"] == 1, "recommencer sans avoir fini : pas comptée")
# Chacun son programme
ok(requests.get(P, headers=LRN).json()["plan"] is None, "les programmes sont personnels")
# Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quranplan": "false"}})
ok(requests.get(P, headers=USR).status_code in (403, 404) and requests.get(B + "/quran/juzs").status_code in (403, 404), "fonction coupée : indisponible")
ok(requests.get(B + "/quran/suras").status_code == 200, "le lecteur du Coran reste disponible")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quranplan": None}})
# Arrêter
ok(requests.delete(P, headers=USR).json() == {"plan": None} and requests.get(P, headers=USR).json() == {"plan": None}, "programme arrêté")
cur.execute("select count(*) from quran_plan_reads where user_id=%s", (uid,)); ok(cur.fetchone()[0] == 0, "cases supprimées avec le programme")
cur.execute("delete from users where id in (%s,%s)", (uid, lid))
stop(); print("quran plan OK")
