"""Étape M3a : le socle ne dépend d'aucun module. Pour CHAQUE module de api/src/modules : copie de l'API sans ce dossier,
démarrage sur le port 3057, puis vérifications (le site répond, la fonction du module est coupée et masquée, rien ne plante).
Prérequis : PG de test (5544), stockage S3 de test, faux Stripe (tests/mock_stripe.py, port 12111) ; variables de l'API de test
dans le fichier indiqué par TEST_ENV_FILE (par défaut /var/tmp/mjl/api.env). Lancement depuis la racine du dépôt :
  python3 api/tests/test_module_removal.py            (tous les modules)
  python3 api/tests/test_module_removal.py quiz kids  (seulement ceux-là)"""
import base64, hashlib, hmac, json, os, shutil, subprocess, sys, tempfile, time, uuid
import psycopg2, requests

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.environ.get("TEST_ENV_FILE", "/var/tmp/mjl/api.env")
PORT = 3057
B = f"http://127.0.0.1:{PORT}"
SECRET = "whsec_test"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
fails = []


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        fails.append(m)


def env():
    e = dict(os.environ)
    for line in open(ENV_FILE):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1); e[k] = v
    e.update({"PORT": str(PORT), "STRIPE_API_BASE": "http://127.0.0.1:12111", "RATE_LIMIT_MAX": "5000"})
    return e


ENV = env()


def b64(x):
    return base64.urlsafe_b64encode(x).decode().rstrip("=")


def token(uid, role):  # jeton signé comme l'API (évite la limite de 10 connexions par minute)
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); p = b64(json.dumps({"sub": uid, "role": role, "iat": int(time.time())}).encode())
    return {"authorization": "Bearer " + h + "." + p + "." + b64(hmac.new(ENV["JWT_SECRET"].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())}


def hook(event):
    payload = json.dumps(event); ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return requests.post(B + "/billing/webhook", data=payload, headers={"content-type": "application/json", "stripe-signature": f"t={ts},v1={sig}"})


# Données de départ
cur.execute("select id from users where email=%s", (ENV["ADMIN_EMAIL"],)); ADMIN = token(str(cur.fetchone()[0]), "admin")
mail = f"rm-{uuid.uuid4().hex[:6]}@test.local"
cur.execute("insert into users(email, password_hash, name, role) values (%s, 'x', 'Membre retrait', 'user') returning id", (mail,)); MEMBER = token(str(cur.fetchone()[0]), "user")
TALK = None  # une conférence visible du public, lue sur l'API complète (voir plus bas)
MODULES = sorted(d for d in os.listdir(os.path.join(API_DIR, "src", "modules")) if os.path.isfile(os.path.join(API_DIR, "src", "modules", d, "module.json")))
targets = sys.argv[1:] or MODULES
FEATURE_ROUTE = {  # une route propre à chaque module, qui doit disparaître (404) quand son dossier est retiré
    "books": "/books", "channels": "/channels", "citations": "/citation/today", "collections": "/collections", "favorites": "/me/favorites",
    "follow": "/me/notifications", "gifts": "/gifts/options", "kids": "/me/kids", "learning": "/me/learning", "lists": "/me/lists",
    "notes": "/me/notes", "practice": "/me/practice", "quiz": "/studio/quiz/review", "revenue": "/admin/revenue", "revision": "/studio/reminders",
    "selfcheck": "/me/selfcheck", "series": "/series", "showcase": "/showcase", "stats": "/admin/stats",
}


def start(root):
    log = open(os.path.join(root, "api.log"), "w")
    p = subprocess.Popen(["node", "src/index.js"], cwd=root, env=ENV, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(80):
        if p.poll() is not None:
            return p, False
        try:
            if requests.get(B + "/health", timeout=1).status_code == 200:
                return p, True
        except requests.RequestException:
            pass
        time.sleep(0.25)
    return p, False


def check(mid):
    tmp = tempfile.mkdtemp(prefix=f"sans-{mid}-")
    root = os.path.join(tmp, "api")
    shutil.copytree(API_DIR, root, ignore=shutil.ignore_patterns("node_modules", "tests", ".git"))
    os.symlink(os.path.join(API_DIR, "node_modules"), os.path.join(root, "node_modules"))
    shutil.rmtree(os.path.join(root, "src", "modules", mid))
    p, up = start(root)
    try:
        ok(up, f"[sans {mid}] l'API démarre")
        if not up:
            print(open(os.path.join(root, "api.log")).read()[-1500:]); return
        cfg = requests.get(B + "/config"); c = cfg.json()
        ok(cfg.status_code == 200 and mid not in c["modules"], f"[sans {mid}] /config répond, module absent de la liste")
        feats = requests.get(B + "/features").json()
        ok(feats.get(mid, False) is False, f"[sans {mid}] sa fonction est coupée (/features)")
        af = requests.get(B + "/admin/features", headers=ADMIN)
        ok(af.status_code == 200 and all(f["id"] != mid for f in af.json()["features"]), f"[sans {mid}] Admin → Fonctions ne la propose plus")
        ok(requests.put(B + "/admin/features", headers=ADMIN, json={"values": {mid: True}}).status_code == 400, f"[sans {mid}] impossible de la rallumer")
        ok(requests.get(B + "/admin/settings", headers=ADMIN).status_code == 200, f"[sans {mid}] Admin → Paramètres répond")
        mods = requests.get(B + "/admin/modules", headers=ADMIN).json()["modules"]
        ok(all(m["id"] != mid or m["status"] == "absent" for m in mods), f"[sans {mid}] Admin → Modules : « absent du code »")
        route = FEATURE_ROUTE.get(mid)
        if route:
            r = requests.get(B + route, headers=ADMIN)
            ok(r.status_code == 404, f"[sans {mid}] sa route {route} n'existe plus ({r.status_code})")
        # Le socle continue de fonctionner
        for path, h in [("/talks", None), ("/home", None), ("/home/featured", None), ("/search?q=a", None), ("/seo/site", None), ("/seo/sitemap", None),
                        ("/me/continue", MEMBER), ("/me/quiz/todo", MEMBER), ("/me/revision", MEMBER)]:
            r = requests.get(B + path, headers=h)
            ok(r.status_code < 500, f"[sans {mid}] {path} : {r.status_code}")
        if TALK:
            r = requests.get(B + f"/talks/{TALK}")
            ok(r.status_code == 200 and "quiz" in r.json() and "practice" in r.json(), f"[sans {mid}] fiche d'une conférence ({r.status_code})")
            ok(requests.get(B + f"/seo/talks/{TALK}").status_code == 200, f"[sans {mid}] SEO d'une conférence")
            r = requests.put(B + f"/me/progress/{TALK}", headers=MEMBER, json={"positionMs": 60000, "durationMs": 600000})
            ok(r.status_code < 500, f"[sans {mid}] enregistrer la lecture ({r.status_code})")
        # Événement de paiement sans le module concerné : accepté, pas d'erreur
        r = hook({"id": "evt_" + uuid.uuid4().hex[:12], "object": "event", "type": "charge.refunded", "created": int(time.time()),
                  "data": {"object": {"id": "ch_x", "object": "charge", "amount": 699, "amount_refunded": 699, "refunded": True, "payment_intent": "pi_" + uuid.uuid4().hex[:10]}}})
        ok(r.status_code == 200, f"[sans {mid}] Stripe : remboursement traité ({r.status_code})")
        errs = [l for l in open(os.path.join(root, "api.log")) if '"level":50' in l or '"level":60' in l]
        ok(not errs, f"[sans {mid}] aucune erreur dans le journal de l'API" + (f" : {errs[0][:300]}" if errs else ""))
    finally:
        p.terminate(); p.wait(timeout=10); shutil.rmtree(tmp, ignore_errors=True)


# Réglages Stripe de test (le webhook doit pouvoir être vérifié)
cur.execute("delete from app_settings where key in ('stripe_webhook_secret')")
p, up = start(API_DIR)
try:
    requests.put(B + "/admin/settings", headers=ADMIN, json={"values": {"stripe_secret_key": "sk_test_A", "stripe_webhook_secret": SECRET}, "confirmStripeReset": True})
    lst = requests.get(B + "/talks").json()
    lst = lst.get("talks", lst.get("items", [])) if isinstance(lst, dict) else lst
    TALK = lst[0]["id"] if lst else None
    ok(bool(TALK), "une conférence publique pour les vérifications")
finally:
    p.terminate(); p.wait(timeout=10)
for mid in targets:
    check(mid)


def core_alone():  # le socle seul, sans AUCUN module
    tmp = tempfile.mkdtemp(prefix="socle-seul-"); root = os.path.join(tmp, "api")
    shutil.copytree(API_DIR, root, ignore=shutil.ignore_patterns("node_modules", "tests", ".git"))
    os.symlink(os.path.join(API_DIR, "node_modules"), os.path.join(root, "node_modules"))
    for d in MODULES:
        shutil.rmtree(os.path.join(root, "src", "modules", d))
    p, up = start(root)
    try:
        ok(up, "[socle seul] l'API démarre sans aucun module")
        if not up:
            print(open(os.path.join(root, "api.log")).read()[-1500:]); return
        ok(requests.get(B + "/config").json()["modules"] == {}, "[socle seul] aucun module chargé")
        feats = requests.get(B + "/features").json()
        ok(all(feats[m] is False for m in MODULES if m in feats), "[socle seul] toutes les fonctions des modules sont coupées")
        ok([f["id"] for f in requests.get(B + "/admin/features", headers=ADMIN).json()["features"]] == ["registration", "maintenance"], "[socle seul] Admin → Fonctions : inscription et maintenance seulement")
        for path, h in [("/talks", None), ("/home", None), ("/search?q=a", None), ("/seo/sitemap", None), ("/me/continue", MEMBER), ("/admin/settings", ADMIN), ("/admin/modules", ADMIN)]:
            r = requests.get(B + path, headers=h); ok(r.status_code < 500, f"[socle seul] {path} : {r.status_code}")
        if TALK:
            ok(requests.get(B + f"/talks/{TALK}").status_code == 200, "[socle seul] fiche d'une conférence")
            ok(requests.put(B + f"/me/progress/{TALK}", headers=MEMBER, json={"positionMs": 90000, "durationMs": 600000}).status_code < 500, "[socle seul] enregistrer la lecture")
        errs = [l for l in open(os.path.join(root, "api.log")) if '"level":50' in l or '"level":60' in l]
        ok(not errs, "[socle seul] aucune erreur dans le journal" + (f" : {errs[0][:300]}" if errs else ""))
    finally:
        p.terminate(); p.wait(timeout=10); shutil.rmtree(tmp, ignore_errors=True)


if not sys.argv[1:]:
    core_alone()
cur.execute("delete from users where email=%s", (mail,))
print(f"\n{len(targets)} module(s) retirés un par un ; échecs : {len(fails)}")
print("TOUT EST OK" if not fails else "\n".join(fails))
sys.exit(1 if fails else 0)
