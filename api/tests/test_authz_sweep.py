"""Audit 11/2026 — balayage des droits de TOUTES les routes de l'API.

Les routes sont lues dans le code (app.get / post / put / patch / delete), puis appelées :
  - sans connexion : toute route /admin, /studio, /moderation doit répondre 401 ;
  - en simple membre : toute route /admin, /studio, /moderation doit répondre 403 ;
  - en organisateur et en modérateur : toute route /admin doit répondre 403 ;
  - sans connexion, toute écriture (POST / PUT / PATCH / DELETE) doit répondre 401, sauf la liste connue des écritures publiques.
Une route d'un module désactivé répond 404 avant tout (liste MODULE_OFF) : acceptée telle quelle.
Une nouvelle route oubliée sans contrôle d'accès fait donc échouer ce test.

    python3 api/tests/test_authz_sweep.py        (API de test sur :3055, base sur :5544)
"""
import os, re, sys, glob, uuid
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
# Modules désactivés par défaut : leurs routes répondent 404 (module éteint) avant le contrôle d'accès.
MODULE_OFF = ("/admin/revenue", "/studio/revenue", "/studio/storage")
off = lambda p: p.startswith(MODULE_OFF)
# Écritures ouvertes sans connexion, voulues (chacune a sa propre protection : limite de débit, signature, jeton, validation).
PUBLIC_WRITES = {
    ("POST", "/auth/register"), ("POST", "/auth/login"), ("POST", "/auth/forgot"), ("POST", "/auth/reset"), ("POST", "/auth/2fa/verify"),
    ("POST", "/errors/client"), ("POST", "/stats/hit"), ("POST", "/xp/click"), ("POST", "/xp/expose"),
    ("POST", "/ads/:id/click"), ("POST", "/ads/:id/impression"), ("POST", "/ads/:id/skip"), ("POST", "/shorts/:id/view"),
    ("POST", "/talks/:id/quiz/submit"), ("POST", "/talks/:id/report"), ("POST", "/talks/:id/quiz/questions/:qid/report"),
    ("POST", "/backup/report"),
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
        ok(s == 401, f"sans connexion, écriture : {method} {path} → {s} (attendu 401 ; si l'écriture publique est voulue, l'ajouter à PUBLIC_WRITES)")

print(f"{n} appels sur {len(routes)} routes")
if fails:
    print(f"\n{len(fails)} ÉCHEC(S)"); sys.exit(1)
print("droits des routes OK")
