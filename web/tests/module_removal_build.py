"""Étape M3b : le site web se construit et fonctionne sans chaque module.
Pour CHAQUE dossier web/modules/<id> : copie du site sans ce dossier ni ses pages (groupes « (module-<id>) »), construction
(next build), démarrage, puis vérifications : l'accueil et les pages du socle répondent, les pages du module n'existent plus.
Puis le site SANS AUCUN module. Prérequis : API de test lancée (API_URL, par défaut http://127.0.0.1:3055).
Lancement depuis la racine du dépôt :  python3 web/tests/module_removal_build.py            (tous)
                                       python3 web/tests/module_removal_build.py gifts kids  (seulement ceux-là)"""
import os, shutil, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error

WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get("API_URL", "http://127.0.0.1:3055")
PORT = 3111
MODULES = sorted(d for d in os.listdir(os.path.join(WEB, "modules")) if os.path.isfile(os.path.join(WEB, "modules", d, "module.js")))
# Une page de chaque module qui a des pages (doit disparaître sans lui)
PAGE = {"series": "/series", "collections": "/collections", "books": "/books", "learning": "/learning", "lists": "/lists", "channels": "/chaines",
        "revenue": "/studio/revenue", "kids": "/kids", "gifts": "/gift", "quiz": "/studio/quiz", "practice": "/studio/practice",
        "revision": "/studio/reminders", "stats": "/studio/stats", "dubbing": "/studio/dubbing"}
CORE = ["/", "/login", "/pricing", "/library", "/account", "/legal/cgv", "/studio", "/admin"]
fails = []


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        fails.append(m)


def status(path):
    try:
        return urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", headers={"accept": "text/html"}), timeout=30).status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def remove(root, mid):
    shutil.rmtree(os.path.join(root, "modules", mid))
    for dp, dn, fn in os.walk(os.path.join(root, "app")):
        for d in list(dn):
            if d == f"(module-{mid})":
                shutil.rmtree(os.path.join(dp, d)); dn.remove(d)


def check(mids, label):
    tmp = tempfile.mkdtemp(prefix="web-sans-")
    root = os.path.join(tmp, "web")
    shutil.copytree(WEB, root, ignore=shutil.ignore_patterns("node_modules", ".next", "tests"))
    os.symlink(os.path.join(WEB, "node_modules"), os.path.join(root, "node_modules"))
    for m in mids:
        remove(root, m)
    if status("/login"):
        ok(False, f"[{label}] le port {PORT} est déjà occupé : arrêtez l'ancien serveur"); return
    b = subprocess.run(["npx", "next", "build"], cwd=root, capture_output=True, text=True, timeout=900)
    ok(b.returncode == 0, f"[{label}] le site se construit")
    if b.returncode != 0:
        print((b.stdout + b.stderr)[-2500:]); shutil.rmtree(tmp, ignore_errors=True); return
    env = dict(os.environ, API_URL=API)
    p = subprocess.Popen(["npx", "next", "start", "-p", str(PORT)], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        for _ in range(80):
            if status("/login"):
                break
            time.sleep(0.5)
        for path in CORE:
            s = status(path); ok(s == 200, f"[{label}] {path} : {s}")
        built = {l.split()[2] for l in b.stdout.splitlines() if len(l.split()) > 2 and l.split()[2].startswith("/")}  # pages construites
        for m in mids:
            if m in PAGE:
                ok(PAGE[m] not in built, f"[{label}] page du module {PAGE[m]} absente du site construit")
                if not PAGE[m].startswith("/studio/"):  # (sous /studio, une adresse inconnue est d'abord renvoyée à la connexion)
                    s = status(PAGE[m]); ok(s == 404, f"[{label}] {PAGE[m]} : page introuvable ({s})")
        for m, path in PAGE.items():
            if m not in mids:
                s = status(path); ok(s == 200, f"[{label}] page d'un autre module {path} toujours là : {s}")
                break
    finally:
        os.killpg(p.pid, signal.SIGTERM); p.wait(timeout=20)  # arrête npx ET le serveur Next qu'il a lancé
        for _ in range(40):  # le port doit être libéré avant le site suivant
            if not status('/login'): break
            time.sleep(0.5)
        shutil.rmtree(tmp, ignore_errors=True)


targets = sys.argv[1:] or MODULES
for mid in targets:
    check([mid], f"sans {mid}")
if not sys.argv[1:]:
    check(MODULES, "site sans aucun module")
print(f"\n{len(targets)} retrait(s) de module testé(s) ; échecs : {len(fails)}")
print("TOUT EST OK" if not fails else "\n".join(fails))
sys.exit(1 if fails else 0)
