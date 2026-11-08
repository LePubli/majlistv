"""Amélioration 6.9 : recherche globale de l'admin, changement de rôle en lot, suppression de vidéos en lot. Sans stockage S3.
Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


login = requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()
A = {"authorization": "Bearer " + login["token"]}
me = requests.get(B + "/auth/me", headers=A).json()
me_id = me.get("id") or me.get("user", {}).get("id")
tag = uuid.uuid4().hex[:6]

# ---------- Recherche ----------
cur.execute("insert into talks(organizer_id,title,speaker,source,video_ref) values(%s,%s,%s,'youtube','x') returning id", (me_id, f"Conférence Zébulon {tag}", f"Cheikh Zébulon {tag}"))
tid = str(cur.fetchone()[0])
us = []
for i in range(3):
    r = requests.post(B + "/admin/users", headers=A, json={"email": f"bulk{i}-{tag}@test.local", "name": f"Membre Zébulon{i} {tag}", "role": "user"})
    us.append(r.json().get("id") or r.json().get("user", {}).get("id"))
ok(all(us), "3 membres de test créés")
ok(requests.get(B + "/admin/search?q=Z", headers=A).status_code == 400, "recherche : 1 lettre refusée")
ok(requests.get(B + "/admin/search?q=Zébulon").status_code in (401, 403), "recherche : réservée aux administrateurs")
j = requests.get(B + "/admin/search", headers=A, params={"q": f"zébulon"}).json()
ok(any(t["id"] == tid for t in j["talks"]), "recherche : la conférence est trouvée (titre ou intervenant)")
ok({u["id"] for u in j["users"]} >= set(us), "recherche : les membres sont trouvés (nom)")
ok(any(s["name"].startswith("Cheikh Zébulon") for s in j["speakers"]), "recherche : l'intervenant est trouvé")
j = requests.get(B + "/admin/search", headers=A, params={"q": f"bulk1-{tag}@test"}).json()
ok(len(j["users"]) == 1 and j["users"][0]["email"].startswith("bulk1-"), "recherche : par e-mail")
j = requests.get(B + "/admin/search", headers=A, params={"q": "100%_"}).json()
ok(j["talks"] == [] and j["users"] == [], "recherche : % et _ traités comme des lettres (pas de joker)")

# ---------- Rôle en lot ----------
R = lambda ids, role: requests.post(B + "/admin/users/bulk-role", headers=A, json={"ids": ids, "role": role})
ok(R(us, "admin").status_code == 400, "rôle en lot : « administrateur » refusé")
ok(requests.post(B + "/admin/users/bulk-role", json={"ids": us, "role": "organizer"}).status_code in (401, 403), "rôle en lot : réservé aux administrateurs")
r = R(us + [me_id, str(uuid.uuid4())], "organizer").json()
ok(r["updated"] == 3, "rôle en lot : 3 membres passés organisateur")
reasons = {x["reason"] for x in r["skipped"]}
ok("ton propre compte" in reasons and "introuvable" in reasons, "rôle en lot : son propre compte et l'inconnu ignorés, avec la raison")
cur.execute("select role from users where id = any(%s::uuid[])", (us,))
ok({x[0] for x in cur.fetchall()} == {"organizer"}, "rôle en lot : bien enregistré en base")
r = R(us, "organizer").json()
ok(r["updated"] == 0 and all(x["reason"] == "a déjà ce rôle" for x in r["skipped"]), "rôle en lot : déjà ce rôle = ignoré")
cur.execute("update users set role='admin' where id=%s", (us[0],))
r = R(us, "moderator").json()
ok(r["updated"] == 2 and any("administrateur" in x["reason"] for x in r["skipped"]), "rôle en lot : un administrateur n'est jamais modifié")
ok(R([], "user").status_code == 400, "rôle en lot : liste vide refusée")

# ---------- Suppression de vidéos en lot ----------
ids = []
for i in range(3):
    cur.execute("insert into talks(organizer_id,title,source,video_ref) values(%s,%s,'youtube','x') returning id", (me_id, f"A supprimer {i} {tag}"))
    ids.append(str(cur.fetchone()[0]))
cur.execute("insert into users(email,name,password_hash,role) values(%s,'Autre orga','x','organizer') returning id", (f"autre-{tag}@test.local",))
other = cur.fetchone()[0]
cur.execute("insert into talks(organizer_id,title,source,video_ref) values(%s,%s,'youtube','x') returning id", (other, f"Pas à moi {tag}"))
theirs = str(cur.fetchone()[0])
ok(requests.post(B + "/talks/bulk-delete", json={"ids": ids}).status_code == 401, "suppression en lot : connexion obligatoire")
ok(requests.post(B + "/talks/bulk-delete", headers=A, json={"ids": []}).status_code == 400, "suppression en lot : liste vide refusée")
r = requests.post(B + "/talks/bulk-delete", headers=A, json={"ids": ids[:2] + [str(uuid.uuid4())]}).json()
ok(r == {"deleted": 2, "notDeleted": 1}, "suppression en lot : 2 supprimées, 1 inconnue comptée à part")
cur.execute("select count(*) from talks where id = any(%s::uuid[])", (ids,))
ok(cur.fetchone()[0] == 1, "suppression en lot : bien effacées en base")
r = requests.post(B + "/talks/bulk-delete", headers=A, json={"ids": [ids[2], theirs]}).json()
ok(r["deleted"] == 2, "suppression en lot : l'administrateur supprime aussi les vidéos des autres")
# Un organisateur ne supprime que les siennes
cur.execute("insert into talks(organizer_id,title,source,video_ref) values(%s,%s,'youtube','x') returning id", (other, f"Orga A {tag}")); oa = str(cur.fetchone()[0])
cur.execute("insert into talks(organizer_id,title,source,video_ref) values(%s,%s,'youtube','x') returning id", (me_id, f"Admin B {tag}")); ab = str(cur.fetchone()[0])
tok = requests.post(B + "/admin/users/%s/password" % other, headers=A, json={"password": "OrgaPassw0rd-test"})
OH = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": f"autre-{tag}@test.local", "password": "OrgaPassw0rd-test"}).json()["token"]}
r = requests.post(B + "/talks/bulk-delete", headers=OH, json={"ids": [oa, ab]}).json()
ok(r == {"deleted": 1, "notDeleted": 1}, "suppression en lot : un organisateur ne supprime que ses vidéos")
cur.execute("select count(*) from talks where id = %s", (ab,)); ok(cur.fetchone()[0] == 1, "suppression en lot : la vidéo d'un autre est intacte")
# Journal des actions
cur.execute("select summary from audit_log where route in ('/talks/bulk-delete','/admin/users/bulk-role') order by id desc limit 6")
sm = " | ".join(x[0] for x in cur.fetchall())
ok("Suppression en lot" in sm and "Rôle « organizer »" in sm, "journal : les actions en lot sont inscrites avec un résumé")

# Nettoyage
cur.execute("delete from talks where id = any(%s::uuid[])", ([tid, ab],))
cur.execute("delete from users where id = any(%s::uuid[]) or id = %s", (us, other))
print("TOUT OK : actions en lot admin")
