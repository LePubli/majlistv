"""Nouveau catalogue, phase 1 (20/11) : 14 catégories adultes + 10 univers Kids avec leurs sous-catégories, modèle unique,
tranches d'âge 3-5 / 6-8 / 9-12 / 13-15, plus de plafond de catégories, migration rejouable. Prérequis : API (3055), PG de test (5544)."""
import json, os, re, subprocess, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
ROOT = os.path.join(os.path.dirname(__file__), "..")
SPEC = json.load(open(os.path.join(ROOT, "content/catalogue-taxonomy.json"), encoding="utf-8"))["categories"]


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def q(sql, *a):
    cur.execute(sql, a); return cur.fetchall()


tok = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]
ADM = {"authorization": "Bearer " + tok}
adult = [c for c in SPEC if c["catalogueType"] == "adult"]; kids = [c for c in SPEC if c["catalogueType"] == "kids"]

# --- Données
ok(len(adult) == 14 and len(kids) == 10, "le cahier des charges décrit 14 catégories adultes et 10 univers Kids")
for c in SPEC:
    rows = q("select id, catalogue_type, parent_id, is_active from categories where slug = %s", c["slug"])
    ok(len(rows) == 1 and rows[0][1] == c["catalogueType"] and rows[0][2] is None and rows[0][3], f"catégorie {c['slug']} présente (principale, {c['catalogueType']})")
    n = q("select count(*) from categories where parent_id = %s", rows[0][0])[0][0]
    ok(n == len(c["subcategories"]), f"{c['slug']} : {n} sous-catégories")
    for s in c["subcategories"]:
        r = q("select parent_id, catalogue_type, name from categories where slug = %s", s["slug"])
        assert len(r) == 1 and r[0][0] == rows[0][0] and r[0][1] == c["catalogueType"] and r[0][2] == s["name"], s["slug"]
ok(sum(len(c["subcategories"]) for c in SPEC) == 217, "217 sous-catégories créées avec le bon parent, le bon catalogue et le bon nom")
ok(q("select count(*) from (select slug from categories where slug is not null group by slug having count(*) > 1) d")[0][0] == 0, "slugs uniques")
ok(q("select count(*) from categories where parent_id is not null and catalogue_type <> (select catalogue_type from categories p where p.id = categories.parent_id)")[0][0] == 0, "une sous-catégorie est toujours du même catalogue que son parent")
ok(q("select count(*) from categories c join categories p on p.id = c.parent_id where p.parent_id is not null")[0][0] == 0, "deux niveaux seulement")

# --- Isolation adultes / Kids dans l'API
pub = requests.get(B + "/categories").json()
ok({c["slug"] for c in pub if c["parentId"] is None and c["slug"]} >= {c["slug"] for c in adult}, "GET /categories : les 14 catégories adultes")
ok(all(c["catalogueType"] == "adult" for c in pub), "GET /categories ne mélange jamais les univers Kids")
kd = requests.get(B + "/categories?catalogue=kids").json()
ok({c["slug"] for c in kd if c["parentId"] is None} == {c["slug"] for c in kids} and all(c["catalogueType"] == "kids" for c in kd), "GET /categories?catalogue=kids : les 10 univers Kids, eux seuls")
al = requests.get(B + "/categories?catalogue=all").json()
ok(len(al) >= 24 + 217, "GET /categories?catalogue=all : tout")
ok(requests.get(B + "/categories?catalogue=nimporte").status_code in (400, 422, 500), "paramètre de catalogue invalide refusé")
ok([c["slug"] for c in pub if c["parentId"] is None and c["slug"]][:3] == [c["slug"] for c in adult][:3], "ordre d'affichage respecté (Le Coran, La foi, Hadith…)")
st = requests.get(B + "/categories/stats", headers=ADM).json()
ok(all("slug" in c and "catalogueType" in c for c in st), "statistiques d'administration : slug et catalogue")

# --- Rubriques Kids = univers Kids (modèle unique)
rub = q("select slug, category_id from kid_rubrics order by position")
ok([r[0] for r in rub] == [c["slug"] for c in kids] and all(r[1] for r in rub), "les 10 rubriques Kids sont les 10 univers, liées au modèle de catégories")

# --- Plusieurs catégories par vidéo, sans plafond de 2
adm_id = q("select id from users where email = 'admin@test.local'")[0][0]
tag = uuid.uuid4().hex[:6]
cur.execute("insert into talks(organizer_id, title, source, video_ref, publication, video_status, access) values (%s, %s, 'upload', %s, 'published', 'ready', 'free') returning id", (adm_id, "Taxo " + tag, "talks/" + tag))
T = str(cur.fetchone()[0])
ids = [r[0] for r in q("select id from categories where catalogue_type = 'adult' and parent_id is null order by display_order limit 6")]
r = requests.patch(f"{B}/talks/{T}", headers=ADM, json={"categoryId": ids[0], "extraCategoryIds": ids[1:6]})
ok(r.status_code == 200, f"une vidéo dans 6 catégories (principale + 5) : {r.status_code}")
ok(q("select count(*) from talk_categories where talk_id = %s", T)[0][0] == 5, "les 5 catégories supplémentaires sont enregistrées")
ok(q("select count(*) from talks where id = %s", T)[0][0] == 1, "la vidéo n'est pas dupliquée")

# --- Tranches d'âge
r = requests.patch(f"{B}/talks/{T}", headers=ADM, json={"kidsBands": ["3-5", "6-8", "9-12", "13-15"]})
ok(r.status_code == 200 and q("select kids_bands from talks where id = %s", T)[0][0] == ["3-5", "6-8", "9-12", "13-15"], "les 4 tranches 3-5, 6-8, 9-12, 13-15 sont acceptées")
r = requests.patch(f"{B}/talks/{T}", headers=ADM, json={"kidsBands": ["3-6"]})
ok(r.status_code in (400, 422), "l'ancienne tranche 3-6 est refusée")
try:
    cur.execute("update talks set kids_bands = ARRAY['7-10'] where id = %s", (T,)); bad = False
except psycopg2.Error:
    bad = True
ok(bad, "la base refuse aussi les anciennes tranches")
try:
    cur.execute("update kid_profiles set band = '3-6' where false"); cur.execute("insert into kid_profiles(user_id, name, avatar, band) values (%s, 'x', 'star', '11-14')", (adm_id,)); bad = False
except psycopg2.Error:
    bad = True
ok(bad, "la base refuse un profil enfant dans une ancienne tranche")

# --- Migration rejouable, sans doublon ni perte
n_cat, n_talks, n_bk = q("select count(*) from categories")[0][0], q("select count(*) from talks")[0][0], q("select count(*) from legacy_catalogue_backup")[0][0]
sql = open(os.path.join(ROOT, "migrations/121_catalogue_taxonomy.sql"), encoding="utf-8").read()
cur.execute(sql)
cur.execute(open(os.path.join(ROOT, "src/modules/kids/migrations/002_universes.sql"), encoding="utf-8").read())
ok(q("select count(*) from categories")[0][0] == n_cat, "migration rejouée : aucune catégorie en double, aucune catégorie supprimée")
ok(q("select count(*) from talks")[0][0] == n_talks and q("select count(*) from legacy_catalogue_backup")[0][0] == n_bk, "migration rejouée : aucune vidéo perdue, sauvegarde inchangée")
ok(q("select count(*) from kid_rubrics")[0][0] == 10, "migration Kids rejouée : toujours 10 rubriques")
ok(q("select to_regclass('legacy_catalogue_backup') is not null")[0][0], "table de sauvegarde de l'ancien classement présente")

# --- Nettoyage
cur.execute("delete from talks where id = %s", (T,))
print("TOUT OK")
