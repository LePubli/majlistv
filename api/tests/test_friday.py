"""45C : vendredi — API publique et admin, réglages, textes par langue, Al-Kahf, collection, droits, fonction coupée.
Démarre sa propre copie de l'API (port 3069) avec une date simulée : FRIDAY_NOW = vendredi 6 novembre 2026, 10 h UTC.
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3069
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "FRIDAY_NOW": "2026-11-06T10:00:00Z",
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
cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"fr-{uuid.uuid4().hex[:8]}@test.local",)); uid = cur.fetchone()[0]
USR = token(uid)
tag = uuid.uuid4().hex[:6]
cur.execute("update friday_page set enabled=false, show_kahf=true, show_ghusl=true, show_salawat=true, ghusl_fr='',ghusl_en='',ghusl_ar='',salawat_fr='',salawat_en='',salawat_ar='',notif_fr='',notif_en='',notif_ar='',collection_id=null,notify=false,notify_hour=8,last_notified_on=null")
cur.execute("delete from app_settings where key = 'feat_friday'")
cur.execute("delete from quran_resources")


BODY = lambda **k: {**{"enabled": True, "showKahf": True, "showGhusl": True, "showSalawat": True, "ghusl": {"fr": "", "en": "", "ar": ""}, "salawat": {"fr": "", "en": "", "ar": ""},
                      "notif": {"fr": "", "en": "", "ar": ""}, "collectionId": None, "notify": False, "notifyHour": 8}, **k}
# Désactivé par défaut : aucune carte, même un vendredi
ok(requests.get(B + "/friday").json() == {"active": False}, "vendredi désactivé : pas de carte")
# Droits
ok(requests.get(B + "/admin/friday").status_code == 401 and requests.get(B + "/admin/friday", headers=USR).status_code == 403, "admin : refusé sans connexion et aux membres")
ok(requests.put(B + "/admin/friday", headers=USR, json=BODY()).status_code == 403, "enregistrement refusé à un membre")
j = requests.get(B + "/admin/friday", headers=ADM).json()
ok(j["enabled"] is False and "isFriday" in j["today"] and j["notifyHour"] == 8, "réglages lus par l'admin (désactivé, heure 8 par défaut)")
ok(j["defaults"]["ghusl"]["fr"] and j["defaults"]["salawat"]["ar"] and j["defaults"]["notif"]["en"], "textes par défaut fournis à l'admin (pour les relire)")
# Validation
for bad, why in [({"notifyHour": 24}, "heure hors limites"), ({"collectionId": "pas-un-uuid"}, "collection invalide"), ({"ghusl": {"fr": "x" * 301, "en": "", "ar": ""}}, "texte trop long")]:
    ok(requests.put(B + "/admin/friday", headers=ADM, json=BODY(**bad)).status_code == 400, f"refusé : {why}")
ok(requests.put(B + "/admin/friday", headers=ADM, json=BODY(collectionId="00000000-0000-4000-8000-000000000000")).status_code == 400, "collection inconnue refusée")
# Activation : textes par défaut dans les 3 langues
ok(requests.put(B + "/admin/friday", headers=ADM, json=BODY()).status_code == 200, "vendredi activé")
for l in ("fr", "en", "ar"):
    j = requests.get(B + "/friday", params={"lang": l}).json()
    ok(j["active"] and j["ghusl"] and j["salawat"] and j["kahf"]["n"] == 18, f"carte du vendredi ({l}) : rappels et Al-Kahf")
ok(requests.get(B + "/friday", params={"lang": "ar"}).json()["kahf"]["name"] == "الكهف" and requests.get(B + "/friday").json()["kahf"]["name"] == "Al-Kahf", "nom de la sourate selon la langue")
ok(requests.get(B + "/friday").json()["kahf"]["ready"] is False, "Al-Kahf : lecteur pas prêt tant que le texte n'est pas importé")
# Lecteur prêt quand la sourate 18 est importée
cur.execute("insert into quran_resources(slug, kind, lang, name, enabled, verse_count) values ('zf-ar','text','ar','Texte fictif',true,1) returning id"); rid = cur.fetchone()[0]
cur.execute("insert into quran_verses(resource_id, sura, aya, text) values (%s,18,1,'نص')", (rid,))
ok(requests.get(B + "/friday").json()["kahf"]["ready"] is True, "Al-Kahf : lecteur prêt une fois la sourate importée")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quran": "false"}})
ok(requests.get(B + "/friday").json()["kahf"]["ready"] is False, "Al-Kahf : pas prêt si la fonction Coran est coupée")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_quran": None}})
# Textes saisis, éléments masqués
ok(requests.put(B + "/admin/friday", headers=ADM, json=BODY(ghusl={"fr": "Mon texte", "en": "", "ar": ""}, showSalawat=False, showKahf=False)).status_code == 200, "textes et éléments enregistrés")
j = requests.get(B + "/friday").json()
ok(j["ghusl"] == "Mon texte" and j["salawat"] is None and j["kahf"] is None, "texte saisi affiché, éléments masqués absents")
ok(requests.get(B + "/friday", params={"lang": "en"}).json()["ghusl"].startswith("Today is Friday"), "langue sans texte saisi : texte par défaut")
# Rangée de conférences
cur.execute("insert into collections(title, published, kind, created_by) values (%s, true, 'theme', %s) returning id", (f"Vendredi {tag}", aid)); cid = str(cur.fetchone()[0])
cur.execute("insert into collections(title, published, kind, created_by) values (%s, false, 'theme', %s) returning id", (f"Brouillon {tag}", aid)); cdraft = str(cur.fetchone()[0])
requests.put(B + "/admin/friday", headers=ADM, json=BODY(collectionId=cid))
j = requests.get(B + "/friday").json()
ok(j["collection"] and j["collection"]["id"] == cid and isinstance(j["talks"], list), "rangée « Conférences du vendredi » : collection publiée")
requests.put(B + "/admin/friday", headers=ADM, json=BODY(collectionId=cdraft))
ok(requests.get(B + "/friday").json()["collection"] is None, "collection non publiée : pas de rangée")
# Notification : test d'envoi et réglages
r = requests.post(B + "/admin/friday/test-push", headers=ADM); ok(r.status_code == 200 and "sent" in r.json(), "envoi d'essai à l'admin")
ok(requests.post(B + "/admin/friday/test-push", headers=USR).status_code == 403, "envoi d'essai refusé à un membre")
requests.put(B + "/admin/friday", headers=ADM, json=BODY(notify=True, notifyHour=9, notif={"fr": "Rappel perso", "en": "", "ar": ""}))
j = requests.get(B + "/admin/friday", headers=ADM).json(); ok(j["notify"] is True and j["notifyHour"] == 9 and j["notif"]["fr"] == "Rappel perso", "notification réglée")
cur.execute("select count(*) from audit_log where summary like 'Vendredi%%'"); ok(cur.fetchone()[0] >= 1, "action consignée dans le journal d'audit")
# Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_friday": "false"}})
ok(requests.get(B + "/friday").status_code in (403, 404), "fonction coupée : la carte répond « indisponible »")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_friday": "true"}})
ok(requests.get(B + "/friday").status_code == 200, "fonction réactivée")

# Nettoyage
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_friday": None}})
cur.execute("update friday_page set enabled=false, collection_id=null, notify=false, ghusl_fr='', notif_fr='', show_kahf=true, show_salawat=true, notify_hour=8")
cur.execute("delete from quran_resources"); cur.execute("delete from collections where id in (%s,%s)", (cid, cdraft)); cur.execute("delete from users where id=%s", (uid,))
stop(); print("friday OK")
