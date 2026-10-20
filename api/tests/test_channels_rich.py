"""Chaînes riches + plusieurs chaînes (migration 060) : création, champs, droits propriétaire/éditeur, équipe, suppression,
conférence à la une, fiche publique, et vidéo SANS chaîne toujours possible. Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]
made_users, made_talks = [], []


def cleanup():
    for t in made_talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from speakers where slug like %s", (f"%{tag}%",))
    for u in made_users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def mk(role, label):
    email = f"cr-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label.title()} {tag}"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]; made_users.append(uid)
    return uid, email, {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}


a_id, a_mail, A = mk("organizer", "orga"); b_id, b_mail, Bh = mk("organizer", "orgb"); u_id, u_mail, U = mk("user", "membre")
NAME = f"Cheikh Riche {tag}"; SLUG = f"cheikh-riche-{tag}"

# --- Création : même sans conférence ; doublon refusé ; simple membre refusé
r = requests.post(B + "/studio/channels", json={"name": NAME}, headers=A)
ok(r.status_code == 201 and r.json()["slug"] == SLUG, "création d'une chaîne vide")
ok(requests.post(B + "/studio/channels", json={"name": NAME}, headers=Bh).status_code == 409, "nom déjà pris : 409")
ok(requests.post(B + "/studio/channels", json={"name": "X"}, headers=U).status_code == 403, "un simple membre ne crée pas de chaîne")
r2 = requests.post(B + "/studio/channels", json={"name": f"Seconde {tag}"}, headers=A)
ok(r2.status_code == 201, "une même personne peut avoir plusieurs chaînes")
d = requests.get(B + "/studio/channels", headers=A).json()
mine = {c["slug"]: c for c in d["channels"]}
ok(SLUG in mine and f"seconde-{tag}" in mine and mine[SLUG]["myRole"] == "owner", "les deux chaînes sont listées, rôle propriétaire")
ok(mine[SLUG]["keyName"] == NAME and mine[SLUG]["talks"] == 0, "graphie à saisir sur une conférence + 0 conférence")

# --- Champs riches
body = {"tagline": "Des conférences qui éclairent", "website": "https://exemple.org", "contactEmail": "contact@exemple.org",
        "socials": {"youtube": "https://youtube.com/@x", "instagram": ""}, "country": "France", "mainLanguage": "fr"}
r = requests.put(f"{B}/studio/channels/{SLUG}", json=body, headers=A)
ok(r.status_code == 200, "le propriétaire enregistre les champs riches")
for bad in ({"website": "http://non-https.org"}, {"website": "javascript:alert(1)"}, {"contactEmail": "pas-un-mail"}, {"socials": {"myspace": "https://x.org"}},
            {"socials": {"x": "ftp://x.org"}}, {"tagline": "x" * 101}, {"mainLanguage": "Francais!"}):
    ok(requests.put(f"{B}/studio/channels/{SLUG}", json=bad, headers=A).status_code == 400, f"refusé : {list(bad)[0]} = {str(list(bad.values())[0])[:20]}")
c = {x["slug"]: x for x in requests.get(B + "/studio/channels", headers=A).json()["channels"]}[SLUG]
ok(c["tagline"] == body["tagline"] and c["socials"] == {"youtube": "https://youtube.com/@x"} and c["country"] == "France", "valeurs relues (réseau vide retiré)")

# --- Conférence à la une : doit porter le nom de la chaîne
def talk(speaker, org, pub="published"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d',%s,'youtube',%s,%s,%s,'ready','free',600) returning id",
                (f"Conf {speaker or 'libre'} {tag}", speaker, "v" + uuid.uuid4().hex[:9], org, pub)); tid = cur.fetchone()[0]; made_talks.append(tid); return str(tid)


t_in = talk(NAME, a_id); t_other = talk(f"Autre {tag}", a_id); t_free = talk("", a_id)
cur.execute("select speaker from talks where id=%s", (t_free,))
ok(cur.fetchone()[0] == "", "une conférence SANS chaîne (intervenant vide) existe et reste valide")
ok(requests.put(f"{B}/studio/channels/{SLUG}", json={"featuredTalkId": t_other}, headers=A).status_code == 400, "à la une : conférence d'une autre chaîne refusée")
ok(requests.put(f"{B}/studio/channels/{SLUG}", json={"featuredTalkId": t_in}, headers=A).status_code == 200, "à la une : conférence de la chaîne acceptée")
pub = requests.get(f"{B}/channels/{SLUG}").json()
ok(pub["tagline"] == body["tagline"] and pub["website"] == "https://exemple.org" and pub["featured"] and pub["featured"]["id"] == t_in, "fiche publique : accroche, site, conférence à la une")
ok(requests.get(f"{B}/seo/speakers/{SLUG}").json().get("tagline") == body["tagline"], "SEO : champs riches présents")
cur.execute("update talks set publication='draft' where id=%s", (t_in,))
ok(requests.get(f"{B}/channels/{SLUG}").status_code == 404 or requests.get(f"{B}/channels/{SLUG}").json()["featured"] is None, "brouillon : jamais à la une publique")
cur.execute("update talks set publication='published' where id=%s", (t_in,))
ok(requests.put(f"{B}/studio/channels/{SLUG}", json={"featuredTalkId": None}, headers=A).status_code == 200, "retirer la conférence à la une")

# --- Équipe : propriétaire seulement ; éditeur modifie la page mais pas l'équipe
ok(requests.put(f"{B}/studio/channels/{SLUG}", json={"tagline": "pirate"}, headers=Bh).status_code == 403, "un autre organisateur ne peut pas modifier")
ok(requests.post(f"{B}/studio/channels/{SLUG}/members", json={"email": b_mail}, headers=Bh).status_code == 403, "un étranger ne gère pas l'équipe")
ok(requests.post(f"{B}/studio/channels/{SLUG}/members", json={"email": u_mail}, headers=A).status_code == 400, "un simple membre ne peut pas être éditeur")
ok(requests.post(f"{B}/studio/channels/{SLUG}/members", json={"email": a_mail}, headers=A).status_code == 400, "le propriétaire n'est pas ajouté comme éditeur")
r = requests.post(f"{B}/studio/channels/{SLUG}/members", json={"email": b_mail}, headers=A)
ok(r.status_code == 201 and [m["email"] for m in r.json()] == [b_mail], "éditeur ajouté")
ok(requests.put(f"{B}/studio/channels/{SLUG}", json={"tagline": "Par l'éditeur"}, headers=Bh).status_code == 200, "l'éditeur modifie la page")
d = requests.get(B + "/studio/channels", headers=Bh).json()
ok(SLUG in {c["slug"] for c in d["channels"]} and {c["slug"]: c for c in d["channels"]}[SLUG]["myRole"] == "editor", "l'éditeur voit la chaîne (rôle éditeur)")
ok(requests.put(f"{B}/studio/channels/{SLUG}/owner", json={"ownerId": None}, headers=Bh).status_code == 403, "l'éditeur ne change pas le propriétaire")
ok(requests.get(f"{B}/studio/channels/{SLUG}/members", headers=Bh).status_code == 403, "l'éditeur ne voit pas la gestion d'équipe")
ok(requests.delete(f"{B}/studio/channels/{SLUG}", headers=Bh).status_code == 403, "l'éditeur ne supprime pas la chaîne")
ok(len(requests.get(f"{B}/studio/channels/{SLUG}/members", headers=A).json()) == 1, "le propriétaire voit son équipe")
ok(requests.delete(f"{B}/studio/channels/{SLUG}/members/{b_id}", headers=A).status_code == 204, "éditeur retiré")
ok(requests.put(f"{B}/studio/channels/{SLUG}", json={"tagline": "re"}, headers=Bh).status_code == 403, "ancien éditeur : plus de droits")

# --- Suppression : refusée tant qu'il y a des conférences ; permise une fois vide
ok(requests.delete(f"{B}/studio/channels/{SLUG}", headers=A).status_code == 409, "suppression refusée : la chaîne contient une conférence")
cur.execute("update talks set speaker='' where id=%s", (t_in,))
ok(requests.delete(f"{B}/studio/channels/{SLUG}", headers=A).status_code == 204, "chaîne vide supprimée")
ok(SLUG not in {c["slug"] for c in requests.get(B + "/studio/channels", headers=A).json()["channels"]}, "plus listée")
cleanup()
print("Chaînes riches : tout est bon")
