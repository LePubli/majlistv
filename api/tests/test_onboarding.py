"""12.4 : inscription courte + préférences (GET/PUT /me/preferences) + rangées « pour vous ». Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
email = f"nouveau.{tag}@test.local"
r = requests.post(f"{B}/auth/register", json={"email": email, "password": "MotDePasse-123"})
ok(r.status_code == 201, "inscription avec e-mail + mot de passe seulement")
tok = r.json()["token"]; H = {"Authorization": f"Bearer {tok}"}
ok(r.json()["user"]["name"] == f"nouveau.{tag}", "nom par défaut = début de l'e-mail")

ok(requests.get(f"{B}/me/preferences").status_code == 401, "préférences : connexion requise")
p = requests.get(f"{B}/me/preferences", headers=H).json()
ok(p["subLang"] is None and p["categories"] == [] and p["onboarded"] is False, "état initial : rien de choisi, pas encore accueilli")

# catégories de test : cb a moins de conférences que ca, donc passe après dans l'ordre naturel
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
ids = []
for n in (f"CA{tag}", f"CB{tag}"):
    cur.execute("insert into categories(name) values(%s) returning id", (n,)); ids.append(cur.fetchone()[0])
ca, cb = ids
for i in range(3):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,category_id,publication,video_status) values(%s,'X','youtube','abc',%s,%s,'published','ready')", (f"A{i}{tag}", aid, ca))
cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,category_id,publication,video_status) values(%s,'X','youtube','abc',%s,%s,'published','ready')", (f"B{tag}", aid, cb))

keys = lambda h: [x["key"] for x in requests.get(f"{B}/home", headers=h).json()["rows"]]
anon = keys({})
ok(anon.index(f"cat:{ca}") < anon.index(f"cat:{cb}"), "visiteur : ordre naturel (la plus fournie d'abord)")

r = requests.put(f"{B}/me/preferences", headers=H, json={"subLang": "ar", "categories": [cb, 999999], "name": "Yacine"})
ok(r.status_code == 200, "enregistrement des préférences")
p = r.json()
ok(p["subLang"] == "ar" and p["name"] == "Yacine" and p["onboarded"] is True, "langue, prénom et accueil enregistrés")
ok(p["categories"] == [cb], "catégorie inconnue ignorée")
ok(requests.get(f"{B}/me/preferences", headers=H).json()["categories"] == [cb], "relecture identique")

k = keys(H)
ok(k[0] == "new" or k[0] == f"cat:{cb}", "« Nouveautés » reste en tête ou la catégorie préférée passe devant")
ok(k.index(f"cat:{cb}") < k.index(f"cat:{ca}"), "connecté : la catégorie préférée passe avant les autres")
rows = requests.get(f"{B}/home", headers=H).json()["rows"]
ok([x.get("forYou") for x in rows if x["key"] == f"cat:{cb}"] == [True], "rangée marquée forYou")
ok(keys({}).index(f"cat:{ca}") < keys({}).index(f"cat:{cb}"), "visiteur non affecté")

ok(requests.put(f"{B}/me/preferences", headers=H, json={"subLang": "xx"}).status_code == 400, "langue inconnue : 400")
ok(requests.put(f"{B}/me/preferences", headers=H, json={"role": "admin"}).status_code == 400, "champ inconnu refusé (schéma strict)")
ok(requests.put(f"{B}/me/preferences", headers=H, json={"categories": list(range(1, 14))}).status_code == 400, "13 catégories : 400")
ok(requests.put(f"{B}/me/preferences", headers=H, json={"name": ""}).status_code == 400, "prénom vide refusé")
r = requests.put(f"{B}/me/preferences", headers=H, json={"subLang": None, "categories": []})
ok(r.json()["subLang"] is None and r.json()["categories"] == [] and r.json()["name"] == "Yacine", "effacer sans toucher au prénom")
ok(requests.put(f"{B}/me/preferences", headers=H, json={}).status_code == 200, "corps vide accepté")

# retour après paiement : returnTo invalide ne doit pas casser (validation côté serveur, sans Stripe : 4xx/5xx propre, jamais 500 de validation)
r = requests.post(f"{B}/billing/checkout", headers=H, json={"plan": "monthly", "returnTo": "//evil.example"})
ok(r.status_code in (400, 409, 422, 503), f"returnTo externe refusé ou paiement non configuré ({r.status_code})")

cur.execute("delete from talks where title like %s", (f"%{tag}",)); cur.execute("delete from categories where id in (%s,%s)", (ca, cb))
cur.execute("delete from users where email=%s", (email,))
print("TOUT OK")
