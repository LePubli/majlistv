"""45D : compteur d'athkar — admin (saisie, validation obligatoire, import), membre (compte du jour, objectif, série, rappel), formule Apprentissage, fonction coupée.
Données FICTIVES (aucun dhikr réel). Démarre sa propre copie de l'API (port 3070) avec une date simulée : ATHKAR_NOW = 6 novembre 2026, 10 h UTC.
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3070
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "ATHKAR_NOW": "2026-11-06T10:00:00Z",
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
cur.execute("delete from athkar_items"); cur.execute("delete from app_settings where key = 'feat_athkar'")

item = lambda **k: {**{"category": "morning", "textAr": "نص تجريبي أول", "translit": "nass tajribi", "trFr": "Texte fictif", "trEn": "Fictitious text", "reference": "Référence fictive n° 1", "target": 3, "position": 0, "validated": False, "enabled": False}, **k}
# Droits admin
ok(requests.get(B + "/admin/athkar").status_code == 401 and requests.get(B + "/admin/athkar", headers=LRN).status_code == 403, "admin : refusé sans connexion et aux membres")
for bad, why in [({"reference": ""}, "référence obligatoire"), ({"category": "autre"}, "catégorie inconnue"), ({"target": 0}, "objectif 0"), ({"textAr": ""}, "texte arabe vide")]:
    ok(requests.post(B + "/admin/athkar", headers=ADM, json=item(**bad)).status_code == 400, f"création refusée : {why}")
ok(requests.post(B + "/admin/athkar", headers=ADM, json=item(enabled=True)).status_code == 400, "affichage refusé tant que le dhikr n'est pas validé")
r = requests.post(B + "/admin/athkar", headers=ADM, json=item()); ok(r.status_code == 200 and r.json()["validated"] is False, "dhikr créé (non validé)"); I1 = r.json()["id"]
# Membre : formule Apprentissage
ok(requests.get(B + "/athkar").status_code == 401, "membre : connexion obligatoire")
r = requests.get(B + "/athkar", headers=USR); ok(r.status_code == 403 and r.json()["code"] == "learning_required", "réservé à la formule Apprentissage")
j = requests.get(B + "/athkar", headers=LRN).json(); ok(j["items"] == [] and j["goal"] == 1 and j["streak"] == 0, "dhikr non validé : invisible ; objectif 1 par défaut")
ok(requests.post(f"{B}/athkar/{I1}/tap", headers=LRN, json={}).status_code == 404, "compter un dhikr non publié : refusé")
# Validation puis affichage
ok(requests.put(f"{B}/admin/athkar/{I1}", headers=ADM, json=item(validated=True, enabled=True)).status_code == 200, "dhikr validé et affiché")
cur.execute("select reviewed_by from athkar_items where id=%s", (I1,)); ok(cur.fetchone()[0] == aid, "validation : l'administrateur est enregistré")
j = requests.get(B + "/athkar", headers=LRN, params={"lang": "en"}).json()
ok(len(j["items"]) == 1 and j["items"][0]["tr"] == "Fictitious text" and j["items"][0]["reference"] == "Référence fictive n° 1" and j["items"][0]["target"] == 3, "membre : dhikr avec traduction (en), référence, objectif")
ok(requests.get(B + "/athkar", headers=LRN, params={"lang": "ar"}).json()["items"][0]["tr"] == "", "arabe : pas de traduction affichée")
# Compteur
ok(requests.post(f"{B}/athkar/{I1}/tap", headers=LRN, json={}).json()["count"] == 1, "toucher : +1")
ok(requests.post(f"{B}/athkar/{I1}/tap", headers=LRN, json={"n": 2}).json()["count"] == 3, "plusieurs touchers groupés : +2")
ok(requests.post(f"{B}/athkar/{I1}/tap", headers=LRN, json={"n": 0}).status_code == 400 and requests.post(f"{B}/athkar/{I1}/tap", headers=LRN, json={"n": 5000}).status_code == 400, "nombre invalide refusé")
ok(requests.post(f"{B}/athkar/{I1}/tap", headers=USR, json={}).status_code == 403, "membre sans Apprentissage : compteur refusé")
j = requests.get(B + "/athkar", headers=LRN).json(); ok(j["items"][0]["count"] == 3 and j["doneToday"] == 1 and j["streak"] == 1 and j["today"] == "2026-11-06", "objectif atteint : série 1 (jour à Paris)")
# série sur plusieurs jours (comptes des jours passés)
cur.execute("insert into athkar_counts(user_id,item_id,day,count) values (%s,%s,'2026-11-05',3),(%s,%s,'2026-11-04',9)", (lid, I1, lid, I1))
ok(requests.get(B + "/athkar", headers=LRN).json()["streak"] == 3, "série de 3 jours")
ok(requests.post(f"{B}/athkar/{I1}/reset", headers=LRN).json()["count"] == 0, "remise à zéro du jour")
j = requests.get(B + "/athkar", headers=LRN).json(); ok(j["doneToday"] == 0 and j["streak"] == 2, "remis à zéro : la série d'hier reste (2)")
# Réglages
ok(requests.put(B + "/athkar/prefs", headers=LRN, json={"goal": 0, "remindHour": 8}).status_code == 400 and requests.put(B + "/athkar/prefs", headers=LRN, json={"goal": 2, "remindHour": 24}).status_code == 400, "réglages invalides refusés")
ok(requests.put(B + "/athkar/prefs", headers=LRN, json={"goal": 2, "remindHour": 7}).status_code == 200, "objectif 2 et rappel à 7 h")
j = requests.get(B + "/athkar", headers=LRN).json(); ok(j["goal"] == 2 and j["remindHour"] == 7 and j["streak"] == 0, "objectif 2 : la série est recalculée")
ok(requests.put(B + "/athkar/prefs", headers=LRN, json={"goal": 1, "remindHour": None}).status_code == 200 and requests.get(B + "/athkar", headers=LRN).json()["remindHour"] is None, "rappel coupé")
# Import en lot : non validé, non affiché
r = requests.post(B + "/admin/athkar/import", headers=ADM, json={"items": [{"category": "evening", "textAr": "نص ثان", "reference": "Référence fictive n° 2", "target": 33}, {"category": "evening", "textAr": "نص", "reference": ""}]})
ok(r.status_code == 200 and r.json()["created"] == 1 and len(r.json()["errors"]) == 1, "import : 1 créé, 1 refusé (sans référence)")
ok(len(requests.get(B + "/athkar", headers=LRN).json()["items"]) == 1, "dhikr importés invisibles tant qu'ils ne sont pas validés")
ok(requests.post(B + "/admin/athkar/import", headers=LRN, json={"items": [{}]}).status_code == 403, "import refusé à un membre")
# Masquer, dé-valider
requests.put(f"{B}/admin/athkar/{I1}", headers=ADM, json=item(validated=False, enabled=False))
ok(requests.get(B + "/athkar", headers=LRN).json()["items"] == [], "dé-validé : retiré des membres")
cur.execute("select count(*) from audit_log where summary like 'Athkar%%'"); ok(cur.fetchone()[0] >= 3, "actions consignées dans le journal d'audit")
# Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_athkar": "false"}})
ok(requests.get(B + "/athkar", headers=LRN).status_code in (403, 404), "fonction coupée : indisponible")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_athkar": None}})
# Suppression : les comptes partent avec le dhikr ; export RGPD
ok(requests.delete(f"{B}/admin/athkar/{I1}", headers=ADM).status_code == 200, "dhikr supprimé")
cur.execute("select count(*) from athkar_counts where item_id=%s", (I1,)); ok(cur.fetchone()[0] == 0, "ses comptes sont supprimés avec lui")
# --- Actions en lot et restauration des dhikr fournis
PROV = sum(len(json.load(open(os.path.join(API_DIR, "content", "athkar", f)))) for f in os.listdir(os.path.join(API_DIR, "content", "athkar")) if f.endswith(".json"))
ok(requests.post(B + "/admin/athkar/restore-provided").status_code == 401 and requests.post(B + "/admin/athkar/restore-provided", headers=LRN).status_code == 403, "restauration : refusée sans connexion et aux membres")
cur.execute("delete from athkar_items")
r = requests.post(B + "/admin/athkar/restore-provided", headers=ADM, json={}); ok(r.status_code == 200 and r.json()["created"] == PROV and PROV >= 74, f"restauration : {PROV} dhikr fournis recréés")
cur.execute("select count(*), count(reviewed_at), count(*) filter (where enabled) from athkar_items"); n, v, e = cur.fetchone(); ok(n == PROV and v == 0 and e == 0, "restaurés non validés et non affichés")
ok(requests.post(B + "/admin/athkar/restore-provided", headers=ADM, json={}).json()["created"] == 0, "restauration répétée : aucun doublon")
cur.execute("delete from athkar_items where id in (select id from athkar_items order by id limit 3)")
ok(requests.post(B + "/admin/athkar/restore-provided", headers=ADM, json={}).json()["created"] == 3, "restauration : seuls les 3 dhikr supprimés reviennent")
cur.execute("select id from athkar_items order by id limit 6"); IDS = [x[0] for x in cur.fetchall()]
BK = lambda **k: requests.post(B + "/admin/athkar/bulk", headers=ADM, json=k)
ok(requests.post(B + "/admin/athkar/bulk", json={"ids": IDS, "action": "validate"}).status_code == 401 and requests.post(B + "/admin/athkar/bulk", headers=LRN, json={"ids": IDS, "action": "validate"}).status_code == 403, "lot : refusé sans connexion et aux membres")
ok(BK(ids=[], action="validate").status_code == 400 and BK(ids=IDS, action="inconnue").status_code == 400 and BK(ids=list(range(1, 2002)), action="delete").status_code == 400, "lot : sélection vide, action inconnue et plus de 2000 éléments refusés")
r = BK(ids=IDS[:3], action="validate"); ok(r.json() == {"done": 3, "skipped": 0}, "lot : 3 dhikr validés")
cur.execute("select count(*) from athkar_items where reviewed_by = %s and id = any(%s)", (aid, IDS[:3])); ok(cur.fetchone()[0] == 3, "lot : l'administrateur est enregistré comme validateur")
r = BK(ids=IDS[:5], action="show"); ok(r.json() == {"done": 3, "skipped": 2}, "lot : afficher ignore les 2 dhikr non validés")
cur.execute("select count(*) from athkar_items where enabled and reviewed_at is null"); ok(cur.fetchone()[0] == 0, "lot : jamais d'affichage sans validation")
ok(len(requests.get(B + "/athkar", headers=LRN).json()["items"]) == 3, "lot : les 3 dhikr validés et affichés sont visibles du membre")
ok(BK(ids=IDS[3:5], action="publish").json()["done"] == 2 and len(requests.get(B + "/athkar", headers=LRN).json()["items"]) == 5, "lot : valider et afficher en une fois")
ok(BK(ids=IDS[:5], action="hide").json()["done"] == 5 and requests.get(B + "/athkar", headers=LRN).json()["items"] == [], "lot : masquer retire les dhikr des membres")
BK(ids=IDS[:5], action="show"); ok(BK(ids=IDS[:2], action="unvalidate").json()["done"] == 2, "lot : dé-valider")
cur.execute("select count(*) from athkar_items where id = any(%s) and (reviewed_at is not null or enabled)", (IDS[:2],)); ok(cur.fetchone()[0] == 0, "lot : dé-validé = retiré de l'affichage")
ok(BK(ids=IDS[:5], action="update").status_code == 400 and BK(ids=IDS[:5], action="update", set={"category": "autre"}).status_code == 400, "lot : modification sans valeur ou avec moment inconnu refusée")
ok(BK(ids=IDS[:5], action="update", set={"category": "sleep", "target": 7}).json()["done"] == 5, "lot : moment et répétitions modifiés pour 5 dhikr")
cur.execute("select count(*) from athkar_items where id = any(%s) and category = 'sleep' and target = 7", (IDS[:5],)); ok(cur.fetchone()[0] == 5, "lot : modification enregistrée")
ok(BK(ids=IDS[:5], action="delete").json()["done"] == 5, "lot : 5 dhikr supprimés")
cur.execute("select count(*) from athkar_items where id = any(%s)", (IDS[:5],)); ok(cur.fetchone()[0] == 0, "lot : suppression effective")
cur.execute("select count(*) from audit_log where summary like 'Athkar%%en lot%%'"); ok(cur.fetchone()[0] >= 6, "lot : actions consignées dans le journal d'audit")
cur.execute("delete from athkar_items"); cur.execute("delete from users where id in (%s,%s)", (uid, lid))
stop(); print("athkar OK")
