"""Étape C (chaînes) : synchronisation, propriétaire, droits organisateur / modérateur / administrateur, nom et présentation,
liste publique avec abonnés, interrupteur, journal. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]
made_users, made_talks = [], []


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def cleanup():
    for t in made_talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from speakers where slug like %s", (f"%{tag}%",))
    for u in made_users: cur.execute("delete from users where id=%s", (u,))
    cur.execute("delete from app_settings where key='feat_channels'")


def mk(role, label):
    email = f"ch-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label.title()} {tag}"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]; made_users.append(uid)
    return uid, {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}


ADMIN = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
a_id, A = mk("organizer", "orga"); b_id, Bh = mk("organizer", "orgb"); m_id, M = mk("moderator", "modo"); u_id, U = mk("user", "membre")


def talk(speaker, org):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d',%s,'youtube',%s,%s,'published','ready','free',600) returning id",
                (f"Conf {speaker}", speaker, "v" + uuid.uuid4().hex[:9], org)); made_talks.append(cur.fetchone()[0])


S1, S2 = f"Cheikh Alpha {tag}", f"Cheikh Beta {tag}"
talk(S1, a_id); talk(S1, a_id); talk(S1, b_id); talk(S2, b_id)
SLUG1, SLUG2 = f"cheikh-alpha-{tag}", f"cheikh-beta-{tag}"

# --- Synchronisation et propriétaire par défaut (celui qui a le plus de conférences)
r = requests.get(B + "/studio/channels", headers=A); d = r.json()
ok(r.status_code == 200 and d["canAssign"] is False, "organisateur : liste de ses chaînes (sans droit d'attribution)")
ok([c["slug"] for c in d["channels"]] == [SLUG1], "l'organisateur A est propriétaire de la chaîne où il a le plus de conférences (et d'elle seule)")
ok(d["channels"][0]["talks"] == 3 and d["channels"][0]["name"] == S1, "chiffres et nom de la chaîne")
d = requests.get(B + "/studio/channels", headers=Bh).json()
ok([c["slug"] for c in d["channels"]] == [SLUG2], "l'organisateur B possède l'autre chaîne")
d = requests.get(B + "/studio/channels", headers=M).json()
ok(d["canAssign"] is True and {SLUG1, SLUG2} <= {c["slug"] for c in d["channels"]}, "modérateur : voit toutes les chaînes et peut attribuer")
ok(requests.get(B + "/studio/channels", headers=U).status_code == 403, "un simple membre n'a pas accès")

# --- Nom et présentation : propriétaire, modérateur ; pas un autre organisateur
r = requests.put(f"{B}/studio/channels/{SLUG1}", json={"name": f"Chaîne Alpha {tag}", "bio": "Ma présentation."}, headers=A)
ok(r.status_code == 200 and r.json()["name"] == f"Chaîne Alpha {tag}", "le propriétaire modifie nom et présentation")
ok(requests.put(f"{B}/studio/channels/{SLUG1}", json={"bio": "Piratage"}, headers=Bh).status_code == 403, "un autre organisateur ne peut pas modifier la chaîne")
ok(requests.put(f"{B}/studio/channels/{SLUG1}", json={}, headers=A).status_code == 400, "demande vide refusée")
ok(requests.put(f"{B}/studio/channels/inconnue-{tag}", json={"bio": "x"}, headers=M).status_code == 404, "chaîne inconnue : 404")
ok(requests.put(f"{B}/studio/channels/{SLUG1}", json={"bio": "Présentation corrigée par la modération."}, headers=M).status_code == 200, "le modérateur peut corriger la présentation")

# --- Attribution : modérateur / administrateur seulement
ok(requests.put(f"{B}/studio/channels/{SLUG1}/owner", json={"ownerId": b_id}, headers=A).status_code == 403, "un organisateur ne peut pas attribuer une chaîne")
ok(requests.put(f"{B}/studio/channels/{SLUG1}/owner", json={"ownerId": u_id}, headers=M).status_code == 400, "un simple membre ne peut pas être propriétaire")
r = requests.put(f"{B}/studio/channels/{SLUG1}/owner", json={"ownerId": b_id}, headers=M)
ok(r.status_code == 200 and r.json()["ownerId"] == str(b_id), "le modérateur attribue la chaîne à l'organisateur B")
ok(requests.put(f"{B}/studio/channels/{SLUG1}", json={"bio": "Ancien propriétaire"}, headers=A).status_code == 403, "l'ancien propriétaire perd la main")
ok(requests.put(f"{B}/studio/channels/{SLUG1}", json={"bio": "Nouveau propriétaire"}, headers=Bh).status_code == 200, "le nouveau propriétaire gère la chaîne")
ok({c["slug"] for c in requests.get(B + "/studio/channels", headers=Bh).json()["channels"]} == {SLUG1, SLUG2}, "B voit maintenant ses deux chaînes")
ok(requests.put(f"{B}/studio/channels/{SLUG1}/owner", json={"ownerId": None}, headers=ADMIN).status_code == 200, "l'administrateur retire le propriétaire")
ok(requests.get(B + "/studio/channels", headers=A).json()["channels"] == [], "plus aucune chaîne chez A")
owners = requests.get(B + "/studio/channel-owners", headers=M).json()
ok({str(a_id), str(b_id), str(m_id)} <= {o["id"] for o in owners} and str(u_id) not in {o["id"] for o in owners}, "liste des propriétaires possibles : organisateurs, modérateurs, administrateurs")
ok(requests.get(B + "/studio/channel-owners", headers=A).status_code == 403, "liste réservée à la modération")

# --- Public : nouveau nom, abonnés, ancien point d'accès /speakers cohérent
requests.put(f"{B}/speakers/{SLUG1}/follow", headers=U)
pub = {c["slug"]: c for c in requests.get(B + "/channels").json()}
ok(pub[SLUG1]["name"] == f"Chaîne Alpha {tag}" and pub[SLUG1]["followers"] == 1 and pub[SLUG1]["talks"] == 3, "liste publique : nom de la chaîne, abonnés, conférences")
one = requests.get(f"{B}/channels/{SLUG1}").json()
ok(one["bio"] == "Nouveau propriétaire" and one["followers"] == 1, "fiche publique : présentation et abonnés")
ok({s["slug"]: s for s in requests.get(B + "/speakers").json()}[SLUG1]["name"] == f"Chaîne Alpha {tag}", "/speakers (ancien) renvoie le même nom")
ok(requests.get(f"{B}/channels/inconnue-{tag}").status_code == 404, "chaîne publique inconnue : 404")

# --- L'ancien éditeur de présentation (admin) ne supprime pas la chaîne quand on vide le texte
requests.put(f"{B}/admin/speakers/{SLUG2}", json={"bio": ""}, headers=ADMIN)
cur.execute("select count(*), max(name) from speakers where slug=%s", (SLUG2,)); n, nm = cur.fetchone()
ok(n == 1 and nm == S2, "vider la présentation conserve la chaîne (nom, propriétaire)")

# --- Une édition de nom du côté des conférences ne réécrit pas le nom choisi
cur.execute("update talks set speaker=%s where speaker=%s", (f"cheikh alpha {tag}", S1))
requests.get(B + "/studio/channels", headers=M)
cur.execute("select name from speakers where slug=%s", (SLUG1,))
ok(cur.fetchone()[0] == f"Chaîne Alpha {tag}", "la synchronisation respecte le nom modifié")

# --- Journal et interrupteur
time.sleep(1)
cur.execute("select summary from audit_log where route like '%%/studio/channels/%%' order by at desc limit 3")
ok(any("Chaîne" in (r[0] or "") for r in cur.fetchall()), "modifications de chaînes inscrites au journal")
assert requests.put(B + "/admin/features", json={"values": {"channels": False}}, headers=ADMIN).status_code == 200; time.sleep(5.3)
r = requests.get(B + "/channels"); r2 = requests.get(B + "/studio/channels", headers=A)
ok(r.status_code == 404 and r.json()["code"] == "feature_off" and r2.status_code == 404, "chaînes coupées : routes fermées")
ok(requests.get(B + "/speakers").status_code == 200, "l'ancien /speakers (référencement) reste ouvert")
assert requests.put(B + "/admin/features", json={"values": {"channels": True}}, headers=ADMIN).status_code == 200; time.sleep(5.3)
ok(requests.get(B + "/channels").status_code == 200, "chaînes rallumées")

cleanup()
print("TOUT EST BON", flush=True)
