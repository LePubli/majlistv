"""Audit 11/2026 — balayage des droits de TOUTES les routes de l'API.

Les routes sont lues dans le code (app.get / post / put / patch / delete), puis appelées :
  - sans connexion : toute route /admin, /studio, /moderation doit répondre 401 ;
  - en simple membre : toute route /admin, /studio, /moderation doit répondre 403 ;
  - en organisateur et en modérateur : toute route /admin doit répondre 403 ;
  - sans connexion, toute écriture (POST / PUT / PATCH / DELETE) doit répondre 401, sauf la liste connue des écritures publiques.
Une route d'un module désactivé répond 404 avant tout contrôle : le test ACTIVE donc tous les modules le temps du
balayage (puis remet chacun dans son état), pour que le contrôle d'accès de chaque route soit réellement exercé.
Une nouvelle route oubliée sans contrôle d'accès fait donc échouer ce test.

    python3 api/tests/test_authz_sweep.py        (API de test sur :3055, base sur :5544)
"""
import os, re, sys, glob, uuid, atexit
import psycopg2, requests

B = "http://127.0.0.1:3055"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
fails = []
def ok(c, m):
    if not c: fails.append(m); print("FAIL", m)

ROUTE = re.compile(r"\b(?:app|fastify|f|api|scope|r)\.(get|post|put|patch|delete)\(\s*(['\"`])([^'\"`]+)\2\s*,")
routes = set()
for path in glob.glob(os.path.join(ROOT, "**", "*.js"), recursive=True):
    for m in ROUTE.finditer(open(path, encoding="utf-8").read()):
        if m.group(3).startswith("/") and "${" not in m.group(3): routes.add((m.group(1).upper(), m.group(3)))
routes = sorted(routes)
ok(len(routes) > 600, f"routes trouvées dans le code ({len(routes)})")

db = psycopg2.connect(os.environ.get("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis")); db.autocommit = True; cur = db.cursor()
def user(role):
    email = f"sweep-{role}-{uuid.uuid4().hex[:8]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Sweep"})
    cur.execute("update users set role=%s where email=%s", (role, email))
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}

ID = "00000000-0000-4000-8000-000000000000"
def url(p):
    return "/".join((ID if "id" in s.lower() or s in (":fp", ":n") else "x") if s.startswith(":") else ("x" if "*" in s else s) for s in p.split("/"))
def call(method, path, headers):
    return requests.request(method, B + url(path), headers=headers, json=(None if method in ("GET", "DELETE") else {}), timeout=30, allow_redirects=False).status_code

admin_like = lambda p: p.startswith("/admin")
back_like = lambda p: p.startswith("/admin") or p.startswith("/studio") or "/studio/" in p or p.startswith("/moderation")
# Tous les modules sont activés pour le balayage (un module éteint répond 404 avant le contrôle d'accès), puis remis en l'état.
ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": os.environ.get("ADMIN_EMAIL", "admin@test.local"), "password": os.environ.get("ADMIN_PASSWORD", "AdminPassw0rd-test")}).json()["token"]}
mods = lambda: requests.get(B + "/admin/modules", headers=ADM).json()["modules"]
was_off = [m["id"] for m in mods() if m["status"] != "on"]
def switch(mid, on): return requests.put(B + f"/admin/modules/{mid}", headers=ADM, json={"enabled": on}).status_code
atexit.register(lambda: [switch(mid, False) for mid in reversed(was_off)])
for _ in range(4):  # plusieurs passes : un module peut en demander un autre
    for mid in [m["id"] for m in mods() if m["status"] != "on"]: switch(mid, True)
still_off = [m["id"] for m in mods() if m["status"] != "on"]
ok(not still_off, f"tous les modules activés pour le balayage (restent éteints : {still_off})")
off = lambda p: False
# Écritures ouvertes sans connexion, voulues (chacune a sa propre protection : limite de débit, signature, jeton, validation).
PUBLIC_WRITES = {
    ("POST", "/auth/register"), ("POST", "/auth/login"), ("POST", "/auth/forgot"), ("POST", "/auth/reset"), ("POST", "/auth/2fa/verify"),
    ("POST", "/errors/client"), ("POST", "/stats/hit"), ("POST", "/xp/click"), ("POST", "/xp/expose"),
    ("POST", "/ads/:id/click"), ("POST", "/ads/:id/impression"), ("POST", "/ads/:id/skip"), ("POST", "/shorts/:id/view"),
    ("POST", "/talks/:id/quiz/submit"), ("POST", "/talks/:id/report"), ("POST", "/talks/:id/quiz/questions/:qid/report"),
    ("POST", "/backup/report"),
    # Application TV : la télé, pas encore connectée, demande un code puis attend sa validation (secret de 32 octets, 13/11).
    ("POST", "/auth/tv/start"), ("POST", "/auth/tv/poll"),
}

anon, member, organizer, moderator = {}, user("user"), user("organizer"), user("moderator")
n = 0
for method, path in routes:
    if back_like(path):
        want = (401, 404) if off(path) else (401,)
        s = call(method, path, anon); n += 1
        ok(s in want, f"sans connexion : {method} {path} → {s} (attendu 401)")
        want = (403, 404) if off(path) else (403,)
        s = call(method, path, member); n += 1
        ok(s in want, f"simple membre : {method} {path} → {s} (attendu 403)")
        if admin_like(path):
            for label, h in (("organisateur", organizer), ("modérateur", moderator)):
                s = call(method, path, h); n += 1
                ok(s in want, f"{label} : {method} {path} → {s} (attendu 403)")
    elif method != "GET" and (method, path) not in PUBLIC_WRITES:
        s = call(method, path, anon); n += 1
        # /app/publish/* : protégé par un jeton de publication (jamais un compte) ; 503 tant que le jeton n'est pas réglé, 401 ensuite.
        want = (401, 503) if path.startswith("/app/publish/") else (401,)
        ok(s in want, f"sans connexion, écriture : {method} {path} → {s} (attendu 401 ; si l'écriture publique est voulue, l'ajouter à PUBLIC_WRITES)")

print(f"{n} appels sur {len(routes)} routes")
if fails:
    print(f"\n{len(fails)} ÉCHEC(S)"); sys.exit(1)
print("droits des routes OK")
