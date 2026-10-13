"""14.1 : séries, saisons, épisodes et règle d'accès (série + épisode). Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}


def mkuser(role):
    email = f"{role}.{uuid.uuid4().hex[:4]}.{tag}@test.local"
    r = requests.post(f"{B}/auth/register", json={"email": email, "password": "MotDePasse-123"}).json()
    cur.execute("update users set role=%s where email=%s", (role, email))
    # nouveau jeton avec le bon rôle
    return {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": email, "password": "MotDePasse-123"}).json()["token"]}, r["user"]["id"]


org, org_id = mkuser("organizer")
org2, _ = mkuser("organizer")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(title, owner=aid, pub="published", status="ready", access="free"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,access) values(%s,'Cheikh','youtube','abc',%s,%s,%s,%s) returning id", (f"{title}{tag}", owner, pub, status, access))
    return str(cur.fetchone()[0])


t1, t2, t3, t4 = (mk(f"Ep{i}") for i in range(1, 5))
hidden = mk("Brouillon", pub="draft")

# --- création
r = requests.post(f"{B}/series", headers=adm, json={"title": f"Série {tag}", "hasSeasons": True, "access": "premium", "speaker": "Cheikh"})
ok(r.status_code == 201, "création d'une série avec saisons")
sid = r.json()["id"]
m = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()
ok(len(m["seasons"]) == 1 and m["seasons"][0]["number"] == 1, "une première saison est créée d'office")
s1 = m["seasons"][0]["id"]
r = requests.post(f"{B}/series/{sid}/seasons", headers=adm, json={"title": "La suite"})
s2 = r.json()["id"]
ok(r.status_code == 201, "ajout d'une saison")
ok(requests.post(f"{B}/series", headers={}, json={"title": "x"}).status_code == 401, "création : connexion requise")
ok(requests.post(f"{B}/series", headers=adm, json={"title": "x", "bogus": 1}).status_code == 400, "schéma strict")

# --- épisodes
lay = {"episodes": [{"talkId": t1, "seasonId": s1}, {"talkId": t2, "seasonId": s1, "access": "free"}, {"talkId": t3, "seasonId": s2}, {"talkId": t4, "seasonId": s2}, {"talkId": hidden, "seasonId": s2}]}
r = requests.put(f"{B}/series/{sid}/episodes", headers=adm, json=lay)
ok(r.status_code == 200 and r.json()["count"] == 5, "placement des épisodes par saison")
acc = lambda t: (cur.execute("select access from talks where id=%s", (t,)), cur.fetchone()[0])[1]
ok([acc(t1), acc(t2), acc(t3), acc(t4)] == ["premium", "free", "premium", "premium"], "accès effectif : la série (premium) sauf l'épisode réglé gratuit")
ok(requests.get(f"{B}/talks/{t1}").json().get("locked") is True and not requests.get(f"{B}/talks/{t2}").json().get("locked"), "visiteur : épisode premium verrouillé, épisode gratuit lisible")

# --- publication et lecture publique
ok(requests.get(f"{B}/series/{sid}").status_code == 404, "non publiée : invisible au public")
ok(sid not in [x["id"] for x in requests.get(f"{B}/series").json()], "non publiée : absente de la liste")
ok(requests.get(f"{B}/series/{sid}", headers=adm).status_code == 200, "non publiée : visible du propriétaire / admin")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": True})
lst = [x for x in requests.get(f"{B}/series").json() if x["id"] == sid]
ok(len(lst) == 1 and lst[0]["episodeCount"] == 4 and lst[0]["seasonCount"] == 2 and lst[0]["access"] == "mixed", "liste publique : 4 épisodes prêts (brouillon exclu), 2 saisons, accès mixte")
d = requests.get(f"{B}/series/{sid}").json()
ok([len(z["episodes"]) for z in d["seasons"]] == [2, 2] and [e["number"] for e in d["seasons"][1]["episodes"]] == [1, 2], "page série : épisodes numérotés dans chaque saison")
ok(d["resume"]["talkId"] == t1 and d["resume"]["started"] is False and d["episodeCount"] == 4, "« Regarder » : premier épisode")
ok("accessOverride" not in d["seasons"][0]["episodes"][0] and "positionMs" not in d["seasons"][0]["episodes"][0], "public : pas de détails internes ni de progression")
mm = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()
ok(len(mm["episodes"]) == 5, "gestion : le brouillon est listé")

# --- reprise (progression d'un utilisateur)
viewer, vid = mkuser("user")
requests.put(f"{B}/me/progress/{t1}", headers=viewer, json={"positionMs": 60000, "durationMs": 600000})
dv = requests.get(f"{B}/series/{sid}", headers=viewer).json()
ok(dv["resume"]["talkId"] == t1 and dv["resume"]["started"] and dv["resume"]["positionMs"] == 60000, "« Reprendre » : épisode commencé, à la bonne position")
requests.put(f"{B}/me/progress/{t1}", headers=viewer, json={"positionMs": 595000, "durationMs": 600000})
cur.execute("update watch_progress set completed=true where talk_id=%s and user_id=%s", (t1, vid))
ok(requests.get(f"{B}/series/{sid}", headers=viewer).json()["resume"]["talkId"] == t2, "épisode terminé : on propose le suivant")

# --- contexte de la fiche conférence
c = requests.get(f"{B}/talks/{t3}/series").json()["series"]
ok(c["season"]["number"] == 2 and c["number"] == 1 and c["prev"]["id"] == t2 and c["next"]["id"] == t4 and c["total"] == 4, "contexte : saison 2, épisode 1, précédent = fin de saison 1, suivant = épisode 2")
ok(sum(1 for e in c["episodes"] if e["current"]) == 1 and len(c["episodes"]) == 4, "liste latérale : 4 épisodes dont l'épisode courant")
ok(requests.get(f"{B}/talks/{mk('Isole')}/series").json() == {"series": None}, "conférence isolée : pas de série")

# --- règle d'accès : l'épisode l'emporte
requests.patch(f"{B}/talks/{t1}", headers=adm, json={"access": "free"})
ok(acc(t1) == "free", "modifier l'accès d'un épisode dans le Studio fixe son réglage")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"access": "free"})
requests.patch(f"{B}/series/{sid}", headers=adm, json={"access": "premium"})
ok([acc(t1), acc(t2), acc(t3)] == ["free", "free", "premium"], "changer l'accès de la série ne touche pas les épisodes réglés à part")
requests.patch(f"{B}/talks/{t1}", headers=adm, json={"access": "premium"})
mm = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()
e1 = [e for z in [mm["episodes"]] for e in z if e["id"] == t1][0]
ok(acc(t1) == "premium" and e1["accessOverride"] is None, "même accès que la série : l'épisode hérite de nouveau")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"access": "free"})
ok([acc(t1), acc(t2), acc(t3), acc(t4)] == ["free", "free", "free", "free"], "série passée en gratuit : les épisodes qui héritent suivent")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"access": "premium"})
ok([acc(t1), acc(t2), acc(t3)] == ["premium", "free", "premium"], "retour en premium : seul l'épisode réglé gratuit reste gratuit")

# --- validations
ok(requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": t1}]}).status_code == 400, "avec saisons : saison obligatoire")
ok(requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": t1, "seasonId": str(uuid.uuid4())}]}).status_code == 400, "saison d'une autre série refusée")
ok(requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": t1, "seasonId": s1}, {"talkId": t1, "seasonId": s1}]}).status_code == 400, "doublon refusé")
other = requests.post(f"{B}/series", headers=adm, json={"title": f"Autre {tag}"}).json()["id"]
ok(requests.put(f"{B}/series/{other}/episodes", headers=adm, json={"episodes": [{"talkId": t1}]}).status_code == 409, "conférence déjà dans une autre série : 409")
ok(requests.delete(f"{B}/series/{sid}/seasons/{s1}", headers=adm).status_code == 409, "saison non vide : suppression refusée")
ok(requests.put(f"{B}/series/{sid}/seasons-order", headers=adm, json={"ids": [s1]}).status_code == 400, "ordre des saisons incomplet refusé")
ok(requests.put(f"{B}/series/{sid}/seasons-order", headers=adm, json={"ids": [s2, s1]}).status_code == 200, "ordre des saisons modifié")
dd = requests.get(f"{B}/series/{sid}").json()
ok([z["id"] for z in dd["seasons"]] == [s2, s1] and dd["seasons"][0]["number"] == 1, "la saison déplacée prend le numéro 1")
requests.put(f"{B}/series/{sid}/seasons-order", headers=adm, json={"ids": [s1, s2]})

# --- droits
r = requests.post(f"{B}/series", headers=org, json={"title": f"Mienne {tag}"}); mine = r.json()["id"]
ok(requests.get(f"{B}/series/{mine}/manage", headers=org2).status_code == 404, "un autre organisateur ne voit pas ma série")
ok(requests.patch(f"{B}/series/{mine}", headers=org2, json={"title": "x"}).status_code == 404, "ni ne la modifie")
ok(requests.put(f"{B}/series/{mine}/episodes", headers=org, json={"episodes": [{"talkId": t3}]}).status_code in (403, 409), "ajouter la conférence d'un autre : refusé")
own = mk("Perso", owner=org_id)
cand = [x["id"] for x in requests.get(f"{B}/studio/series-candidates", headers=org).json()]
ok(own in cand and t1 not in cand, "candidats : mes conférences hors série seulement")
ok(requests.put(f"{B}/series/{mine}/episodes", headers=org, json={"episodes": [{"talkId": own}]}).status_code == 200, "ajout de sa propre conférence")
ok(len(requests.get(f"{B}/studio/series", headers=org).json()) == 1 and len(requests.get(f"{B}/studio/series", headers=adm).json()) >= 3, "liste Studio : les miennes / toutes pour un admin")
ok(requests.get(f"{B}/studio/series", headers=viewer).status_code == 403, "liste Studio : réservée aux organisateurs")

# --- image de la série
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
r = requests.post(f"{B}/series/{mine}/poster", headers=org, json={"image": PNG})
ok(r.status_code == 201 and r.json()["posterUrl"], "envoi de l'image de la série")
ok(requests.get(f"{B}/series/{mine}/manage", headers=org).json()["posterUrl"], "l'image apparaît dans la fiche")
ok(requests.post(f"{B}/series/{mine}/poster", headers=org, json={"image": "data:image/png;base64,AAAA"}).status_code == 400, "fichier qui n'est pas une image : refusé")
ok(requests.post(f"{B}/series/{mine}/poster", headers=org, json={"image": "data:image/gif;base64,R0lGOD"}).status_code == 400, "type non autorisé : refusé")
ok(requests.post(f"{B}/series/{mine}/poster", headers=org2, json={"image": PNG}).status_code == 404, "autre organisateur : refusé")
ok(requests.delete(f"{B}/series/{mine}/poster", headers=org).status_code == 204 and requests.get(f"{B}/series/{mine}/manage", headers=org).json()["posterUrl"] is None, "suppression de l'image")

# --- avec / sans saisons
requests.patch(f"{B}/series/{sid}", headers=adm, json={"hasSeasons": False})
d = requests.get(f"{B}/series/{sid}").json()
ok(d["seasons"] is None and [e["number"] for e in d["episodes"]] == [1, 2, 3, 4] and [e["id"] for e in d["episodes"]] == [t1, t2, t3, t4], "sans saisons : liste continue, ordre conservé")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"hasSeasons": True})
d = requests.get(f"{B}/series/{sid}").json()
ok(len(d["seasons"]) == 1 and len(d["seasons"][0]["episodes"]) == 4, "retour avec saisons : une saison reçoit tous les épisodes")

# --- suppression : les conférences restent
before = acc(t2)
ok(requests.delete(f"{B}/series/{sid}", headers=adm).status_code == 204, "suppression de la série")
cur.execute("select count(*) from talks where id=any(%s::uuid[])", ([t1, t2, t3, t4],)); n = cur.fetchone()[0]
ok(n == 4 and acc(t2) == before, "les conférences restent, accès conservé")
ok(requests.get(f"{B}/talks/{t1}/series").json() == {"series": None}, "elles sont redevenues isolées")

cur.execute("delete from series where title like %s", (f"%{tag}",)); cur.execute("delete from talks where title like %s", (f"%{tag}",))
cur.execute("delete from users where email like %s", (f"%.{tag}@test.local",))
print("TOUT OK")
