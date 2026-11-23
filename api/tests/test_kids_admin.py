"""Administration → Kids & profils familiaux : GET /admin/kids — droits, agrégats réels, aucune identité d'enfant.
Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, json, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:6]
email = f"kadm-{tag}@test.local"
r = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Parent"})
M = {"authorization": "Bearer " + r.json()["token"]}
ok(requests.get(B + "/admin/kids").status_code == 401, "sans jeton : refusé")
ok(requests.get(B + "/admin/kids", headers=M).status_code == 403, "membre : refusé")

before = requests.get(B + "/admin/kids", headers=A).json()
for k in ("families", "profiles", "byBand", "limits", "usage", "daily", "actions", "learning", "catalogue", "top"):
    ok(k in before, f"réponse : {k}")
ok(len(before["daily"]) == 14 and [b["band"] for b in before["byBand"]] == ["3-5", "6-8", "9-12", "13-15"], "14 jours et 4 tranches d'âge")

cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
secret = f"Prenom{tag}"
cur.execute("insert into kid_profiles(user_id,name,band,daily_limit_min) values(%s,%s,'6-8',30) returning id", (uid, secret)); p1 = cur.fetchone()[0]
cur.execute("insert into kid_profiles(user_id,name,band,catalog_mode) values(%s,%s,'3-5','selected') returning id", (uid, "Autre" + tag)); p2 = cur.fetchone()[0]
cur.execute("insert into kid_usage(profile_id,day,seconds) values(%s,current_date,1200)", (p1,))
cur.execute("insert into kid_actions(profile_id,title,status) values(%s,'Aider','claimed')", (p1,))
cur.execute("update users set kids_pin_hash='x' where id=%s", (uid,))
after = requests.get(B + "/admin/kids", headers=A).json()
ok(after["profiles"] == before["profiles"] + 2 and after["families"] == before["families"] + 1, "2 profils, 1 famille de plus")
ok(after["limits"]["withDailyLimit"] == before["limits"]["withDailyLimit"] + 1 and after["limits"]["selectedCatalog"] == before["limits"]["selectedCatalog"] + 1, "limite et catalogue choisi comptés")
ok(after["limits"]["parentsWithPin"] == before["limits"]["parentsWithPin"] + 1, "code parental compté")
ok(after["usage"]["active7"] == before["usage"]["active7"] + 1 and after["usage"]["minutes7"] == before["usage"]["minutes7"] + 20, "20 minutes et 1 enfant actif")
ok(after["actions"]["waiting"] == before["actions"]["waiting"] + 1, "action en attente de validation comptée")
ok(after["daily"][-1]["minutes"] >= 20 and after["daily"][-1]["active"] >= 1, "courbe : aujourd'hui")
b = {x["band"]: x["profiles"] for x in after["byBand"]}; b0 = {x["band"]: x["profiles"] for x in before["byBand"]}
ok(b["6-8"] == b0["6-8"] + 1 and b["3-5"] == b0["3-5"] + 1, "tranches d'âge")
ok(secret not in json.dumps(after) and "Autre" + tag not in json.dumps(after) and email not in json.dumps(after), "aucun prénom d'enfant ni adresse de parent")
cur.execute("delete from users where id=%s", (uid,))
ok(requests.get(B + "/admin/kids", headers=A).json()["profiles"] == before["profiles"], "suppression du compte : profils supprimés")
print("test_kids_admin : TOUT OK")
