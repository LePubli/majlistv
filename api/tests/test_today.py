"""Étape B1 : bloc « Aujourd'hui » — GET /me/today : lignes fournies par les modules (plan Coran, athkar, Ramadan, cartes, révision),
état fait / à faire, ordre (à faire d'abord), droits (formule Apprentissage pour athkar/cartes/révision), fonctions coupées.
Données FICTIVES. Démarre sa propre copie de l'API (port 3074) avec des dates simulées :
  23 février 2026 à 10 h UTC (11 h à Paris, 6 Ramadan 1447, matin), puis à 16 h UTC (soir), puis 6 novembre 2026 (hors Ramadan).
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3074
B = f"http://127.0.0.1:{PORT}"
BASE = dict(os.environ)
BASE.update({
    "DATABASE_URL": BASE.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": BASE.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": BASE.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": BASE.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
})
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
LOG = tempfile.NamedTemporaryFile(delete=False, suffix=".log")
proc = None


def start(now):
    global proc
    if proc:
        proc.terminate(); proc.wait()
    try:
        requests.get(B + "/health", timeout=1); print(f"FAIL le port {PORT} est déjà occupé (ancienne API de test ?)"); sys.exit(1)
    except requests.exceptions.ConnectionError:
        pass
    env = dict(BASE); env.update({k: now for k in ("PLAN_NOW", "ATHKAR_NOW", "RAMADAN_NOW", "TODAY_NOW")})
    proc = subprocess.Popen(["node", "src/index.js"], cwd=API_DIR, env=env, stdout=LOG, stderr=subprocess.STDOUT)
    for _ in range(80):
        try:
            if requests.get(B + "/health", timeout=1).status_code == 200:
                return
        except Exception:
            time.sleep(0.5)
    print("FAIL l'API de test ne démarre pas"); print(open(LOG.name).read()[-1500:]); proc.terminate(); sys.exit(1)


def stop():
    if proc:
        proc.terminate()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        stop(); sys.exit(1)


def b64(x):
    return base64.urlsafe_b64encode(x).decode().rstrip("=")


def token(uid, role="user"):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); p = b64(json.dumps({"sub": str(uid), "role": role, "iat": int(time.time())}).encode())
    return {"authorization": "Bearer " + h + "." + p + "." + b64(hmac.new(BASE["JWT_SECRET"].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())}


def member(tier=None):
    cur.execute("insert into users(email, password_hash, name, role) values (%s,'x','M','user') returning id", (f"td-{uuid.uuid4().hex[:8]}@test.local",)); u = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], u, tier))
    return token(u), u


cur.execute("delete from app_settings where key in ('feat_quranplan','feat_quran','feat_athkar','feat_ramadan','feat_memorycards','feat_revision','hijri_offset_days')")
start("2026-02-23T10:00:00Z")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ADM = token(aid, "admin")
USR, uid = member(); LRN, lid = member("learning")
cur.execute("delete from athkar_items"); cur.execute("delete from ramadan_items")
T = lambda h: requests.get(B + "/me/today?lang=fr", headers=h)
kinds = lambda r: [x["kind"] for x in r.json()["items"]]
line = lambda r, k: next((x for x in r.json()["items"] if x["kind"] == k), None)

# Droits et cas vide
ok(requests.get(B + "/me/today").status_code == 401, "connexion obligatoire")
r = T(USR); ok(r.status_code == 200 and r.json()["date"] == "2026-02-23", "réponse avec la date du jour (Paris)")
ok(kinds(r) == ["quranStart"], "membre sans plan ni contenu : seulement l'invitation à commencer le plan Coran")

# Plan Coran : juz du jour à faire puis fait
requests.post(B + "/quran/plan/start", headers=USR, json={"startedOn": "2026-02-21"})
r = T(USR); x = line(r, "quranJuz"); ok(x and x["juz"] == 3 and x["done"] is False and x["href"] == "/coran" and r.json()["left"] == 1, "plan commencé le 21 : juz 3 à lire")
requests.put(B + "/quran/plan/juz/3", headers=USR, json={"read": True})
r = T(USR); ok(line(r, "quranJuz")["done"] is True and r.json()["left"] == 0, "juz 3 coché : ligne faite, plus rien à faire")

# Ramadan (6 Ramadan 1447) : actions du jour + actions de chaque jour
ids = []
for d, n in ((6, "Action du jour 6"), (0, "Action de chaque jour"), (7, "Action du jour 7")):
    ids.append(requests.post(B + "/admin/ramadan/items", headers=ADM, json={"day": d, "title": {"fr": n, "en": "", "ar": ""}, "text": {"fr": "", "en": "", "ar": ""}, "link": "", "reference": "Réf. fictive", "position": 0, "validated": True, "enabled": True}).json()["id"])
requests.post(B + "/admin/ramadan/items", headers=ADM, json={"day": 6, "title": {"fr": "Non validée", "en": "", "ar": ""}, "text": {"fr": "", "en": "", "ar": ""}, "link": "", "reference": "", "position": 0, "validated": False, "enabled": False})
r = T(USR); x = line(r, "ramadan"); ok(x and x["day"] == 6 and x["total"] == 2 and x["n"] == 0 and not x["done"], "Ramadan jour 6 : 2 actions publiées (jour 6 + chaque jour), non validées ignorées")
ok(kinds(r)[0] == "ramadan", "les lignes à faire passent avant les lignes faites")
requests.put(B + "/ramadan/mark", headers=USR, json={"day": 6, "itemId": ids[0], "done": True})
ok(line(T(USR), "ramadan")["n"] == 1, "une action cochée : 1 / 2")
requests.put(B + "/ramadan/mark", headers=USR, json={"day": 6, "itemId": ids[1], "done": True})
ok(line(T(USR), "ramadan")["done"] is True, "les 2 actions cochées : ligne faite")

# Athkar (formule Apprentissage) : matin à 11 h
a1 = requests.post(B + "/admin/athkar", headers=ADM, json={"category": "morning", "textAr": "نص تجريبي للصباح", "reference": "Réf. fictive 1", "target": 2, "position": 0, "validated": True, "enabled": True}).json()["id"]
requests.post(B + "/admin/athkar", headers=ADM, json={"category": "evening", "textAr": "نص تجريبي للمساء", "reference": "Réf. fictive 2", "target": 1, "position": 0, "validated": True, "enabled": True})
ok(line(T(USR), "athkar") is None, "athkar : rien pour un membre sans formule Apprentissage")
x = line(T(LRN), "athkar"); ok(x and x["moment"] == "morning" and x["total"] == 1 and x["n"] == 0 and x["href"] == "/learning?tab=athkar", "athkar du matin à faire (11 h à Paris)")
requests.post(B + f"/athkar/{a1}/tap", headers=LRN, json={"n": 1}); ok(line(T(LRN), "athkar")["done"] is False, "1 répétition sur 2 : pas encore fait")
requests.post(B + f"/athkar/{a1}/tap", headers=LRN, json={"n": 1}); ok(line(T(LRN), "athkar")["done"] is True, "2 répétitions : athkar du matin faits")

# Cartes et révision : rien sans élément dû, ligne quand il y en a (Apprentissage)
ok(line(T(LRN), "cards") is None and line(T(LRN), "revision") is None, "pas de cartes ni de révision dues : pas de ligne")
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language) values ('Conf. fictive B1','d','Cheikh','youtube','abc',%s,'published','ready','free',600,'ready','fr') returning id", (aid,)); tid = cur.fetchone()[0]
cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,evidence_quote,chapter_ms,chapter_title,origin,status) values (%s,'fr','Question ?','[\"A\",\"B\",\"C\"]',1,'Parce que.',0,'passage',0,'Intro','manual','approved') returning id", (tid,)); qid = cur.fetchone()[0]
cur.execute("insert into quiz_attempts(user_id,talk_id,score,total,percent,passed,created_at) values (%s,%s,1,1,100,true,now()-interval '3 days')", (lid, tid))
cur.execute("insert into memory_card_progress(user_id,question_id,stage,due_on,first_on,last_on) values (%s,%s,1,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date-3,(now() at time zone 'Europe/Paris')::date-3)", (lid, qid))
x = line(T(LRN), "cards"); ok(x and x["n"] == 1 and not x["done"] and x["href"] == "/learning?tab=cards", "1 carte due : ligne « Cartes à revoir »")
x = line(T(LRN), "revision"); ok(x and x["n"] == 1 and x["href"] == "/learning?tab=rev", "quiz passé il y a 3 jours : conférence à réviser")
cur.execute("update memory_card_progress set due_on = (now() at time zone 'Europe/Paris')::date + 3, last_on = (now() at time zone 'Europe/Paris')::date where user_id=%s", (lid,))
ok(line(T(LRN), "cards")["done"] is True, "cartes revues aujourd'hui : ligne faite")
ok(line(T(USR), "cards") is None and line(T(USR), "revision") is None, "cartes et révision : rien sans formule Apprentissage")

# Fonctions coupées
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ramadan": "false", "feat_athkar": "false", "feat_quranplan": "false", "feat_memorycards": "false", "feat_revision": "false"}})
ok(T(LRN).json()["items"] == [], "fonctions coupées : plus aucune ligne")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ramadan": None, "feat_athkar": None, "feat_quranplan": None, "feat_memorycards": None, "feat_revision": None}})

# Soir (17 h à Paris) : athkar du soir
start("2026-02-23T16:00:00Z")
x = line(T(LRN), "athkar"); ok(x and x["moment"] == "evening" and x["done"] is False, "à 17 h : athkar du soir")

# Après Ramadan (10 avril 2026, 22 jours après la fin) : ligne « Votre bilan de Ramadan », faite quand la note est écrite (étape B3)
start("2026-04-10T10:00:00Z")
x = line(T(USR), "ramadanBilan"); ok(x and x["year"] == 1447 and x["done"] is False and x["href"] == "/ramadan#rb-t" and line(T(USR), "ramadan") is None, "après Ramadan : « Votre bilan de Ramadan 1447 » à faire")
ok(requests.put(B + "/ramadan/bilan/note", headers=USR, json={"text": "Garder la prière de nuit"}).status_code == 200, "note du bilan écrite")
ok(line(T(USR), "ramadanBilan")["done"] is True, "note écrite : ligne du bilan faite")

# Hors Ramadan (6 novembre 2026) : pas de ligne Ramadan
start("2026-11-06T10:00:00Z")
ok(line(T(USR), "ramadan") is None and line(T(USR), "ramadanBilan") is None, "plus de 60 jours après Ramadan : ni actions ni bilan")
ok(line(T(USR), "quranJuz") is None and line(T(USR), "quranStart") is None, "plan Coran dépassé (au-delà des 30 jours) : pas de ligne")

cur.execute("delete from athkar_items"); cur.execute("delete from ramadan_items"); cur.execute("delete from ramadan_notes where user_id = %s", (uid,))
cur.execute("delete from talks where id = %s", (tid,)); cur.execute("delete from users where id in (%s,%s)", (uid, lid))
stop(); print("today OK")
