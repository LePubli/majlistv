"""14.5 : séries dans la recherche, « Continuer à regarder » (épisode suivant) et « Mes séries ». Prérequis : API (3055) et PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


tag = uuid.uuid4().hex[:6]
adm = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
email = f"viewer.{tag}@test.local"
requests.post(f"{B}/auth/register", json={"email": email, "password": "MotDePasse-123"})
usr = {"Authorization": "Bearer " + requests.post(f"{B}/auth/login", json={"email": email, "password": "MotDePasse-123"}).json()["token"]}
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def mk(title, pub="published", status="ready"):
    cur.execute("insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values(%s,'Cheikh','youtube','abc',%s,%s,%s,'free',600) returning id", (f"{title}{tag}", aid, pub, status))
    return str(cur.fetchone()[0])


t1, t2, t3, t4 = (mk(f"Ep{i}") for i in range(1, 5))
solo = mk("Solo")
draft = mk("Brouillon", pub="draft")
sid = requests.post(f"{B}/series", headers=adm, json={"title": f"Grande série {tag}", "hasSeasons": True, "access": "free", "speaker": "Cheikh", "description": f"Cours complet {tag}"}).json()["id"]
s1 = requests.get(f"{B}/series/{sid}/manage", headers=adm).json()["seasons"][0]["id"]
s2 = requests.post(f"{B}/series/{sid}/seasons", headers=adm, json={"title": ""}).json()["id"]
requests.put(f"{B}/series/{sid}/episodes", headers=adm, json={"episodes": [{"talkId": t1, "seasonId": s1}, {"talkId": t2, "seasonId": s1}, {"talkId": t3, "seasonId": s2}, {"talkId": t4, "seasonId": s2}]})

# --- recherche : une série non publiée n'apparaît pas encore
r = requests.get(f"{B}/search", params={"q": tag}).json()
ok(sid not in [x["id"] for x in r["series"]], "recherche : série non publiée absente")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": True})
r = requests.get(f"{B}/search", params={"q": f"grande série {tag}"}).json()
ok([x["id"] for x in r["series"]] == [sid] and r["series"][0]["episodeCount"] == 4, "recherche par titre : la série est proposée avec son nombre d'épisodes")
r = requests.get(f"{B}/search", params={"q": f"cours complet {tag}"}).json()
ok(sid in [x["id"] for x in r["series"]], "recherche par présentation : la série est trouvée")
r = requests.get(f"{B}/search", params={"q": tag}).json()
by = {h["id"]: h for h in r["hits"]}
ok(draft not in by and by[t1]["series"] == {"id": sid, "title": f"Grande série {tag}", "seasonNumber": 1, "number": 1}, "résultat : badge série, saison 1, épisode 1")
ok(by[t2]["series"]["number"] == 2 and by[t3]["series"]["seasonNumber"] == 2 and by[t3]["series"]["number"] == 1, "numérotation par saison (S1 É2, S2 É1)")
ok(by[solo]["series"] is None, "conférence hors série : pas de badge")
ok(requests.get(f"{B}/search", params={"q": tag, "offset": 1}).json()["series"] == [], "page suivante : pas de répétition des séries")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": False})
ok(sid not in [x["id"] for x in requests.get(f"{B}/search", params={"q": tag}).json()["series"]], "série repassée en brouillon : retirée de la recherche")
requests.patch(f"{B}/series/{sid}", headers=adm, json={"published": True})

# --- bibliothèque : rien avant d'avoir regardé
ok(requests.get(f"{B}/me/series").status_code == 401, "Mes séries : connexion requise")
ok(requests.get(f"{B}/me/series", headers=usr).json() == [], "Mes séries : vide au départ")


def prog(t, pos):
    return requests.put(f"{B}/me/progress/{t}", headers=usr, json={"positionMs": pos, "durationMs": 600000}).status_code


def cont():
    return {x["id"]: x for x in requests.get(f"{B}/me/continue", headers=usr).json()}


# --- épisode en cours : pas de doublon « suivant »
ok(prog(t1, 120000) == 204, "épisode 1 commencé")
c = cont()
ok(t1 in c and not c[t1].get("nextUp") and c[t1]["series"]["number"] == 1 and c[t1]["series"]["seasonNumber"] == 1, "continuer : l'épisode en cours porte sa place dans la série")
ok(t2 not in c, "continuer : pas d'épisode suivant tant que l'épisode 1 est en cours")
mine = requests.get(f"{B}/me/series", headers=usr).json()
ok(len(mine) == 1 and mine[0]["id"] == sid and mine[0]["watched"] == 0 and mine[0]["episodeCount"] == 4, "Mes séries : la série commencée, 0 épisode terminé")

# --- épisode terminé : le suivant est proposé
ok(prog(t1, 600000) == 204, "épisode 1 terminé")
c = cont()
ok(t1 not in c and c[t2]["nextUp"] is True and c[t2]["positionMs"] == 0 and c[t2]["series"]["number"] == 2, "continuer : l'épisode 2 est proposé (suivant)")
ok(requests.get(f"{B}/me/series", headers=usr).json()[0]["watched"] == 1, "Mes séries : 1 épisode terminé")

# --- le suivant est lancé : il devient un épisode en cours, plus un « suivant »
ok(prog(t2, 90000) == 204, "épisode 2 commencé")
c = cont()
ok(t2 in c and not c[t2].get("nextUp") and t3 not in c, "continuer : l'épisode 2 passe en « en cours », pas de doublon")

# --- fin de saison : le premier épisode de la saison suivante
ok(prog(t2, 600000) == 204, "épisode 2 terminé")
c = cont()
ok(c[t3]["nextUp"] is True and c[t3]["series"]["seasonNumber"] == 2 and c[t3]["series"]["number"] == 1, "continuer : après la saison 1, l'épisode 1 de la saison 2")

# --- série terminée : plus rien à proposer
ok(prog(t3, 600000) == 204 and prog(t4, 600000) == 204, "épisodes 3 et 4 terminés")
c = cont()
ok(not any(k in c for k in (t1, t2, t3, t4)), "continuer : série terminée, plus rien à proposer")
m = requests.get(f"{B}/me/series", headers=usr).json()
ok(m[0]["watched"] == 4, "Mes séries : 4 / 4 épisodes terminés")

# --- conférence hors série
ok(prog(solo, 100000) == 204 and cont()[solo]["series"] is None, "continuer : conférence hors série sans badge")

# --- épisode suivant masqué : on ne propose pas une conférence non publiée
requests.delete(f"{B}/me/progress/{t4}", headers=usr)
requests.delete(f"{B}/me/progress/{t3}", headers=usr)
cur.execute("update talks set publication='draft' where id=%s", (t3,))
c = cont()
ok(t3 not in c, "continuer : un épisode non publié n'est jamais proposé")
cur.execute("update talks set publication='published' where id=%s", (t3,))
print("TOUT EST OK")
