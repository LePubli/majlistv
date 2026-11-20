"""Nouveau catalogue, phase 3 : catégories publiques du catalogue adultes (compteurs réels, textes FR/EN/AR, 404, sitemap).
Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, random, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:5]


def talk(title, cat=None):
    vid = "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))
    body = {"title": title, "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + vid}
    if cat:
        body["categoryId"] = cat
    return requests.post(B + "/talks", headers=ADM, json=body).json()["id"]


def cat(name, **kw):
    return requests.post(B + "/categories", headers=ADM, json={"name": name, **kw}).json()


P = cat(f"Parent {tag}", catalogueType="adult", shortDescription="Court", description="Long", seoTitle="Titre SEO", seoDescription="Desc SEO",
        translations={"en": {"name": f"Parent EN {tag}", "shortDescription": "Short"}, "ar": {"name": "الأب"}})
S1 = cat(f"Enfant un {tag}", parentId=P["id"]); S2 = cat(f"Enfant deux {tag}", parentId=P["id"]); E = cat(f"Vide {tag}", catalogueType="adult")
K = cat(f"Univers {tag}", catalogueType="kids")
t1, t2, t3, t4 = talk(f"V1 {tag}", S1["id"]), talk(f"V2 {tag}", S1["id"]), talk(f"V3 {tag}", P["id"]), talk(f"V4 {tag}", S2["id"])
requests.post(f"{B}/categories/{S2['id']}/talks", headers=ADM, json={"add": [t1]})  # t1 : principale S1 + supplémentaire S2

g = lambda slug, lang="fr": requests.get(f"{B}/catalogue/categories/{slug}", params={"lang": lang})
r = g(P["slug"]); d = r.json()
ok(r.status_code == 200 and d["count"] == 4, f"compteur du parent = 4 vidéos distinctes, sous-catégories comprises ({d.get('count')})")
ok(d["root"]["slug"] == P["slug"] and [c["slug"] for c in d["children"]] == [S1["slug"], S2["slug"]], "sous-catégories dans l'ordre d'affichage")
ok([c["count"] for c in d["children"]] == [2, 2], "compteurs des sous-catégories (une vidéo dans deux catégories est comptée dans chacune)")
ok(d["seoTitle"] == "Titre SEO" and d["description"] == "Long" and d["breadcrumbs"] == [{"slug": P["slug"], "name": P["name"]}], "SEO, description et fil d'Ariane")
c = g(S1["slug"]).json()
ok(c["root"]["slug"] == P["slug"] and len(c["breadcrumbs"]) == 2 and len(c["children"]) == 2, "sous-catégorie : parent, frères et fil d'Ariane à deux niveaux")

en = g(P["slug"], "en").json(); ar = g(P["slug"], "ar").json()
ok(en["name"] == f"Parent EN {tag}" and en["shortDescription"] == "Short" and en["description"] == "Long", "anglais : nom et description courte traduits, le reste retombe sur le français")
ok(ar["name"] == "الأب" and ar["seoTitle"] == "Titre SEO", "arabe : nom traduit, SEO de repli en français")
ok(requests.get(f"{B}/catalogue/categories/{P['slug']}?lang=zz").status_code == 400, "langue inconnue refusée")

lst = requests.get(B + "/catalogue/categories").json()
mine = next(x for x in lst["categories"] if x["slug"] == P["slug"])
ok(mine["count"] == 4 and len(mine["children"]) == 2 and lst["total"] >= 4, "liste : tuile avec compteur et sous-catégories")
ok(any(x["slug"] == E["slug"] and x["count"] == 0 for x in lst["categories"]), "catégorie vide : présente avec 0 vidéo")
ok(not any(x["slug"] == K["slug"] for x in lst["categories"]) and g(K["slug"]).status_code == 404, "univers Kids : absent du catalogue adultes (liste et page 404)")

# Visibilité : un brouillon ne compte pas ; une vidéo réservée aux enfants non plus
requests.patch(f"{B}/talks/{t3}", headers=ADM, json={"publication": "draft"})
ok(g(P["slug"]).json()["count"] == 3, "un brouillon n'est pas compté")
cur.execute("update talks set show_adults=false where id=%s", (t4,))
ok(g(P["slug"]).json()["count"] == 2, "une vidéo réservée aux enfants n'est pas comptée")
ok(requests.get(B + "/talks", params={"category": P["id"], "limit": 24}).json() and len(requests.get(B + "/talks", params={"category": P["id"], "limit": 24}).json()) == 2, "GET /talks?category= : mêmes vidéos que le compteur")
pg = requests.get(B + "/talks", params={"category": P["id"], "limit": 1, "offset": 1}).json(); ok(len(pg) == 1, "pagination par décalage")

# Sitemap : seulement les catégories qui ont des vidéos visibles
sm = requests.get(B + "/seo/sitemap").json()["categories"]
ok(any(x["slug"] == P["slug"] for x in sm) and not any(x["slug"] == E["slug"] for x in sm), "sitemap : catégories non vides seulement")

# Désactivation : disparaît (page 404, liste, sitemap), ses sous-catégories aussi
requests.patch(f"{B}/categories/{P['id']}", headers=ADM, json={"isActive": False})
ok(g(P["slug"]).status_code == 404 and g(S1["slug"]).status_code == 404, "catégorie désactivée : 404, sous-catégories comprises")
ok(not any(x["slug"] == P["slug"] for x in requests.get(B + "/catalogue/categories").json()["categories"]), "catégorie désactivée : absente de la liste")
ok(g("n-existe-pas").status_code == 404 and g("Pas Valide").status_code in (400, 404), "slug inconnu ou invalide")

for t in (t1, t2, t3, t4):
    requests.delete(f"{B}/talks/{t}", headers=ADM)
cur.execute("delete from categories where name like %s", (f"%{tag}%",))
print("\nTOUT EST OK")
