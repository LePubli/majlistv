"""45 : pages de saison (Ramadan, Hajj, Mawlid, Achoura) — API publique et admin, réglages, droits, décalage de date, fonction coupée.
Démarre sa propre copie de l'API (port 3067) avec une date simulée : SEASONS_NOW = 2026-03-19 (dernier jour du Ramadan 1447).
Prérequis : PG de test (5544)."""
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
cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"se-{uuid.uuid4().hex[:8]}@test.local",)); uid = cur.fetchone()[0]
USR = token(uid)
tag = uuid.uuid4().hex[:6]
cur.execute("update season_pages set enabled=false, collection_id=null, lead_days=null, notify=true, last_notified_year=null, title_fr='',title_en='',title_ar='',text_fr='',text_en='',text_ar=''")
cur.execute("delete from app_settings where key in ('feat_seasons','hijri_offset_days')")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_seasons": None, "hijri_offset_days": None}})

# Rien d'activé : pas de saison
r = requests.get(B + "/seasons/current"); ok(r.status_code == 200 and r.json()["season"] is None, "aucune saison activée : rien à montrer")

# Droits
ok(requests.get(B + "/admin/seasons").status_code == 401, "admin/seasons : refusé sans connexion")
ok(requests.get(B + "/admin/seasons", headers=USR).status_code == 403, "admin/seasons : refusé à un membre")
body = lambda **k: {**{"enabled": True, "collectionId": None, "leadDays": None, "title": {"fr": "", "en": "", "ar": ""}, "text": {"fr": "", "en": "", "ar": ""}, "notify": True}, **k}
ok(requests.put(B + "/admin/seasons/ramadan", headers=USR, json=body()).status_code == 403, "modification refusée à un membre")

# Vue admin
r = requests.get(B + "/admin/seasons", headers=ADM); j = r.json()
ok(r.status_code == 200 and [s["id"] for s in j["seasons"]] == ["ramadan", "hajj", "mawlid", "ashura"], "admin : les 4 saisons")
ok(j["today"]["hijri"]["year"] == 1447 and j["today"]["hijri"]["month"] == 9 and j["today"]["hijri"]["day"] == 30, "date hégirienne du jour : 30 Ramadan 1447")
ram = j["seasons"][0]
ok(ram["state"]["endsOn"] == "2026-03-19" and ram["state"]["startsOn"] == "2026-02-18" and ram["state"]["hijriYear"] == 1447, "dates du Ramadan 2026 calculées (18/02 → 19/03)")

# Activation sans collection
r = requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body()); ok(r.status_code == 200, "Ramadan activé")
s = requests.get(B + "/seasons/current?lang=fr").json()["season"]
ok(s and s["id"] == "ramadan" and s["title"].startswith("Ramadan") and s["daysLeft"] == 0 and s["collection"] is None and s["talks"] == [], "dernier jour : bandeau Ramadan, sans rangée")
ar = requests.get(B + "/seasons/current?lang=ar").json()["season"]; en = requests.get(B + "/seasons/current?lang=en").json()["season"]
ok(ar["title"] != s["title"] and en["title"] != s["title"] and any("؀" <= c <= "ۿ" for c in ar["title"]), "textes par défaut en français, anglais et arabe")

# Collection avec conférences : rangée
cur.execute("insert into collections(title, published, kind, created_by) values (%s, true, 'theme', %s) returning id", (f"Ramadan {tag}", aid)); cid = str(cur.fetchone()[0])
cur.execute("insert into collections(title, published, kind, created_by) values (%s, false, 'theme', %s) returning id", (f"Brouillon {tag}", aid)); cdraft = str(cur.fetchone()[0])
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','Cheikh','youtube','abc',%s,'published','ready','free',600) returning id", (f"Talk saison {tag}", aid)); tid = str(cur.fetchone()[0])
cur.execute("insert into collection_items(collection_id, talk_id, position) values (%s,%s,0)", (cid, tid))
r = requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body(collectionId=cid, title={"fr": "Ramadan chez nous", "en": "", "ar": ""})); ok(r.status_code == 200, "collection liée")
s = requests.get(B + "/seasons/current?lang=fr").json()["season"]
ok(s["title"] == "Ramadan chez nous" and s["collection"]["id"] == cid and [t["id"] for t in s["talks"]] == [tid], "titre saisi + rangée de la collection")
en = requests.get(B + "/seasons/current?lang=en").json()["season"]; ok(en["title"] != "Ramadan chez nous", "titre saisi seulement pour le français")
requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body(collectionId=cdraft))
s = requests.get(B + "/seasons/current?lang=fr").json()["season"]; ok(s["collection"] is None and s["talks"] == [], "collection non publiée : pas de rangée")
ok(requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body(collectionId=str(uuid.uuid4()))).status_code == 400, "collection inconnue refusée")
ok(requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body(leadDays=99)).status_code == 400, "jours d'avance > 60 refusés")
ok(requests.put(B + "/admin/seasons/inconnue", headers=ADM, json=body()).status_code == 400, "saison inconnue refusée")

# Jours d'avance : Hajj commence le 2026-05-18 ; aujourd'hui 2026-03-19
requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body(enabled=False))
requests.put(B + "/admin/seasons/hajj", headers=ADM, json=body(leadDays=60))
s = requests.get(B + "/seasons/current").json()["season"]; ok(s and s["id"] == "hajj" and s["daysToStart"] == 60, "60 jours d'avance : annonce du Hajj")
requests.put(B + "/admin/seasons/hajj", headers=ADM, json=body(leadDays=7))
ok(requests.get(B + "/seasons/current").json()["season"] is None, "7 jours d'avance : trop tôt, rien")
requests.put(B + "/admin/seasons/hajj", headers=ADM, json=body(enabled=False))

# Fonction coupée
requests.put(B + "/admin/seasons/ramadan", headers=ADM, json=body())
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_seasons": "false"}})
ok(requests.get(B + "/seasons/current").status_code in (403, 404) or requests.get(B + "/seasons/current").json().get("season") is None, "fonction coupée : plus de saison")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_seasons": "true"}})

# Décalage de date : -1 jour → le Ramadan se finit « demain » ; +1 → fini
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"hijri_offset_days": "1"}})
ok(requests.get(B + "/seasons/current").json()["season"] is None, "décalage +1 : le Ramadan est terminé, plus de bandeau")
j = requests.get(B + "/admin/seasons", headers=ADM).json(); ok(j["offset"] == 1 and j["today"]["hijri"]["month"] == 10, "décalage +1 : on est le 1er Chawwal (Aïd)")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"hijri_offset_days": "9"}})
j = requests.get(B + "/admin/seasons", headers=ADM).json(); ok(j["offset"] in (1, 2), "décalage hors limites refusé ou borné")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"hijri_offset_days": None}})

# Test d'envoi : renvoie un nombre (0 si aucun canal de notification configuré)
r = requests.post(B + "/admin/seasons/ramadan/test-push", headers=ADM); ok(r.status_code == 200 and isinstance(r.json()["sent"], int), "test d'envoi : répond")
ok(requests.post(B + "/admin/seasons/ramadan/test-push", headers=USR).status_code == 403, "test d'envoi refusé à un membre")

# Nettoyage
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_seasons": None, "hijri_offset_days": None}})
cur.execute("update season_pages set enabled=false, collection_id=null, lead_days=null, notify=true, title_fr='',title_en='',title_ar='',text_fr='',text_en='',text_ar=''")
cur.execute("delete from collections where id in (%s,%s)", (cid, cdraft)); cur.execute("delete from talks where id=%s", (tid,)); cur.execute("delete from users where id=%s", (uid,))
stop(); print("seasons OK")
