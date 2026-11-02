"""45F : circuit de Ramadan — admin (saisie, validation obligatoire, import), page publique, cases du membre (jour passé ou du jour), tarawih, rappel, droits, fonction coupée.
Données FICTIVES. Démarre sa propre copie de l'API (port 3072) avec une date simulée : RAMADAN_NOW = 23 février 2026 (6 Ramadan 1447).
Prérequis : PG de test (5544)."""
import base64, hashlib, hmac, json, os, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 3072
B = f"http://127.0.0.1:{PORT}"
ENV = dict(os.environ)
ENV.update({
    "DATABASE_URL": ENV.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"), "PRACTICE_KEY": ENV.get("PRACTICE_KEY", "practice-key-for-tests-0123456789"),
    "JWT_SECRET": ENV.get("JWT_SECRET", "0123456789abcdef0123456789abcdef-test"), "SETTINGS_KEY": ENV.get("SETTINGS_KEY", "test-settings-key-0123456789"),
    "ADMIN_EMAIL": "admin@test.local", "ADMIN_PASSWORD": "AdminPassw0rd-test", "PORT": str(PORT), "RATE_LIMIT_MAX": "100000", "AUTH_RATE_MAX": "100000",
    "RAMADAN_NOW": "2026-02-23T10:00:00Z",
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



it = lambda **k: {**{"day": 6, "title": {"fr": "Action fictive du jour 6", "en": "Fictitious action", "ar": ""}, "text": {"fr": "Détail fictif", "en": "", "ar": ""}, "link": "/coran/2", "reference": "Référence fictive", "position": 0, "validated": False, "enabled": False}, **k}
# Admin
ok(requests.get(B + "/admin/ramadan/items").status_code == 401 and requests.get(B + "/admin/ramadan/items", headers=USR).status_code == 403, "admin : refusé sans connexion et aux membres")
for bad, why in [({"day": 31}, "jour 31"), ({"title": {"fr": "", "en": "", "ar": ""}}, "sans titre"), ({"link": "https://exemple.org"}, "lien externe")]:
    ok(requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(**bad)).status_code == 400, f"action refusée : {why}")
ok(requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(enabled=True)).status_code == 400, "affichage refusé sans validation")
A6 = requests.post(B + "/admin/ramadan/items", headers=ADM, json=it()).json()["id"]
A0 = requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(day=0, title={"fr": "Action fictive de chaque jour", "en": "", "ar": ""})).json()["id"]
A9 = requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(day=9, validated=True, enabled=True)).json()["id"]
j = requests.get(B + "/admin/ramadan/items", headers=ADM).json(); ok(len(j["items"]) == 3 and j["status"]["day"] == 6, "admin : actions et jour du mois")
# Page publique : seulement les actions validées et affichées
j = requests.get(B + "/ramadan").json()
ok(j["status"]["active"] and j["status"]["day"] == 6 and j["status"]["hyear"] == 1447 and "me" not in j, "page publique : Ramadan jour 6, sans données personnelles")
ok(j["days"][5]["items"] == [] and j["everyDay"] == [] and len(j["days"][8]["items"]) == 1, "actions non validées invisibles")
for i, d in ((A6, 6), (A0, 0)):
    requests.put(f"{B}/admin/ramadan/items/{i}", headers=ADM, json=it(day=d, title={"fr": "Action fictive" + str(d), "en": "Fictitious " + str(d), "ar": ""}, validated=True, enabled=True))
cur.execute("select reviewed_by from ramadan_items where id=%s", (A6,)); ok(cur.fetchone()[0] == aid, "validation enregistrée (administrateur)")
j = requests.get(B + "/ramadan", params={"lang": "en"}).json()
ok(j["days"][5]["items"][0]["title"] == "Fictitious 6" and j["days"][5]["items"][0]["link"] == "/coran/2" and len(j["everyDay"]) == 1, "actions du jour 6 et de chaque jour (en)")
ok(requests.get(B + "/ramadan", params={"lang": "ar"}).json()["days"][5]["items"][0]["title"] == "Action fictive6", "langue sans texte : texte français")
# Membre : cases (gratuit, pas besoin de la formule Apprentissage)
ok(requests.put(B + "/ramadan/mark", json={"day": 6, "itemId": A6, "done": True}).status_code == 401, "cocher : connexion obligatoire")
ok(requests.put(B + "/ramadan/mark", headers=USR, json={"day": 6, "itemId": A6, "done": True}).status_code == 200, "action du jour cochée")
ok(requests.put(B + "/ramadan/mark", headers=USR, json={"day": 6, "itemId": A0, "done": True}).status_code == 200, "action de chaque jour cochée")
ok(requests.put(B + "/ramadan/mark", headers=USR, json={"day": 3, "itemId": A0, "done": True}).status_code == 200, "rattrapage d'un jour passé")
ok(requests.put(B + "/ramadan/mark", headers=USR, json={"day": 9, "itemId": A9, "done": True}).status_code == 400, "jour pas encore arrivé : refusé")
ok(requests.put(B + "/ramadan/mark", headers=USR, json={"day": 5, "itemId": A6, "done": True}).status_code == 404, "action d'un autre jour : refusée")
j = requests.get(B + "/ramadan", headers=USR).json()["me"]
ok(sorted(j["marks"]["6"]) == sorted([A6, A0]) and j["marks"]["3"] == [A0], "mes cases par jour")
requests.put(B + "/ramadan/mark", headers=USR, json={"day": 6, "itemId": A6, "done": False})
ok(requests.get(B + "/ramadan", headers=USR).json()["me"]["marks"]["6"] == [A0], "case décochée")
# Tarawih
ok(requests.put(B + "/ramadan/tarawih", headers=USR, json={"day": 6, "done": True, "rakaat": 1, "place": "mosque"}).status_code == 400, "nombre de rakaat invalide refusé")
ok(requests.put(B + "/ramadan/tarawih", headers=USR, json={"day": 6, "done": True, "rakaat": 8, "place": "mosque"}).status_code == 200, "tarawih de la nuit 6 : 8 rakaat, mosquée")
ok(requests.put(B + "/ramadan/tarawih", headers=USR, json={"day": 5, "done": True}).status_code == 200, "tarawih d'une nuit passée, sans détail")
ok(requests.put(B + "/ramadan/tarawih", headers=USR, json={"day": 7, "done": True}).status_code == 400, "nuit pas encore arrivée : refusée")
j = requests.get(B + "/ramadan", headers=USR).json()["me"]["tarawih"]
ok(j == {"6": {"rakaat": 8, "place": "mosque"}, "5": {"rakaat": None, "place": None}}, "mes tarawih")
requests.put(B + "/ramadan/tarawih", headers=USR, json={"day": 5, "done": False})
ok("5" not in requests.get(B + "/ramadan", headers=USR).json()["me"]["tarawih"], "tarawih décochée")
# Rappel
ok(requests.put(B + "/ramadan/prefs", headers=USR, json={"remindHour": 30}).status_code == 400, "heure invalide refusée")
ok(requests.put(B + "/ramadan/prefs", headers=USR, json={"remindHour": 20}).status_code == 200 and requests.get(B + "/ramadan", headers=USR).json()["me"]["remindHour"] == 20, "rappel à 20 h")
ok(requests.get(B + "/ramadan", headers=LRN).json()["me"]["marks"] == {}, "les cases sont personnelles")
# --- 45F2 : enfants (l'enfant dit « je l'ai fait », le parent valide) -----------------------------------------------------------
def kidtok(parent_id, profile_id):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); pl = b64(json.dumps({"sub": str(parent_id), "role": "user", "kid": str(profile_id), "iat": int(time.time())}).encode())
    return {"authorization": "Bearer " + h + "." + pl + "." + b64(hmac.new(ENV["JWT_SECRET"].encode(), f"{h}.{pl}".encode(), hashlib.sha256).digest())}
cur.execute("insert into kid_profiles(user_id, name, band) values (%s,'Enfant fictif','7-10') returning id", (uid,)); kp = cur.fetchone()[0]
cur.execute("insert into kid_profiles(user_id, name, band) values (%s,'Autre fictif','7-10') returning id", (lid,)); kp2 = cur.fetchone()[0]
KID = kidtok(uid, kp)
K6 = requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(audience="kid", title={"fr": "Action enfant fictive", "en": "", "ar": ""}, validated=True, enabled=True)).json()["id"]
ok(requests.get(B + "/admin/ramadan/items", headers=ADM).json()["items"][0]["audience"] in ("adult", "kid"), "admin : public de chaque action (adultes / enfants)")
ok(all(i["id"] != K6 for i in requests.get(B + "/ramadan").json()["days"][5]["items"]), "les actions enfants ne sont pas dans le circuit des adultes")
j = requests.get(B + "/kids/ramadan", headers=KID).json()
ok(j["status"]["day"] == 6 and [i["id"] for i in j["items"]] == [K6] and j["items"][0]["state"] == "todo", "enfant : action du jour (seulement celles des enfants)")
ok(requests.get(B + "/kids/ramadan", headers=USR).status_code == 401, "jeton parent refusé côté enfant")
ok(requests.get(B + "/ramadan", headers=KID).json().get("me") is None, "jeton enfant : pas de données du parent sur la page adultes")
ok(requests.put(B + "/ramadan/mark", headers=KID, json={"day": 6, "itemId": A6, "done": True}).status_code == 403, "jeton enfant : ne coche pas le circuit des adultes")
ok(requests.post(B + "/kids/ramadan/claim", headers=KID, json={"itemId": A6}).status_code == 404, "enfant : action d'adulte refusée")
ok(requests.post(B + "/kids/ramadan/claim", headers=KID, json={"itemId": K6}).status_code == 200, "enfant : « je l'ai fait »")
ok(requests.get(B + "/kids/ramadan", headers=KID).json()["items"][0]["state"] == "claimed", "en attente de la validation du parent")
ok(requests.post(f"{B}/me/kids/profiles/{kp}/ramadan/validate", headers=KID, json={"day": 6, "itemId": K6}).status_code == 403, "l'enfant ne peut pas valider")
ok(requests.get(f"{B}/me/kids/profiles/{kp2}/ramadan", headers=USR).status_code == 404, "parent : pas d'accès au profil d'un autre parent")
j = requests.get(f"{B}/me/kids/profiles/{kp}/ramadan", headers=USR).json()
ok(j["days"][0]["day"] == 6 and j["days"][0]["items"][0]["state"] == "claimed" and len(j["days"]) == 6, "parent : 6 derniers jours, action dite faite")
ok(requests.post(f"{B}/me/kids/profiles/{kp}/ramadan/validate", headers=USR, json={"day": 7, "itemId": K6}).status_code == 400, "parent : jour à venir refusé")
ok(requests.post(f"{B}/me/kids/profiles/{kp}/ramadan/validate", headers=USR, json={"day": 6, "itemId": K6}).status_code == 200, "parent : validée")
j = requests.get(B + "/kids/ramadan", headers=KID).json(); ok(j["items"][0]["state"] == "validated" and j["validated"] == 1, "enfant : action validée, compteur")
ok(requests.post(f"{B}/me/kids/profiles/{kp}/ramadan/validate", headers=USR, json={"day": 4, "itemId": K6}).status_code == 404, "parent : action d'un autre jour refusée")
K0 = requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(audience="kid", day=0, title={"fr": "Action enfant de chaque jour", "en": "", "ar": ""}, validated=True, enabled=True)).json()["id"]
ok(requests.post(f"{B}/me/kids/profiles/{kp}/ramadan/validate", headers=USR, json={"day": 4, "itemId": K0}).status_code == 200, "parent : valider un jour passé (même sans « je l'ai fait »)")
ok(requests.get(B + "/kids/ramadan", headers=KID).json()["validated"] == 2, "enfant : 2 actions validées en tout")
cur.execute("delete from kid_profiles where id in (%s,%s)", (kp, kp2))

# Import
r = requests.post(B + "/admin/ramadan/import", headers=ADM, json={"items": [{"day": 1, "titleFr": "Import fictif"}, {"day": 40, "titleFr": "x"}]})
ok(r.status_code == 200 and r.json()["created"] == 1 and len(r.json()["errors"]) == 1, "import : 1 créée (non validée), 1 refusée")
ok(requests.get(B + "/ramadan").json()["days"][0]["items"] == [], "action importée invisible tant qu'elle n'est pas validée")
cur.execute("select count(*) from audit_log where summary like 'Ramadan%%'"); ok(cur.fetchone()[0] >= 4, "actions consignées dans le journal d'audit")
# Fonction coupée
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ramadan": "false"}})
ok(requests.get(B + "/ramadan").status_code in (403, 404), "fonction coupée : indisponible")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"feat_ramadan": None}})
# Suppression
ok(requests.delete(f"{B}/admin/ramadan/items/{A0}", headers=ADM).status_code == 200, "action supprimée")
cur.execute("select count(*) from ramadan_marks where item_id=%s", (A0,)); ok(cur.fetchone()[0] == 0, "ses cases sont supprimées avec elle")
# --- Actions en lot
cur.execute("delete from ramadan_items")
BI = []
for k in range(4):
    BI.append(requests.post(B + "/admin/ramadan/items", headers=ADM, json=it(day=k + 1, title={"fr": f"Lot {k}", "en": "", "ar": ""})).json()["id"])
BR = lambda **k: requests.post(B + "/admin/ramadan/items/bulk", headers=ADM, json=k)
ok(requests.post(B + "/admin/ramadan/items/bulk", json={"ids": BI, "action": "validate"}).status_code == 401 and requests.post(B + "/admin/ramadan/items/bulk", headers=LRN, json={"ids": BI, "action": "validate"}).status_code == 403, "lot : refusé sans connexion et aux membres")
ok(BR(ids=[], action="validate").status_code == 400 and BR(ids=BI, action="inconnue").status_code == 400, "lot : sélection vide et action inconnue refusées")
ok(BR(ids=BI[:2], action="validate").json() == {"done": 2, "skipped": 0}, "lot : 2 actions validées")
ok(BR(ids=BI, action="show").json() == {"done": 2, "skipped": 2}, "lot : afficher ignore les 2 actions non validées")
cur.execute("select count(*) from ramadan_items where enabled and reviewed_at is null"); ok(cur.fetchone()[0] == 0, "lot : jamais d'affichage sans validation")
ok(BR(ids=BI[2:], action="publish").json()["done"] == 2, "lot : valider et afficher en une fois")
ok(BR(ids=BI, action="hide").json()["done"] == 4, "lot : masquer")
ok(BR(ids=BI[:2], action="unvalidate").json()["done"] == 2, "lot : dé-valider")
ok(BR(ids=BI, action="update").status_code == 400 and BR(ids=BI, action="update", set={"audience": "autre"}).status_code == 400 and BR(ids=BI, action="update", set={"day": 31}).status_code == 400, "lot : modification sans valeur ou invalide refusée")
ok(BR(ids=BI, action="update", set={"audience": "kid", "day": 0}).json()["done"] == 4, "lot : public et jour modifiés pour 4 actions")
cur.execute("select count(*) from ramadan_items where id = any(%s) and audience = 'kid' and day = 0", (BI,)); ok(cur.fetchone()[0] == 4, "lot : modification enregistrée")
ok(BR(ids=BI, action="delete").json()["done"] == 4, "lot : 4 actions supprimées")
cur.execute("select count(*) from audit_log where summary like 'Ramadan%%en lot%%'"); ok(cur.fetchone()[0] >= 5, "lot : actions consignées dans le journal d'audit")
cur.execute("delete from ramadan_items"); cur.execute("delete from users where id in (%s,%s)", (uid, lid))
stop(); print("ramadan OK")
