"""Nouveau catalogue, phase 2 : administration de la taxonomie (création, modification, ordre, traductions, SEO, suppression protégée, vidéos).
Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, random, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


ADM = login("admin@test.local", "AdminPassw0rd-test")
email = f"orga-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (email,))
ORG = login(email, "Passw0rd-test")
tag = uuid.uuid4().hex[:5]


def talk(title, cat=None):
    vid = "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))
    body = {"title": title, "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + vid}
    if cat:
        body["categoryId"] = cat
    return requests.post(B + "/talks", headers=ADM, json=body).json()["id"]


# ── Permissions ──
ok(requests.get(B + "/categories/admin", headers=ORG).status_code == 403, "arbre d'administration : organisateur refusé")
ok(requests.get(B + "/categories/admin").status_code == 401, "arbre d'administration : anonyme refusé")
ok(requests.post(B + "/categories/reorder", headers=ORG, json={"ids": [1]}).status_code == 403, "ordre : organisateur refusé")

# ── Création : slug automatique, ordre, héritage du catalogue ──
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Alpha Été {tag}", "catalogueType": "adult", "icon": "book", "color": "#C9A24B",
                                                         "description": "Une description", "seoTitle": "SEO titre", "seoDescription": "SEO desc"})
ok(r.status_code == 201, "création d'une catégorie adulte")
A = r.json()
ok(A["slug"] == f"alpha-ete-{tag}", f"slug automatique sans accents ({A['slug']})")
ok(A["catalogueType"] == "adult" and A["isActive"] and not A["isFeatured"] and A["displayOrder"] > 0, "valeurs par défaut (adulte, active, non mise en avant, ordre à la suite)")
ok(A["seoTitle"] == "SEO titre" and A["icon"] == "book" and A["color"] == "#C9A24B", "SEO, icône, couleur enregistrés")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Alpha Été {tag}".upper()}); ok(r.status_code == 409 and r.json()["code"] == "name_taken", "doublon de nom refusé (casse ignorée)")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Autre {tag}", "slug": A["slug"]}); ok(r.status_code == 409 and r.json()["code"] == "slug_taken", "doublon de slug refusé")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Slug KO {tag}", "slug": "Pas Valide"}); ok(r.status_code == 400, "slug invalide refusé")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Couleur KO {tag}", "color": "rouge"}); ok(r.status_code == 400, "couleur invalide refusée")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Image KO {tag}", "image": "javascript:alert(1)"}); ok(r.status_code == 400, "adresse d'image dangereuse refusée")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Champ inconnu {tag}", "bidule": 1}); ok(r.status_code == 400, "champ inconnu refusé")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Beta {tag}", "catalogueType": "adult"}); Bt = r.json()
ok(Bt["displayOrder"] > A["displayOrder"], "la nouvelle catégorie est rangée après la précédente")

# Sous-catégorie : hérite du catalogue du parent, slug préfixé par celui du parent
r = requests.post(B + "/categories", headers=ADM, json={"name": "Sous Un", "parentId": A["id"], "catalogueType": "kids"}); S1 = r.json()
ok(r.status_code == 201 and S1["catalogueType"] == "adult" and S1["slug"] == A["slug"] + "-sous-un", "sous-catégorie : catalogue du parent et slug préfixé")
r = requests.post(B + "/categories", headers=ADM, json={"name": "Sous Deux", "parentId": A["id"]}); S2 = r.json()
ok(S2["displayOrder"] > S1["displayOrder"], "sous-catégorie rangée à la suite")
ok(requests.post(B + "/categories", headers=ADM, json={"name": "Trop profond", "parentId": S1["id"]}).status_code == 400, "pas de troisième niveau")
ok(requests.post(B + "/categories", headers=ADM, json={"name": "sous un", "parentId": A["id"]}).status_code == 409, "doublon de sous-catégorie refusé")
r = requests.post(B + "/categories", headers=ADM, json={"name": "عنوان عربي فقط", "parentId": A["id"]}); ok(r.status_code == 201 and r.json()["slug"].startswith(A["slug"] + "-"), "nom arabe seul : slug de secours généré")

# ── Arbre d'administration ──
tree = requests.get(B + "/categories/admin", headers=ADM).json()
ids = [c["id"] for c in tree]
ok(ids.index(A["id"]) < ids.index(S1["id"]) < ids.index(S2["id"]), "arbre : parent suivi de ses sous-catégories dans l'ordre")
ok(all(k in tree[0] for k in ["slug", "translations", "mainCount", "extraCount", "seriesCount", "children", "heroImage", "isFeatured"]), "arbre : tous les champs et compteurs")
ok(next(c for c in tree if c["id"] == A["id"])["children"] == 3, "arbre : nombre de sous-catégories")

# ── Modification : traductions, activation, mise en avant, images ──
tr = {"en": {"name": "Alpha EN", "description": "English text"}, "ar": {"name": "ألفا", "seoTitle": "عنوان"}}
r = requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"translations": tr, "isFeatured": True, "image": "https://exemple.test/a.jpg", "heroImage": "/img/h.jpg", "shortDescription": "Court"})
ok(r.status_code == 200 and r.json()["translations"]["ar"]["name"] == "ألفا" and r.json()["isFeatured"] and r.json()["heroImage"] == "/img/h.jpg", "traductions FR/EN/AR, mise en avant, images")
r = requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"translations": {"en": {"name": ""}, "ar": {}}})
ok(r.json()["translations"] == {}, "traductions vides retirées")
ok(requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"translations": {"fr": {"name": "x"}}}).status_code == 400, "langue inconnue refusée")
ok(requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={}).status_code == 400, "modification vide refusée")
ok(requests.patch(f"{B}/categories/{A['id']}", headers=ORG, json={"name": "x"}).status_code == 403, "modification : organisateur refusé")
ok(requests.patch(f"{B}/categories/999999", headers=ADM, json={"name": "zz"}).status_code == 404, "modification d'une catégorie inconnue : 404")
r = requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"slug": Bt["slug"]}); ok(r.status_code == 409 and r.json()["code"] == "slug_taken", "slug déjà pris refusé à la modification")
r = requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"slug": A["slug"]}); ok(r.status_code == 200, "garder son propre slug : accepté")
r = requests.patch(f"{B}/categories/{Bt['id']}", headers=ADM, json={"name": f"Alpha Été {tag}"}); ok(r.status_code == 409, "renommer en un nom existant refusé")

# Désactivation : disparaît du site public, reste dans l'administration
ok(any(c["id"] == A["id"] for c in requests.get(B + "/categories").json()), "active : visible sur le site")
requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"isActive": False})
pub = requests.get(B + "/categories").json()
ok(not any(c["id"] == A["id"] for c in pub), "désactivée : retirée du site public")
ok(not any(c["id"] == S1["id"] for c in pub), "désactivée : ses sous-catégories disparaissent aussi")
ok(any(c["id"] == A["id"] and not c["isActive"] for c in requests.get(B + "/categories/admin", headers=ADM).json()), "désactivée : toujours dans l'administration")
requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"isActive": True})

# Changement de catalogue : les sous-catégories suivent
r = requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"catalogueType": "kids"}); ok(r.json()["catalogueType"] == "kids", "catégorie principale vers Kids")
cur.execute("select catalogue_type from categories where id=%s", (S1["id"],)); ok(cur.fetchone()[0] == "kids", "sa sous-catégorie suit")
requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"catalogueType": "adult"})

# Déplacement : une catégorie avec sous-catégories ne devient pas sous-catégorie
ok(requests.patch(f"{B}/categories/{A['id']}", headers=ADM, json={"parentId": Bt["id"]}).status_code == 400, "catégorie avec sous-catégories : ne peut pas devenir sous-catégorie")
r = requests.patch(f"{B}/categories/{S2['id']}", headers=ADM, json={"parentId": Bt["id"]}); ok(r.status_code == 200 and r.json()["parentId"] == Bt["id"], "déplacer une sous-catégorie vers un autre parent")
r = requests.patch(f"{B}/categories/{S2['id']}", headers=ADM, json={"parentId": None}); ok(r.json()["parentId"] is None, "promouvoir une sous-catégorie en catégorie principale")
requests.patch(f"{B}/categories/{S2['id']}", headers=ADM, json={"parentId": A["id"]})

# ── Ordre ──
r = requests.post(B + "/categories/reorder", headers=ADM, json={"ids": [S2["id"], S1["id"]]}); ok(r.status_code == 200, "réordonner deux sous-catégories")
t = {c["id"]: c for c in requests.get(B + "/categories/admin", headers=ADM).json()}
ok(t[S2["id"]]["displayOrder"] < t[S1["id"]]["displayOrder"], "nouvel ordre enregistré")
ok(requests.post(B + "/categories/reorder", headers=ADM, json={"ids": [A["id"], S1["id"]]}).status_code == 400, "ordre : niveaux mélangés refusés")
ok(requests.post(B + "/categories/reorder", headers=ADM, json={"ids": [S1["id"], S1["id"]]}).status_code == 400, "ordre : doublons refusés")
ok(requests.post(B + "/categories/reorder", headers=ADM, json={"ids": [S1["id"], 999999]}).status_code == 404, "ordre : identifiant inconnu refusé")

# ── Vidéos : association, plusieurs catégories ──
t1, t2, t3 = talk(f"Vidéo un {tag}"), talk(f"Vidéo deux {tag}", A["id"]), talk(f"Vidéo trois {tag}")
r = requests.post(f"{B}/categories/{A['id']}/talks", headers=ADM, json={"add": [t1, t2, t3]}); ok(r.status_code == 200 and r.json()["added"] == 2, "ajout de vidéos (la vidéo déjà principale n'est pas comptée)")
r = requests.post(f"{B}/categories/{S1['id']}/talks", headers=ADM, json={"add": [t1]}); ok(r.json()["added"] == 1, "même vidéo dans une 2e catégorie")
mem = requests.get(f"{B}/categories/{A['id']}/talks", headers=ADM).json()
ok({m["id"] for m in mem} == {t1, t2, t3} and next(m for m in mem if m["id"] == t1)["isMain"], "liste des vidéos de la catégorie (principale marquée)")
ok(requests.get(f"{B}/talks/{t1}").json()["category"] is not None, "la vidéo affiche sa catégorie")
cand = requests.get(f"{B}/categories/{Bt['id']}/candidates", headers=ADM, params={"q": f"Vidéo un {tag}"}).json()
ok(any(c["id"] == t1 for c in cand), "candidates : la vidéo peut être ajoutée à une autre catégorie")
cand = requests.get(f"{B}/categories/{A['id']}/candidates", headers=ADM, params={"q": f"Vidéo un {tag}"}).json()
ok(not any(c["id"] == t1 for c in cand), "candidates : celles déjà classées sont exclues")
ok(requests.post(f"{B}/categories/{A['id']}/talks", headers=ORG, json={"add": [t1]}).status_code == 403, "association : organisateur refusé")
r = requests.post(f"{B}/categories/{S1['id']}/talks", headers=ADM, json={"remove": [t1]}); ok(r.json()["removed"] == 1, "dissocier une catégorie supplémentaire")
# dissocier la principale : la vidéo n'est jamais supprimée ni laissée en double
requests.post(f"{B}/categories/{S1['id']}/talks", headers=ADM, json={"add": [t1]})
r = requests.post(f"{B}/categories/{A['id']}/talks", headers=ADM, json={"remove": [t1]}); ok(r.json()["removed"] == 1, "dissocier la catégorie principale")
cur.execute("select category_id from talks where id=%s", (t1,)); ok(cur.fetchone()[0] == S1["id"], "la catégorie supplémentaire devient principale")
cur.execute("select count(*) from talk_categories where talk_id=%s", (t1,)); ok(cur.fetchone()[0] == 0, "plus de doublon dans les catégories supplémentaires")

# ── Suppression protégée ──
r = requests.delete(f"{B}/categories/{A['id']}", headers=ADM); ok(r.status_code == 409 and r.json()["code"] == "has_children", "suppression refusée : sous-catégories")
r = requests.delete(f"{B}/categories/{S1['id']}", headers=ADM); ok(r.status_code == 409 and r.json()["code"] == "has_relations" and r.json()["relations"]["talks"] == 1, "suppression refusée : vidéos classées (détail fourni)")
ok(requests.delete(f"{B}/categories/{S1['id']}", headers=ORG, params={"detach": 1}).status_code == 403, "suppression : organisateur refusé")
ok(requests.delete(f"{B}/categories/{S1['id']}", headers=ADM, params={"moveTo": S1["id"]}).status_code == 400, "transfert vers elle-même refusé")
ok(requests.delete(f"{B}/categories/{S1['id']}", headers=ADM, params={"moveTo": 999999}).status_code == 404, "transfert vers une catégorie inconnue refusé")
# transfert : principale + supplémentaire + série
requests.post(f"{B}/categories/{S1['id']}/talks", headers=ADM, json={"add": [t3]})   # t3 : principale A → extra S1
r = requests.delete(f"{B}/categories/{S1['id']}", headers=ADM, params={"moveTo": S2["id"]}); ok(r.status_code == 200 and r.json()["moved"]["talks"] == 1 and r.json()["moved"]["extraTalks"] == 1, "suppression avec transfert (principales et supplémentaires)")
cur.execute("select category_id from talks where id=%s", (t1,)); ok(cur.fetchone()[0] == S2["id"], "la vidéo principale est transférée")
cur.execute("select count(*) from talk_categories where talk_id=%s and category_id=%s", (t3, S2["id"])); ok(cur.fetchone()[0] == 1, "la vidéo supplémentaire est transférée")
cur.execute("select count(*) from talks where id in (%s,%s,%s)", (t1, t2, t3)); ok(cur.fetchone()[0] == 3, "aucune vidéo supprimée")
cur.execute("select count(*) from legacy_catalogue_backup where kind like 'category_deleted%%' and category_name='Sous Un'"); ok(cur.fetchone()[0] >= 2, "trace de la suppression conservée")
r = requests.delete(f"{B}/categories/{S2['id']}", headers=ADM, params={"detach": 1}); ok(r.status_code == 200 and r.json()["detached"]["talks"] == 1, "suppression avec détachement explicite")
cur.execute("select category_id from talks where id=%s", (t1,)); ok(cur.fetchone()[0] is None, "la vidéo détachée reste en ligne, sans catégorie")
ok(requests.delete(f"{B}/categories/{S2['id']}", headers=ADM).status_code == 404, "supprimer deux fois : 404")

# Catégorie vide : suppression directe après avoir retiré ses sous-catégories
for c in requests.get(B + "/categories/admin", headers=ADM).json():
    if c["parentId"] == A["id"]:
        requests.delete(f"{B}/categories/{c['id']}", headers=ADM, params={"detach": 1})
requests.post(f"{B}/categories/{A['id']}/talks", headers=ADM, json={"remove": [t2, t3]})
r = requests.delete(f"{B}/categories/{A['id']}", headers=ADM); ok(r.status_code == 200, "catégorie vide : suppression directe")

# Univers Kids lié à l'espace Kids : jamais supprimé, ni passé aux adultes
cur.execute("select category_id from kid_rubrics where category_id is not null limit 1"); kid = cur.fetchone()[0]
r = requests.delete(f"{B}/categories/{kid}", headers=ADM, params={"detach": 1}); ok(r.status_code == 409 and r.json()["code"] == "kids_rubric", "univers Kids utilisé : suppression refusée")
ok(requests.patch(f"{B}/categories/{kid}", headers=ADM, json={"catalogueType": "adult"}).status_code == 409, "univers Kids utilisé : passage aux adultes refusé")

for t_ in (t1, t2, t3):
    requests.delete(f"{B}/talks/{t_}", headers=ADM)
requests.delete(f"{B}/categories/{S2['id']}", headers=ADM)
requests.delete(f"{B}/categories/{Bt['id']}", headers=ADM, params={"detach": 1})
cur.execute("delete from categories where name like %s or name='عنوان عربي فقط'", (f"%{tag}%",))
print("\nTOUT EST OK")
