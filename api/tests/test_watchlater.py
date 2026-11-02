"""Amélioration 2.5 : « À regarder plus tard » — ajout, liste (récentes d'abord), identifiants, retrait, conférence terminée qui sort
d'elle-même, conférence invisible refusée, liste pleine, séparation entre membres, fonction coupée.
Données FICTIVES. Démarre sa propre copie de l'API (port 3078). Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3078
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
cur.execute("delete from app_settings where key = 'feat_watchlater'")
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


def member():
    cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"wl-{uuid.uuid4().hex[:8]}@test.local",))
    u = cur.fetchone()[0]; return token(u), u


cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]; ADM = token(aid, "admin")
tag = uuid.uuid4().hex[:6]


def talk(title, pub="published"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','Cheikh','youtube','abc',%s,%s,'ready','free',600) returning id", (f"{title} {tag}", aid, pub))
    return str(cur.fetchone()[0])


A, Bt, C = talk("Plus tard A"), talk("Plus tard B"), talk("Plus tard C")
D = talk("Brouillon", pub="draft")
U, uid = member(); V, vid = member()
P = B + "/me/watchlater"

ok(requests.get(P).status_code == 401 and requests.put(f"{P}/{A}").status_code == 401, "connexion obligatoire")
ok(requests.get(P, headers=U).json() == [], "liste vide au départ")
ok(requests.put(f"{P}/{A}", headers=U).json() == {"saved": True}, "ajout de A")
time.sleep(0.05)
requests.put(f"{P}/{Bt}", headers=U); requests.put(f"{P}/{Bt}", headers=U)
l = requests.get(P, headers=U).json()
ok([x["id"] for x in l] == [Bt, A], "liste : la plus récente d'abord, pas de doublon")
ok(l[0]["title"].startswith("Plus tard B") and "posterUrl" in l[0], "fiches de conférences complètes")
ok(requests.get(P + "/ids", headers=U).json() == [Bt, A], "identifiants (boutons des vignettes)")
ok(requests.put(f"{P}/{D}", headers=U).status_code == 404, "conférence non publiée refusée")
ok(requests.put(f"{P}/not-a-uuid", headers=U).status_code == 400, "identifiant invalide refusé")
ok(requests.get(P, headers=V).json() == [], "un autre membre ne voit rien")
ok(requests.delete(f"{P}/{A}", headers=U).json() == {"saved": False} and [x["id"] for x in requests.get(P, headers=U).json()] == [Bt], "retrait de A")

# Conférence terminée : sort d'elle-même
requests.put(f"{P}/{C}", headers=U)
cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms, completed, updated_at) values (%s,%s,600000,600000,true, now() + interval '1 second')", (uid, C))
ok(C not in requests.get(P + "/ids", headers=U).json(), "conférence regardée jusqu'au bout : sortie de la liste")
cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms, completed, updated_at) values (%s,%s,600000,600000,true, now() - interval '1 day')", (uid, A))
requests.put(f"{P}/{A}", headers=U)
ok(A in requests.get(P + "/ids", headers=U).json(), "conférence déjà vue puis remise « plus tard » : elle reste (revoir)")

# Liste pleine (200)
cur.execute("insert into watch_later(user_id, talk_id) select %s, id from talks where id <> all(%s::uuid[]) and video_status = 'ready' limit 300 on conflict do nothing", (vid, [A]))
cur.execute("select count(*) from watch_later where user_id = %s", (vid,)); n = cur.fetchone()[0]
if n < 200:
    extra = [talk(f"Remplissage {i}") for i in range(200 - n)]
    for x in extra: cur.execute("insert into watch_later(user_id, talk_id) values (%s,%s) on conflict do nothing", (vid, x))
cur.execute("delete from watch_later where user_id = %s and talk_id in (select talk_id from watch_later where user_id = %s offset 200)", (vid, vid))
r = requests.put(f"{P}/{A}", headers=V); ok(r.status_code == 409 and r.json().get("code") == "full", "liste pleine (200) : ajout refusé avec un message")

# Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_watchlater": "false"}})
ok(requests.get(P, headers=U).status_code in (403, 404), "fonction coupée : indisponible")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_watchlater": None}})

cur.execute("delete from users where id in (%s,%s)", (uid, vid)); cur.execute("delete from talks where title like %s", (f"% {tag}",))
stop(); print("watch later OK")
