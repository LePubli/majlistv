"""Étape A (interrupteurs de fonctions) : registre, garde de routes, inscription fermée, maintenance, journal, droits.
Prérequis : API (3055) lancée, PG de test (5544). Remet toutes les fonctions à leur état d'origine à la fin."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        restore()
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


ADMIN = login("admin@test.local", "AdminPassw0rd-test")
ZERO = "00000000-0000-0000-0000-000000000000"


def setf(**vals):
    r = requests.put(B + "/admin/features", json={"values": vals}, headers=ADMIN)
    assert r.status_code == 200, r.text
    time.sleep(5.3)  # le cache des réglages dure 5 s
    return r.json()


def is_off(path, method="GET", **kw):
    r = requests.request(method, B + path, timeout=10, **kw)
    return r.status_code in (403, 404) and r.json().get("code") == "feature_off"


cur.execute("select key, value from app_settings where key like 'feat\\_%'")
BEFORE = dict(cur.fetchall())


def restore():
    cur.execute("delete from app_settings where key like 'feat\\_%'")
    for k, v in BEFORE.items():
        cur.execute("insert into app_settings(key, value, is_secret) values (%s, %s, false)", (k, v))


# --- Lecture publique et administration
r = requests.get(B + "/features"); f = r.json()
ok(r.status_code == 200 and f["series"] is True and f["maintenance"] is False and f["registration"] is True, "GET /features public : tout activé par défaut, maintenance coupée")
ok(requests.get(B + "/config").json().get("features", {}).get("quiz") is True, "/config expose les fonctions")
d = requests.get(B + "/admin/features", headers=ADMIN).json()
ok(len(d["features"]) >= 18 and {g["id"] for g in d["groups"]} >= {"catalog", "learning", "community", "money", "comms", "access"}, "GET /admin/features : fonctions et groupes")
email = f"ft-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Marie"})
USER = login(email, "Passw0rd-test")
ok(requests.get(B + "/admin/features", headers=USER).status_code == 403, "un membre ne voit pas l'administration des fonctions")
ok(requests.put(B + "/admin/features", json={"values": {"quiz": False}}, headers=USER).status_code == 403, "un membre ne peut pas modifier les fonctions")
ok(requests.put(B + "/admin/features", json={"values": {"inconnue": False}}, headers=ADMIN).status_code == 400, "fonction inconnue refusée")
ok(requests.put(B + "/admin/features", json={"values": {}}, headers=ADMIN).status_code == 400, "demande vide refusée")

# --- Chaque fonction coupée ferme ses routes, et les rouvre une fois rallumée
CASES = {
    "series": [("/series", "GET")], "collections": [("/collections", "GET")], "books": [("/books", "GET")],
    "quiz": [(f"/talks/{ZERO}/quiz", "GET")], "revision": [("/me/revision", "GET")], "selfcheck": [("/me/selfcheck", "GET")],
    "learning": [("/me/learning", "GET")], "notes": [("/me/notes", "GET")], "favorites": [("/me/favorites", "GET")],
    "lists": [("/me/lists", "GET")], "follow": [("/me/notifications", "GET"), ("/speakers/x/follow", "PUT")],
    "citations": [("/citation/today", "GET")],
}
# On les coupe toutes d'un coup (un seul cache à attendre), on vérifie, puis on les rallume d'un coup.
setf(**{k: False for k in CASES})
for fid, routes in CASES.items():
    for path, m in routes:
        ok(is_off(path, m), f"{fid} coupée : {m} {path} → fonction indisponible")
state = requests.get(B + "/features").json()
ok(all(state[k] is False for k in CASES) and state["kids"] is True, "GET /features reflète les fonctions coupées")
ok(requests.get(B + "/config").json()["hasSeries"] is False, "/config : le menu Séries disparaît quand les séries sont coupées")
ok(requests.get(B + "/home").status_code == 200, "l'accueil reste servi sans séries")
setf(**{k: True for k in CASES})
for fid, routes in CASES.items():
    for path, m in routes:
        ok(not is_off(path, m), f"{fid} rallumée : {m} {path} répond de nouveau")

# --- Inscription fermée : seul POST /auth/register est bloqué, la connexion continue
setf(registration=False)
r = requests.post(B + "/auth/register", json={"email": f"x-{uuid.uuid4().hex[:6]}@test.local", "password": "Passw0rd-test", "name": "X"})
ok(r.status_code == 403 and r.json()["code"] == "feature_off", "inscription fermée : 403")
ok(requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).status_code == 200, "la connexion reste possible")
setf(registration=True)
ok(requests.post(B + "/auth/register", json={"email": f"y-{uuid.uuid4().hex[:6]}@test.local", "password": "Passw0rd-test", "name": "Y"}).status_code in (200, 201), "inscription rouverte")

# --- Maintenance : visiteurs et membres en 503, administrateur et connexion ouverts
setf(maintenance=True)
r = requests.get(B + "/series")
ok(r.status_code == 503 and r.json()["code"] == "maintenance", "maintenance : visiteur → 503")
ok(requests.get(B + "/me/favorites", headers=USER).status_code == 503, "maintenance : membre → 503")
ok(requests.get(B + "/series", headers=ADMIN).status_code == 200, "maintenance : l'administrateur garde l'accès")
ok(requests.get(B + "/features").json()["maintenance"] is True and requests.get(B + "/config").status_code == 200, "maintenance : /features et /config restent ouverts (le site affiche sa page d'attente)")
ok(requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).status_code == 200, "maintenance : la connexion reste ouverte")
ok(requests.get(B + "/health").status_code == 200, "maintenance : /health reste ouvert")
setf(maintenance=False)
ok(requests.get(B + "/series").status_code == 200, "maintenance levée")

# --- Journal des actions
time.sleep(1)
cur.execute("select summary from audit_log where route like '%/admin/features%' order by at desc limit 1")
row = cur.fetchone()
ok(row is not None and "Fonctions" in row[0], "changement inscrit au journal des actions")

restore()
print("TOUT EST BON", flush=True)
