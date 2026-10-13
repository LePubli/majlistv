"""24.1 : niveaux de difficulté (conférences et séries) et prérequis entre séries. Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(title, level=None):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,level) values(%s,%s,'Cheikh','youtube','abc',%s,'published','ready','free',600,%s) returning id",
                (f"{title}{tag}", f"Description {title}", aid, level))
    return str(cur.fetchone()[0])


deb, inter, avan, sans = mk("Debutant", "beginner"), mk("Inter", "intermediate"), mk("Avance", "advanced"), mk("Sans")

# --- conférences
d = requests.get(f"{B}/talks/{deb}").json()
ok(d["level"] == "beginner", "conférence : le niveau est renvoyé")
ok(requests.get(f"{B}/talks/{sans}").json()["level"] is None, "sans niveau : vide (tous niveaux)")
lst = requests.get(f"{B}/talks", params={"q": tag, "level": "beginner"}).json()
ok([x["id"] for x in lst] == [deb], "catalogue : filtre par niveau")
ok(len(requests.get(f"{B}/talks", params={"q": tag}).json()) == 4, "sans filtre : toutes les conférences")
ok(requests.get(f"{B}/talks", params={"level": "expert"}).status_code == 400, "niveau inconnu refusé")

# --- modification par l'organisateur
r = requests.patch(f"{B}/talks/{sans}", headers=adm, json={"level": "advanced"})
ok(r.status_code == 200 and requests.get(f"{B}/talks/{sans}").json()["level"] == "advanced", "le niveau se modifie dans le Studio")
requests.patch(f"{B}/talks/{sans}", headers=adm, json={"level": None})
ok(requests.get(f"{B}/talks/{sans}").json()["level"] is None, "le niveau se retire (retour à tous niveaux)")
ok(requests.patch(f"{B}/talks/{sans}", headers=adm, json={"level": "facile"}).status_code == 400, "niveau invalide refusé à l'enregistrement")

# --- recherche
s = requests.get(f"{B}/search", params={"q": tag, "level": "intermediate"}).json()
ok([h["id"] for h in s["hits"]] == [inter] and s["hits"][0]["level"] == "intermediate", "recherche : filtre et niveau renvoyé")

# --- accueil : rangée « Pour commencer »
rows = requests.get(f"{B}/home").json()["rows"]
beg = next((r for r in rows if r["key"] == "beginner"), None)
ok(beg is not None and deb in [t["id"] for t in beg["talks"]], "accueil : rangée « Pour commencer » avec les conférences débutant")
ok(all(t.get("level") == "beginner" for t in beg["talks"]), "accueil : seulement du niveau débutant")
requests.put(f"{B}/admin/settings", headers=adm, json={"values": {"home_row_beginner": "false"}})
ok(not any(r["key"] == "beginner" for r in requests.get(f"{B}/home").json()["rows"]), "réglage : la rangée peut être masquée")
requests.put(f"{B}/admin/settings", headers=adm, json={"values": {"home_row_beginner": None}})

# --- séries
base = requests.post(f"{B}/series", headers=adm, json={"title": f"Bases {tag}", "level": "beginner", "access": "free"}).json()["id"]
suite = requests.post(f"{B}/series", headers=adm, json={"title": f"Suite {tag}", "level": "advanced"}).json()["id"]
ok(requests.get(f"{B}/series/{base}/manage", headers=adm).json()["level"] == "beginner", "série : niveau enregistré à la création")
requests.put(f"{B}/series/{base}/episodes", headers=adm, json={"episodes": [{"talkId": deb}]})
requests.put(f"{B}/series/{suite}/episodes", headers=adm, json={"episodes": [{"talkId": avan}]})
requests.patch(f"{B}/series/{base}", headers=adm, json={"published": True})
requests.patch(f"{B}/series/{suite}", headers=adm, json={"published": True})
ok([x["id"] for x in requests.get(f"{B}/series", params={"level": "beginner"}).json() if x["id"] in (base, suite)] == [base], "liste des séries : filtre par niveau")
ok(requests.get(f"{B}/series/{base}").json()["level"] == "beginner", "page série : niveau renvoyé")

# --- prérequis
r = requests.patch(f"{B}/series/{suite}", headers=adm, json={"prerequisites": [base]})
ok(r.status_code == 200, "prérequis enregistré")
pre = requests.get(f"{B}/series/{suite}").json()["prerequisites"]
ok([p["id"] for p in pre] == [base] and pre[0]["title"] == f"Bases {tag}" and pre[0]["level"] == "beginner", "page série : « conseillé après » avec titre et niveau")
ok(requests.get(f"{B}/series/{base}").json()["prerequisites"] == [], "série sans prérequis : liste vide")
ok(requests.patch(f"{B}/series/{suite}", headers=adm, json={"prerequisites": [suite]}).status_code == 400, "une série ne peut pas être son propre prérequis")
ok(requests.patch(f"{B}/series/{base}", headers=adm, json={"prerequisites": [suite]}).status_code == 400, "prérequis circulaire refusé")
ok(requests.patch(f"{B}/series/{suite}", headers=adm, json={"prerequisites": [str(uuid.uuid4())]}).status_code == 400, "série prérequise inconnue refusée")
requests.patch(f"{B}/series/{base}", headers=adm, json={"published": False})
ok(requests.get(f"{B}/series/{suite}").json()["prerequisites"] == [], "prérequis en brouillon : masqué au public")
ok([p["id"] for p in requests.get(f"{B}/series/{suite}/manage", headers=adm).json()["prerequisites"]] == [base], "Studio : le prérequis en brouillon reste visible du propriétaire")
requests.patch(f"{B}/series/{base}", headers=adm, json={"published": True})
r = requests.patch(f"{B}/series/{suite}", headers=adm, json={"prerequisites": []})
ok(r.status_code == 200 and requests.get(f"{B}/series/{suite}").json()["prerequisites"] == [], "prérequis retiré")
ok(requests.patch(f"{B}/series/{suite}", headers=adm, json={"level": None}).status_code == 200 and requests.get(f"{B}/series/{suite}").json()["level"] is None, "niveau de série retiré")
ok(requests.patch(f"{B}/series/{suite}", headers=adm, json={"prerequisites": [base, base]}).status_code == 200, "doublon de prérequis accepté sans erreur (dédoublonné)")
ok(len(requests.get(f"{B}/series/{suite}").json()["prerequisites"]) == 1, "doublon : une seule ligne enregistrée")

# --- suppression d'une série : le prérequis disparaît avec elle
requests.delete(f"{B}/series/{base}", headers=adm)
ok(requests.get(f"{B}/series/{suite}").json()["prerequisites"] == [], "série supprimée : retirée des prérequis")
print("TOUT EST OK")
