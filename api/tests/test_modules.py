"""Étape M1 : socle des modules (chargeur, Admin → Modules, module pilote « gifts »).
Prérequis : PG de test (5544) ; deux API : 3055 (normale) et 3056 lancée avec MODULES_EXTRA_DIR=api/tests/fixtures/modules
(PORT=3056). Lancement depuis la racine du dépôt : python3 api/tests/test_modules.py"""
import sys, uuid, requests, psycopg2

N = "http://127.0.0.1:3055"; F = "http://127.0.0.1:3056"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(base, email, pw):
    return {"authorization": "Bearer " + requests.post(base + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


A = login(N, "admin@test.local", "AdminPassw0rd-test")
mail = f"mo-{uuid.uuid4().hex[:6]}@test.local"
requests.post(N + "/auth/register", json={"email": mail, "password": "Passw0rd-test", "name": "mo"})
MEMBER = login(N, mail, "Passw0rd-test")

# --- API normale : module pilote
ok(requests.get(N + "/admin/modules").status_code == 401, "Admin → Modules : refusé sans connexion")
ok(requests.get(N + "/admin/modules", headers=MEMBER).status_code == 403, "refusé à un membre")
mods = requests.get(N + "/admin/modules", headers=A).json()["modules"]
g = next(m for m in mods if m["id"] == "gifts")
ok(g["version"] == "1.0.0" and g["installedVersion"] == "1.0.0" and g["feature"] == "gifts", "gifts : version 1.0.0 lue et installée, liée à la fonction « gifts »")
ok([f["key"] for f in g["fields"]] == ["gift_price_1", "gift_price_3", "gift_price_12"], "gifts : 3 réglages de prix")
ok(sorted(m["id"] for m in mods if m["status"] != "absent") == sorted(["books", "channels", "citations", "collections", "favorites", "follow", "gifts", "kids", "learning", "lists", "notes", "practice", "quiz", "revenue", "revision", "selfcheck", "series", "showcase", "stats"]), "API normale : 19 modules présents dans le code (les autres, connus de la base, sont « absent »)")
ok(not [m["id"] for m in mods if m["status"] == "error"], "aucun module en erreur (chargement, migrations, démarrage des tâches de fond)")
ok(all(m["version"] == "1.0.0" and m["feature"] == m["id"] for m in mods if m["status"] != "absent"), "tous en v1.0.0 et liés à la fonction du même nom")
byid = {m["id"]: m for m in mods}
ok(byid["quiz"]["provides"] == ["talk.quiz"] and byid["kids"]["provides"] == ["kids.canSee"] and sorted(byid["series"]["provides"]) == ["series.episodeLabels", "series.list", "series.nextUp"], "points d'extension fournis (quiz, Kids, séries)")
ok(sorted(byid["gifts"]["listens"]) == ["stripe.charge.refunded", "stripe.checkout.payment"] and sorted(byid["revenue"]["listens"]) == ["stripe.charge.refunded", "stripe.invoice.paid", "watch.progress"], "événements écoutés (cartes cadeaux, rémunération)")
rv = next(m for m in mods if m["id"] == "revenue")
ok(len(rv["fields"]) == 6 and rv["admin"]["href"] == "/admin?tab=revenue", "revenue : 6 réglages et lien vers son écran d'administration")
fe = requests.get(N + "/features").json()
for mid in ("collections", "lists", "notes"):
    ok(next(m for m in mods if m["id"] == mid)["status"] == ("on" if fe[mid] else "off"), f"{mid} : état du module = état de la fonction")
ok(requests.get(N + "/collections").status_code == 200 and requests.get(N + "/me/lists", headers=A).status_code == 200, "routes de collections et de listes toujours branchées")
requests.put(N + "/admin/modules/collections", headers=A, json={"enabled": False})
ok(requests.get(N + "/collections").status_code == 404, "module Collections coupé : route fermée (404)")
requests.put(N + "/admin/modules/collections", headers=A, json={"enabled": True})
ok(requests.get(N + "/collections").status_code == 200, "rallumé : route rouverte")
cm = requests.get(N + "/config").json()["modules"]
ok(cm["gifts"] == (g["status"] == "on") and {"collections", "lists", "notes", "revenue"} <= set(cm), "/config publie l'état des modules")
# interrupteur = Admin → Fonctions
r = requests.put(N + "/admin/modules/gifts", headers=A, json={"enabled": True}); ok(r.status_code == 200, "activer gifts")
ok(requests.get(N + "/features").json()["gifts"] is True, "… la fonction « gifts » (Admin → Fonctions) est activée aussi")
requests.put(N + "/admin/modules/gifts", headers=A, json={"enabled": False})
ok(requests.get(N + "/features").json()["gifts"] is False, "désactiver : fonction coupée aussi")
r = requests.put(N + "/admin/modules/gifts", headers=A, json={"settings": {"gift_price_1": "7,49"}}); ok(r.status_code == 200, "réglage de prix enregistré")
ok(next(f for f in next(m for m in r.json()["modules"] if m["id"] == "gifts")["fields"] if f["key"] == "gift_price_1")["value"] == "7.49", "prix normalisé 7.49")
ok(requests.put(N + "/admin/modules/gifts", headers=A, json={"settings": {"app_name": "x"}}).status_code == 400, "réglage étranger au module refusé")
ok(requests.put(N + "/admin/modules/gifts", headers=A, json={"settings": {"gift_price_1": "abc"}}).status_code == 400, "valeur invalide refusée")
requests.put(N + "/admin/modules/gifts", headers=A, json={"settings": {"gift_price_1": None}})
ok(requests.get(N + "/gifts/options").status_code == 200, "routes des cartes cadeaux toujours branchées (/gifts/options)")
ok(requests.put(N + "/admin/modules/nope", headers=A, json={"enabled": True}).status_code == 404, "module inconnu : 404")
cur.execute("select count(*) from audit_log where summary like 'Module « Cartes cadeaux »%'"); ok(cur.fetchone()[0] >= 3, "actions inscrites au journal")

# --- API avec modules d'essai
FA = login(F, "admin@test.local", "AdminPassw0rd-test")
mods = {m["folder"]: m for m in requests.get(F + "/admin/modules", headers=FA).json()["modules"]}
ok(set(mods) >= {"gifts", "hello-demo", "broken-migration", "bad-manifest"}, f"modules vus : {sorted(mods)}")
h = mods["hello-demo"]
ok(h["status"] == "off" and h["version"] == "1.2.0" and h["installedVersion"] == "1.2.0", "hello-demo : livré inactif, version 1.2.0 installée")
ok(requests.get(F + "/hello-demo/hi").status_code == 404 and requests.get(F + "/hello-demo/hi").json()["code"] == "module_off", "inactif : ses routes répondent 404 module_off")
cur.execute("select count(*) from hello_demo_rows"); ok(cur.fetchone()[0] == 2, "sa migration SQL a été appliquée (2 lignes)")
cur.execute("select count(*) from module_migrations where module='hello-demo'"); ok(cur.fetchone()[0] == 1, "migration enregistrée une seule fois")
ok(mods["broken-migration"]["status"] == "error" and "table_qui_n_existe_pas" in mods["broken-migration"]["error"], "migration cassée : module en erreur, message lisible")
ok(mods["bad-manifest"]["status"] == "error" and "invalide" in mods["bad-manifest"]["error"], "fiche invalide : module en erreur")
ok(requests.put(F + "/admin/modules/broken-migration", headers=FA, json={"enabled": True}).status_code == 409, "un module en erreur ne s'active pas")
ok(requests.get(F + "/health").status_code == 200, "les autres modules et le site démarrent quand même")
# dépendances
r = requests.put(F + "/admin/modules/hello-demo", headers=FA, json={"enabled": True})
ok(r.status_code == 409 and "Cartes cadeaux" in r.json()["error"], "activation refusée : dépend de « Cartes cadeaux » (inactif)")
ok(requests.put(F + "/admin/modules/gifts", headers=FA, json={"enabled": True}).status_code == 200, "activer le module requis")
ok(requests.put(F + "/admin/modules/hello-demo", headers=FA, json={"enabled": True}).status_code == 200, "activer hello-demo")
hi = requests.get(F + "/hello-demo/hi").json()
ok(hi == {"greeting": "Bonjour", "times": 1, "rows": 2, "version": "1.2.0"}, f"route active, valeurs par défaut : {hi}")
r = requests.put(F + "/admin/modules/gifts", headers=FA, json={"enabled": False}); ok(r.status_code == 409 and "Démo bonjour" in r.json()["error"], "désactiver le module requis refusé tant que le dépendant est actif")
# réglages propres
r = requests.put(F + "/admin/modules/hello-demo", headers=FA, json={"settings": {"mod_hello_demo_greeting": "Salam", "mod_hello_demo_times": "3", "mod_hello_demo_token": "sk-secret-1234"}})
ok(r.status_code == 200, "réglages propres enregistrés")
fields = {f["key"]: f for f in next(m for m in r.json()["modules"] if m["id"] == "hello-demo")["fields"]}
ok(fields["mod_hello_demo_token"].get("isSet") is True and "value" not in fields["mod_hello_demo_token"] and fields["mod_hello_demo_token"]["hint"].endswith("1234") and "sk-secret" not in str(r.json()), "clé secrète : jamais renvoyée en clair (4 derniers caractères)")
cur.execute("select is_secret, value from app_settings where key='mod_hello_demo_token'"); row = cur.fetchone(); ok(row[0] and "sk-secret" not in row[1], "clé secrète chiffrée en base")
ok(requests.get(F + "/hello-demo/hi").json()["greeting"] == "Salam", "la route lit le réglage")
ok(requests.put(F + "/admin/modules/hello-demo", headers=FA, json={"settings": {"mod_hello_demo_times": "9"}}).status_code == 400, "nombre hors limites refusé")
st = requests.get(F + "/admin/settings", headers=FA).json()
ok(any(g["id"] == "mod_hello-demo" for g in st["groups"]), "réglages visibles aussi dans Admin → Paramètres (groupe du module)")
ok(requests.get(F + "/config").json()["modules"]["hello-demo"] is True, "/config : hello-demo activé")
requests.put(F + "/admin/modules/hello-demo", headers=FA, json={"enabled": False})
ok(requests.get(F + "/hello-demo/hi").status_code == 404, "désactivé : 404 aussitôt")

# nettoyage
requests.put(F + "/admin/modules/gifts", headers=FA, json={"enabled": False})
requests.put(F + "/admin/modules/hello-demo", headers=FA, json={"settings": {"mod_hello_demo_greeting": None, "mod_hello_demo_times": None, "mod_hello_demo_token": None}})
cur.execute("drop table if exists hello_demo_rows"); cur.execute("delete from module_migrations where module in ('hello-demo','broken-migration')"); cur.execute("delete from modules where id in ('hello-demo','broken-migration')"); cur.execute("delete from app_settings where key like 'mod_hello_demo%'")
print("TOUT EST OK")
