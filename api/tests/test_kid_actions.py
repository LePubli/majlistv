"""Kids « Mes petites actions » : le parent propose, l'enfant déclare « fait », le parent valide.
Prérequis : API (3055) redémarrée avec la migration 054, PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429:
        time.sleep(62); r = requests.request(method, B + path, headers=headers, **kw)
    return r


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def parent():
    email = f"ka-{uuid.uuid4().hex[:6]}@test.local"
    rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Parent"})
    cur.execute("update users set role='admin' where email=%s", (email,))  # un administrateur peut utiliser Kids sans abonnement
    H = login(email, "Passw0rd-test")
    rq("PUT", "/me/kids/pin", headers=H, json={"code": "2468"})
    return H


def kid(H, name):
    pid = rq("POST", "/me/kids/profiles", headers=H, json={"name": name, "band": "7-10"}).json()["id"]
    return {"authorization": "Bearer " + rq("POST", f"/me/kids/profiles/{pid}/enter", headers=H).json()["token"]}, pid


P1 = parent(); K1, p1 = kid(P1, "Yacine")
P2 = parent(); K2, p2 = kid(P2, "Salma")

# --- le parent propose
ok(rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P1, json={"title": ""}).status_code == 400, "titre vide refusé")
ok(rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P1, json={"title": "x" * 121}).status_code == 400, "titre trop long refusé")
r = rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P1, json={"title": "  Dire bonjour avec le sourire  "}); ok(r.status_code == 201, "le parent propose une action"); a1 = r.json()["id"]
a2 = rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P1, json={"title": "Aider à ranger ma chambre"}).json()["id"]
d = rq("GET", f"/me/kids/profiles/{p1}/actions", headers=P1).json()
ok(d["counts"] == {"todo": 2, "claimed": 0, "validated": 0} and d["actions"][0]["title"] in ("Dire bonjour avec le sourire", "Aider à ranger ma chambre"), "liste du parent : 2 à faire, titre nettoyé")
ok(any(a["title"] == "Dire bonjour avec le sourire" for a in d["actions"]), "espaces autour du titre retirés")

# --- isolation
ok(rq("GET", f"/me/kids/profiles/{p1}/actions", headers=P2).status_code == 404, "un autre parent ne voit pas les actions")
ok(rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P2, json={"title": "Intrus"}).status_code == 404, "un autre parent ne peut pas en ajouter")
ok(rq("POST", f"/me/kids/profiles/{p1}/actions/{a1}/validate", headers=P2).status_code == 404, "un autre parent ne peut pas valider")
ok(rq("DELETE", f"/me/kids/profiles/{p1}/actions/{a1}", headers=P2).status_code == 404, "un autre parent ne peut pas supprimer")
ok(rq("GET", "/kids/actions", headers=K2).json()["actions"] == [], "l'enfant d'un autre parent ne voit rien")
ok(rq("POST", f"/kids/actions/{a1}/claim", headers=K2).status_code == 404, "un autre enfant ne peut pas déclarer l'action")

# --- l'enfant
ka = rq("GET", "/kids/actions", headers=K1).json()
ok(len(ka["actions"]) == 2 and ka["counts"]["todo"] == 2, "l'enfant voit ses 2 actions")
ok(rq("POST", f"/kids/actions/{a1}/claim", headers=K1).status_code == 200, "l'enfant dit « je l'ai fait »")
ok(rq("POST", f"/kids/actions/{a1}/claim", headers=K1).status_code == 404, "on ne déclare pas deux fois")
ok(rq("GET", "/kids/actions", headers=K1).json()["counts"] == {"todo": 1, "claimed": 1, "validated": 0}, "compteurs : 1 à faire, 1 en attente")
ok(rq("POST", f"/me/kids/profiles/{p1}/actions/{a1}/validate", headers=K1).status_code in (401, 403), "l'enfant ne peut pas valider (jeton enfant refusé)")
ok(rq("GET", f"/me/kids/profiles/{p1}/actions", headers=K1).status_code in (401, 403), "l'enfant n'accède pas à l'écran du parent")
ok(rq("POST", f"/kids/actions/{a1}/claim", headers=P1).status_code in (401, 403), "le jeton du parent n'est pas un jeton enfant")
ok(rq("GET", "/kids/summary", headers=K1).json()["actions"] == {"todo": 1, "claimed": 1, "validated": 0}, "le résumé de l'enfant contient les compteurs")

# --- le parent valide
ok(rq("POST", f"/me/kids/profiles/{p1}/actions/{a1}/validate", headers=P1).status_code == 200, "le parent valide l'action déclarée")
ok(rq("POST", f"/me/kids/profiles/{p1}/actions/{a1}/validate", headers=P1).status_code == 404, "déjà validée : refusé")
ok(rq("POST", f"/me/kids/profiles/{p1}/actions/{a2}/validate", headers=P1).status_code == 200, "le parent peut valider sans attendre l'enfant")
ok(rq("GET", f"/me/kids/profiles/{p1}/actions", headers=P1).json()["counts"] == {"todo": 0, "claimed": 0, "validated": 2}, "2 validées")
ok(rq("POST", f"/kids/actions/{a2}/claim", headers=K1).status_code == 404, "l'enfant ne peut pas rouvrir une action validée")

# --- suppression, limite, suppression du profil
ok(rq("DELETE", f"/me/kids/profiles/{p1}/actions/{a2}", headers=P1).status_code == 200, "le parent supprime une action")
for i in range(20):
    rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P1, json={"title": f"Action {i}"})
r = rq("POST", f"/me/kids/profiles/{p1}/actions", headers=P1, json={"title": "Une de trop"}); ok(r.status_code == 409 and r.json()["code"] == "limit", "limite de 20 actions en cours")
rq("DELETE", f"/me/kids/profiles/{p1}", headers=P1)
cur.execute("select count(*) from kid_actions where profile_id=%s", (p1,)); ok(cur.fetchone()[0] == 0, "supprimer le profil supprime ses actions")
print("\nKids actions : tout est bon")
