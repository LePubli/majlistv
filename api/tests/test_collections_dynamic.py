"""Phase 6 (20/11) : collections dynamiques — manuelles, automatiques, saisonnières, personnelles ; Kids ; aperçu.
Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


ADM = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
email = f"cd-{tag}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Cd"})
U = login(email, "Passw0rd-test")
cur.execute("select id from users where email=%s", (email,)); uid = str(cur.fetchone()[0])


def mk(n, **kw):
    r = requests.post(B + "/talks", headers=ADM, json={"title": f"Dyn {n} {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + n + "abcdefghijk")[:11], "rightsConfirmed": True, "publication": "published", **kw})
    tid = r.json()["id"]
    cur.execute("update talks set video_status='ready', speaker=%s, duration_seconds=%s, show_adults=true where id=%s", (f"Orateur {tag}", kw.get("_d", 300), tid))
    return tid
t1, t2 = mk("a"), mk("b")
cur.execute("update talks set duration_seconds=3000 where id=%s", (t2,))
C = B + "/studio/collections"


def create(**b):
    return requests.post(C, headers=ADM, json={"title": f"Coll {b.pop('n')} {tag}", **b})

# --- validation
ok(create(n="x1", mode="personal").status_code == 400, "personnelle sans type refusée")
ok(create(n="x2", mode="seasonal").status_code == 400, "saisonnière sans saison refusée")
ok(create(n="x3", mode="auto", rule={"inconnu": 1}).status_code == 400, "clé de règle inconnue refusée")
ok(create(n="x4", mode="auto", rule={"minSeconds": 600, "maxSeconds": 300}).status_code == 400, "durée min ≥ max refusée")
ok(create(n="x5", mode="auto", rule={"type": "continue"}).status_code == 400, "type réservé aux personnelles")
ok(create(n="x6", mode="personal", catalogue="kids", rule={"type": "foryou"}).status_code == 400, "Kids : seul « continue »")

# --- automatique : durée + intervenant
r = create(n="auto", mode="auto", published=True, onHome=True, homeOrder=1, rule={"speaker": f"Orateur {tag}", "maxSeconds": 600})
ok(r.status_code == 201, "collection automatique créée"); aid = r.json()["id"]
d = requests.get(f"{B}/collections/{aid}").json()
ids = [x["id"] for x in d["talks"]]
ok(ids == [t1], "règle : intervenant + durée ≤ 10 min → seule la courte vidéo")
r = requests.patch(f"{C}/{aid}", headers=ADM, json={"rule": {"speaker": f"Orateur {tag}", "sort": "longest"}}); ok(r.status_code == 200, "règle modifiée")
ids = [x["id"] for x in requests.get(f"{B}/collections/{aid}").json()["talks"]]
ok(ids == [t2, t1], "tri « plus longues d'abord »")
ok(requests.patch(f"{C}/{aid}", headers=ADM, json={"rule": {"category": "n-existe-pas"}}).status_code == 200
   and requests.get(f"{B}/collections/{aid}").status_code == 404 or requests.get(f"{B}/collections/{aid}").json()["talks"] == [], "catégorie inconnue : jamais « tout le catalogue »")
requests.patch(f"{C}/{aid}", headers=ADM, json={"rule": {"speaker": f"Orateur {tag}"}})
ok(any(x["id"] == aid for x in requests.get(B + "/collections").json()), "visible dans la liste publique")

# --- accueil : visiteur
home = requests.get(B + "/collections/home").json()["collections"]
ok(any(x["id"] == aid for x in home), "la collection automatique est sur l'accueil")
ok(all(x["mode"] != "personal" for x in home), "visiteur : aucune collection personnelle")

# --- brouillon : invisible
r = create(n="draft", mode="auto", rule={"speaker": f"Orateur {tag}"}); did = r.json()["id"]
ok(requests.get(f"{B}/collections/{did}").status_code == 404, "brouillon introuvable côté public")

# --- saisonnière : fermée hors saison
r = create(n="sais", mode="seasonal", season="ramadan", published=True, onHome=True, homeOrder=2, rule={"speaker": f"Orateur {tag}"}); sid = r.json()["id"]
cur.execute("select 1 from collections where id=%s and season='ramadan'", (sid,)); ok(cur.fetchone() is not None, "saison enregistrée")
in_season = any(x["id"] == sid for x in requests.get(B + "/collections/home").json()["collections"])
ok(in_season == (requests.get(f"{B}/collections/{sid}").status_code == 200), "saisonnière : accueil et page suivent la saison en cours")
pv = requests.post(C + "/preview", headers=ADM, json={"mode": "seasonal", "season": "ramadan", "rule": {"speaker": f"Orateur {tag}"}}).json()
ok(pv["count"] == 2, "aperçu : montre le contenu même hors saison")

# --- personnelle : continuer
r = create(n="cont", mode="personal", published=True, onHome=True, homeOrder=3, rule={"type": "continue"}); pid = r.json()["id"]
ok(requests.get(f"{B}/collections/{pid}").status_code == 404, "personnelle : pas de page publique pour un visiteur")
cur.execute("insert into watch_progress(user_id, talk_id, position_ms, duration_ms, completed) values (%s,%s,60000,300000,false)", (uid, t1))
mine = requests.get(B + "/collections/home", headers=U).json()["collections"]
ok(any(x["id"] == pid and [y["id"] for y in x["talks"]] == [t1] for x in mine), "membre : « Continuer à regarder » montre sa vidéo en cours")
ok(not any(x["id"] == pid for x in requests.get(B + "/collections/home").json()["collections"]), "la collection personnelle n'est pas servie à un visiteur")
ok("no-store" in requests.get(B + "/collections/home", headers=U).headers.get("cache-control", ""), "personnel : pas de cache partagé")
cur.execute("update watch_progress set completed=true where user_id=%s", (uid,))
ok(not any(x["id"] == pid for x in requests.get(B + "/collections/home", headers=U).json()["collections"]), "vidéo terminée : la rangée disparaît (jamais vide)")

# --- manuelle : liste choisie
r = create(n="man", mode="manual", published=True); mid = r.json()["id"]
requests.put(f"{C}/{mid}/items", headers=ADM, json={"talkIds": [t2, t1]})
ok([x["id"] for x in requests.get(f"{B}/collections/{mid}").json()["talks"]] == [t2, t1], "manuelle : ordre choisi")

# --- slug unique
r = create(n="s1", slug=f"slug-{tag}"); ok(r.status_code == 201, "slug accepté")
ok(create(n="s2", slug=f"slug-{tag}").status_code == 409, "slug déjà pris : 409")

# --- les 22 collections de départ sont des brouillons et ne sortent pas
cur.execute("select count(*) from collections where slug is not null and slug in ('a-la-une','kids-nouveautes','selections-du-ramadan') and published")
ok(cur.fetchone()[0] == 0, "collections de départ : brouillons, rien n'est publié sans validation")

# --- Kids : auto limitée à la tranche d'âge de l'enfant
cur.execute("update talks set kids_bands=ARRAY['6-8'], show_adults=false where id=%s", (t1,))
r = create(n="kids", mode="auto", catalogue="kids", published=True, onHome=True, homeOrder=4, rule={"speaker": f"Orateur {tag}"})
ok(r.status_code == 201, "collection Kids créée")
ok(requests.get(f"{B}/collections/{r.json()['id']}").status_code == 404, "Kids : absente du catalogue adulte")
pv = requests.post(C + "/preview", headers=ADM, json={"mode": "auto", "catalogue": "kids", "rule": {"speaker": f"Orateur {tag}"}}).json()
ok([x["id"] for x in pv["talks"]] == [t1], "Kids : seules les vidéos avec tranche d'âge")
home = requests.get(B + "/collections/home").json()["collections"]
ok(all(x["id"] != r.json()["id"] for x in home), "Kids : jamais sur l'accueil adulte")

# --- Kids : la rangée de collection apparaît dans le catalogue de l'enfant, jamais pour une vidéo que l'enfant ne peut pas voir
kcid = r.json()["id"]
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"kids_enabled": None, "kids_max_standard": None, "kids_max_learning": None}})
cur.execute("update talks set access='free' where id=%s", (t1,))
requests.put(B + "/me/kids/pin", headers=ADM, json={"code": "2468"})  # le parent (administrateur) n'a pas besoin d'abonnement
kp = requests.post(B + "/me/kids/profiles", headers=ADM, json={"name": "Yacine", "band": "6-8"}).json().get("id")
KT = {"authorization": "Bearer " + requests.post(f"{B}/me/kids/profiles/{kp}/enter", headers=ADM).json()["token"]}
shelves = requests.get(B + "/kids/catalog", headers=KT).json()["shelves"]
col = [x for x in shelves if x["kind"] == "collection" and x["collectionId"] == kcid]
ok(len(col) == 1 and col[0]["ids"] == [t1], "Kids : rangée de collection dans le catalogue de l'enfant (sa vidéo seulement)")
ok(shelves[0]["kind"] == "collection", "Kids : les collections passent en tête des rangées")
cur.execute("update talks set kids_bands=ARRAY['13-15'] where id=%s", (t1,))
shelves = requests.get(B + "/kids/catalog", headers=KT).json()["shelves"]
ok(not any(x["kind"] == "collection" and x["collectionId"] == kcid for x in shelves), "Kids : hors de sa tranche d'âge, la vidéo (et la rangée vide) disparaissent")
requests.delete(f"{B}/me/kids/profiles/{kp}", headers=ADM)

# --- nettoyage
for i in (aid, did, sid, pid, mid, r.json()["id"]):
    requests.delete(f"{C}/{i}", headers=ADM)
cur.execute("delete from collections where title like %s", (f"%{tag}",))
print("TOUT EST OK")
