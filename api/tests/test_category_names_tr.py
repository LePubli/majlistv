"""Catalogue : noms de catégories traduits dans les cartes (vue category_names.tr, migration 124) et dans la liste /categories.
Prérequis : API (3055) et PG de test (5544), migrations 123 et 124 appliquées."""
import random, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:5]


def cid(slug):
    cur.execute("select id from categories where slug = %s", (slug,)); return cur.fetchone()[0]


def talk(cat):
    vid = "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))
    return requests.post(B + "/talks", headers=ADM, json={"title": "T" + tag, "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + vid, "categoryId": cat}).json()["id"]


# Sous-catégorie traduite : « parent › enfant » dans chaque langue.
t1 = talk(cid("coran-tajwid-et-regles-de-recitation"))
d = requests.get(B + "/talks/" + t1, headers=ADM).json()
ok(d["category"] == "Le Coran › Tajwid et règles de récitation", "le nom français reste le nom d'origine")
ok(d["categoryTr"]["en"] == "The Quran › Tajwid and Recitation Rules", "nom complet anglais : parent › sous-catégorie")
ok(d["categoryTr"]["ar"].endswith("› التجويد وأحكام التلاوة"), "nom complet arabe")

# Catégorie sans traduction : pas de clé, le site garde le français.
cur.execute("insert into categories(name, catalogue_type) values (%s, 'adult') returning id", ("Sans trad " + tag,)); c0 = cur.fetchone()[0]
try:
    d0 = requests.get(B + "/talks/" + talk(c0), headers=ADM).json()
    ok(d0["category"] == "Sans trad " + tag and not d0["categoryTr"], "catégorie non traduite : français seul, aucun texte vide")
    # Sous-catégorie traduite dont le parent ne l'est pas : parent en français, enfant traduit.
    cur.execute("insert into categories(name, parent_id, catalogue_type, translations) values (%s, %s, 'adult', %s) returning id",
                ("Enfant " + tag, c0, '{"en":{"name":"Child"}}')); c1 = cur.fetchone()[0]
    d1 = requests.get(B + "/talks/" + talk(c1), headers=ADM).json()
    ok(d1["categoryTr"] == {"en": "Sans trad " + tag + " › Child"}, "parent non traduit : français › enfant traduit ; arabe absent")
    # Liste publique.
    L = {c["slug"]: c for c in requests.get(B + "/categories").json() if c.get("slug")}
    ok(L["coran"]["nameTr"]["en"] == "The Quran" and L["coran-tajwid-et-regles-de-recitation"]["fullNameTr"]["en"].startswith("The Quran › "), "/categories : nameTr et fullNameTr")
    ok(L["coran"]["name"] == "Le Coran", "/categories : le nom français reste dans `name`")
finally:
    cur.execute("delete from talks where title = %s", ("T" + tag,))
    cur.execute("delete from categories where id in (%s, %s)", (c0, c0 + 1))
    cur.execute("delete from categories where name = %s", ("Enfant " + tag,))
    cur.execute("delete from categories where name = %s", ("Sans trad " + tag,))
print("Tous les tests passent.")
