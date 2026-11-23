"""Catalogue : noms EN / AR des 241 catégories (migration 123). Vérifie la complétude, la forme, et que la migration n'écrase jamais une
traduction déjà saisie par l'administrateur. Prérequis : API (3055) démarrée une fois (migrations), PG de test (5544)."""
import json, os, re, sys, psycopg2

db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
ROOT = os.path.join(os.path.dirname(__file__), "..")
TAX = json.load(open(os.path.join(ROOT, "content/catalogue-taxonomy.json"), encoding="utf-8"))["categories"]
TR = json.load(open(os.path.join(ROOT, "content/catalogue-translations.json"), encoding="utf-8"))
SQL = open(os.path.join(ROOT, "migrations/123_catalogue_translations.sql"), encoding="utf-8").read()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


slugs = [c["slug"] for c in TAX] + [s["slug"] for c in TAX for s in c["subcategories"]]
ok(len(slugs) == 241 and set(TR) == set(slugs), "le fichier de traductions couvre exactement les 241 catégories de la taxonomie")
ok(all(set(v) == {"en", "ar"} and v["en"].strip() and v["ar"].strip() for v in TR.values()), "chaque catégorie a un nom anglais et un nom arabe non vides")
ok(all(re.search(r"[؀-ۿ]", v["ar"]) for v in TR.values()), "chaque nom arabe contient des lettres arabes")
ok(all(not re.search(r"[؀-ۿ]", v["en"]) and len(v["en"]) <= 80 and len(v["ar"]) <= 80 for v in TR.values()), "noms anglais sans lettres arabes, 80 caractères maximum")

cur.execute("select slug, translations from categories where slug = any(%s)", (slugs,))
rows = {s: t for s, t in cur.fetchall()}
ok(len(rows) == 241, "241 catégories en base")
ok(all((rows[s].get("en") or {}).get("name") and (rows[s].get("ar") or {}).get("name") for s in slugs), "la migration a rempli le nom EN et AR de chaque catégorie")

# Non-écrasement : une traduction saisie à la main (et les autres champs) survit à un rejeu de la migration.
s = "kids-coran-les-petites-sourates"
cur.execute("select translations from categories where slug = %s", (s,)); saved = cur.fetchone()[0]
try:
    cur.execute("update categories set translations = %s where slug = %s", (json.dumps({"en": {"name": "Saisi à la main", "description": "D"}, "ar": {}, "autre": 1}), s))
    cur.execute(SQL)
    cur.execute("select translations from categories where slug = %s", (s,)); t = cur.fetchone()[0]
    ok(t["en"]["name"] == "Saisi à la main" and t["en"]["description"] == "D", "un nom et une description EN saisis à la main sont conservés")
    ok(t["ar"]["name"] == TR[s]["ar"] and t.get("autre") == 1, "le nom AR manquant est complété, les autres clés sont conservées")
finally:
    cur.execute("update categories set translations = %s where slug = %s", (json.dumps(saved), s))
print("Tous les tests passent.")
