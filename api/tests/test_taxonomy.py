"""26.5 : classement — sous-catégories, plusieurs catégories, tranches d'âge multiples, public adultes. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
_hits = []


def rq(method, path, headers=None, **kw):
    now = time.time()
    _hits[:] = [h for h in _hits if now - h < 60]
    if len(_hits) >= 70:
        time.sleep(61 - (now - _hits[0])); _hits.clear()
    _hits.append(time.time())
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429:
        time.sleep(62); _hits.clear(); _hits.append(time.time())
        r = requests.request(method, B + path, headers=headers, **kw)
    return r


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": pw}).json()["token"]}


tag = uuid.uuid4().hex[:5]
ADM = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def talk(title, cat=None, **cols):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,category_id) "
                "values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',600,%s) returning id", (f"{title} {tag}", "v" + uuid.uuid4().hex[:9], aid, cat))
    return str(cur.fetchone()[0])


def home_rows():
    return {r["key"]: r for r in rq("GET", "/home").json()["rows"]}


def cat_ids(path, **params):
    return {t["id"] for t in rq("GET", path, params=params).json()}


# Base de test : on dégage les rangées de catégories des autres tests (l'accueil n'en montre que 12).
cur.execute("update talks set category_id = null where category_id is not null")
cur.execute("delete from talk_categories")

# ---- Sous-catégories
r = rq("POST", "/categories", headers=ADM, json={"name": f"Coran{tag}"}); ok(r.status_code == 201 and r.json()["parentId"] is None, "catégorie principale créée")
CORAN = r.json()["id"]
r = rq("POST", "/categories", headers=ADM, json={"name": "Lecture", "parentId": CORAN}); ok(r.status_code == 201 and r.json()["parentId"] == CORAN, "sous-catégorie « Lecture » créée")
LECT = r.json()["id"]
APPR = rq("POST", "/categories", headers=ADM, json={"name": "Apprentissage", "parentId": CORAN}).json()["id"]
HAD = rq("POST", "/categories", headers=ADM, json={"name": f"Hadith{tag}"}).json()["id"]
ok(rq("POST", "/categories", headers=ADM, json={"name": "Lecture", "parentId": HAD}).status_code == 201, "le même nom est permis sous un autre parent")
ok(rq("POST", "/categories", headers=ADM, json={"name": "lecture", "parentId": CORAN}).status_code == 409, "doublon refusé sous le même parent")
ok(rq("POST", "/categories", headers=ADM, json={"name": f"coran{tag}"}).status_code == 409, "doublon refusé parmi les catégories principales")
ok(rq("POST", "/categories", headers=ADM, json={"name": "Trop profond", "parentId": LECT}).status_code == 400, "pas de sous-sous-catégorie (2 niveaux)")
ok(rq("POST", "/categories", headers=ADM, json={"name": "Orpheline", "parentId": 999999}).status_code == 400, "parent inconnu refusé")
ok(rq("POST", "/categories", json={"name": "x"}).status_code in (401, 403), "création réservée à l'administrateur")
tree = rq("GET", "/categories").json()
names = [c["fullName"] for c in tree if c["name"] in (f"Coran{tag}", "Lecture", "Apprentissage") and c["id"] in (CORAN, LECT, APPR)]
ok(names == [f"Coran{tag}", f"Coran{tag} › Apprentissage", f"Coran{tag} › Lecture"], "liste en arbre : le parent puis ses sous-catégories, avec le nom complet")
ok(next(c for c in tree if c["id"] == LECT)["depth"] == 1, "profondeur indiquée")

# ---- Catégories d'une conférence
T_lect = talk("Récitation enfants", LECT)
T_appr = talk("Cours de tajwid", APPR)
T_had = talk("Hadith du jour", HAD)
T_multi = talk("Histoire du Coran", HAD)
cur.execute("select category from (select c.name as category from talks t left join category_names c on c.id=t.category_id where t.id=%s) x", (T_lect,))
ok(cur.fetchone()[0] == f"Coran{tag} › Lecture", "le nom complet sert à l'affichage")
ok(rq("GET", f"/talks/{T_lect}").json()["category"] == f"Coran{tag} › Lecture", "fiche conférence : « Coran › Lecture »")
ok(T_lect in cat_ids("/talks", category=CORAN) and T_appr in cat_ids("/talks", category=CORAN), "filtrer « Coran » trouve aussi ses sous-catégories")
ok(T_lect in cat_ids("/talks", category=LECT) and T_appr not in cat_ids("/talks", category=LECT), "filtrer « Lecture » ne trouve que la lecture")
ok(T_had not in cat_ids("/talks", category=CORAN), "une autre catégorie n'est pas incluse")

ORG = ADM
r = rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"extraCategoryIds": [CORAN, APPR]}); ok(r.status_code == 200, "catégories supplémentaires enregistrées (2)")
t = rq("GET", f"/talks/{T_multi}").json()
ok(sorted(t["extraCategoryIds"]) == sorted([CORAN, APPR]), "fiche : catégories supplémentaires exposées")
ok(T_multi in cat_ids("/talks", category=CORAN) and T_multi in cat_ids("/talks", category=HAD) and T_multi in cat_ids("/talks", category=APPR), "la conférence apparaît dans chacune de ses catégories")
ok(rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"extraCategoryIds": [CORAN, APPR, LECT]}).status_code == 400, "3 catégories supplémentaires : refusé")
ok(rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"extraCategoryIds": [HAD, CORAN]}).status_code == 200 and rq("GET", f"/talks/{T_multi}").json()["extraCategoryIds"] == [CORAN], "la catégorie principale est retirée des supplémentaires")
ok(rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"extraCategoryIds": [999999]}).status_code == 400, "catégorie supplémentaire inconnue refusée")
rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"extraCategoryIds": [CORAN]})
rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"categoryId": CORAN})
ok(rq("GET", f"/talks/{T_multi}").json()["extraCategoryIds"] == [], "la nouvelle catégorie principale sort des supplémentaires")
rq("PATCH", f"/talks/{T_multi}", headers=ORG, json={"categoryId": HAD, "extraCategoryIds": [CORAN]})

# ---- Accueil : une rangée par catégorie principale, sous-catégories comprises
rows = home_rows()
row = rows.get(f"cat:{CORAN}")
ok(row is not None and {x["id"] for x in row["talks"]} >= {T_lect, T_appr, T_multi}, "accueil : la rangée « Coran » contient lecture, apprentissage et la conférence multi-catégories")
ok(f"cat:{LECT}" not in rows, "accueil : pas de rangée pour une sous-catégorie")
ok(row["title"] == f"Coran{tag}" and row["categoryId"] == CORAN, "rangée titrée du nom de la catégorie principale")

# ---- Suppression et déplacement
r = rq("DELETE", f"/categories/{CORAN}", headers=ADM); ok(r.status_code == 409 and r.json()["code"] == "has_children", "supprimer un parent qui a des sous-catégories : refusé")
ok(rq("PATCH", f"/categories/{CORAN}", headers=ADM, json={"parentId": HAD}).status_code == 400, "un parent qui a des sous-catégories ne devient pas une sous-catégorie")
ok(rq("PATCH", f"/categories/{LECT}", headers=ADM, json={"parentId": LECT}).status_code == 400, "pas son propre parent")
r = rq("PATCH", f"/categories/{APPR}", headers=ADM, json={"parentId": HAD}); ok(r.status_code == 200 and r.json()["parentId"] == HAD, "déplacer une sous-catégorie sous un autre parent")
ok(T_appr in cat_ids("/talks", category=HAD) and T_appr not in cat_ids("/talks", category=CORAN), "les conférences suivent la sous-catégorie déplacée")
ok(rq("PATCH", f"/categories/{APPR}", headers=ADM, json={"name": "Lecture"}).status_code == 409, "renommer en doublon : refusé")
ok(rq("PATCH", f"/categories/{APPR}", headers=ADM, json={"name": f"Mémorisation{tag}", "parentId": None}).json()["parentId"] is None, "une sous-catégorie peut devenir principale")
stats = {c["id"]: c for c in rq("GET", "/categories/stats", headers=ADM).json()}
ok(stats[CORAN]["children"] == 1 and stats[CORAN]["total"] >= 2 and stats[LECT]["count"] == 1, "statistiques : sous-catégories et total (principale + supplémentaires)")

# ---- Tranches d'âge multiples
T_k = talk("Pour petits et moyens")
r = rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"kidsBands": ["7-10", "3-6"]}); ok(r.status_code == 200, "plusieurs tranches d'âge enregistrées")
ok(rq("GET", f"/talks/{T_k}").json()["kidsBands"] == ["3-6", "7-10"], "tranches triées de la plus jeune à la plus âgée")
ok(rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"kidsBands": ["3-6", "3-6", "7-10", "11-14"]}).status_code == 200 and rq("GET", f"/talks/{T_k}").json()["kidsBands"] == ["3-6", "7-10", "11-14"], "doublons retirés")
ok(rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"kidsBands": ["1-2"]}).status_code == 400, "tranche inconnue refusée")
ok(rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"kidsBands": ["3-6", "7-10"]}).status_code == 200, "retour à 3-6 et 7-10")
# Visibilité enfant : seulement les tranches cochées
def kidtoken(parent, band, name):
    pid = rq("POST", "/me/kids/profiles", headers=parent, json={"name": name, "band": band}).json()["id"]
    return {"authorization": "Bearer " + rq("POST", f"/me/kids/profiles/{pid}/enter", headers=parent, json={}).json()["token"]}, pid
email = f"tx-{uuid.uuid4().hex[:6]}@test.local"
rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "P"})
cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,'learning')", ("sub_" + uuid.uuid4().hex[:12], uid))
PH = login(email, "Passw0rd-test"); rq("PUT", "/me/kids/pin", headers=PH, json={"code": "2468"})
K1, p1 = kidtoken(PH, "3-6", "Petit"); K2, p2 = kidtoken(PH, "7-10", "Moyen"); K3, p3 = kidtoken(PH, "11-14", "Grand")
ids = lambda K: {t["id"] for t in rq("GET", "/kids/talks", headers=K).json()["talks"]}
ok(T_k in ids(K1) and T_k in ids(K2) and T_k not in ids(K3), "3-6 + 7-10 : vue par les petits et les moyens, pas par les grands")
ok(rq("GET", f"/talks/{T_k}", headers=K3).status_code == 404, "les grands n'ouvrent pas la conférence en accès direct")
rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"kidsBands": ["11-14"]})
ok(T_k not in ids(K1) and T_k not in ids(K2) and T_k in ids(K3), "11-14 seulement : réservée aux grands (les petits ne la voient plus)")
rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"kidsBands": ["3-6", "7-10", "11-14"]})
ok(all(T_k in ids(K) for K in (K1, K2, K3)), "toutes les tranches : vue par tous")
ok(rq("GET", f"/talks/{T_k}", headers=K1).json()["kidsBands"] == ["3-6", "7-10", "11-14"], "fiche côté enfant : tranches exposées")
hk = rq("GET", "/home/kids").json()["talks"]; ok(any(x["id"] == T_k and x["kidsBands"] == ["3-6", "7-10", "11-14"] for x in hk), "bande de l'accueil : tranches exposées")

# ---- Public : catalogue adultes
ok(rq("GET", f"/talks/{T_k}").json()["showAdults"] is True, "par défaut : visible dans le catalogue adultes")
ok(T_k in cat_ids("/talks"), "conférence Kids visible aux adultes tant que le réglage est actif")
rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"showAdults": False})
ok(T_k not in cat_ids("/talks"), "masquée du catalogue adultes")
T_kc = talk("Kids Coran", LECT); rq("PATCH", f"/talks/{T_kc}", headers=ORG, json={"kidsBands": ["3-6"], "showAdults": False})
ok(T_kc not in cat_ids("/talks", category=CORAN) and T_kc not in {x["id"] for x in home_rows()[f"cat:{CORAN}"]["talks"]}, "masquée aussi des rangées de l'accueil")
ok(T_k in ids(K1) and T_kc in ids(K1), "toujours visible dans l'espace Kids")
ok(rq("GET", f"/talks/{T_k}").status_code == 200, "toujours accessible par son lien")
new_ids = {h["id"] for h in rq("GET", "/search", params={"q": f"Kids Coran {tag}"}).json()["hits"]}
ok(T_kc not in new_ids, "absente de la recherche adultes")
rq("PATCH", f"/talks/{T_k}", headers=ORG, json={"showAdults": True}); ok(T_k in cat_ids("/talks"), "réaffichée dans le catalogue adultes")
sim = {x["id"] for x in rq("GET", f"/talks/{T_lect}/similar").json()}
ok(T_kc not in sim, "« dans la même veine » ne propose pas les conférences réservées aux enfants")

# ---- Création d'une conférence avec les nouveaux champs
r = rq("POST", "/talks", headers=ORG, json={"title": "Créée avec classement " + tag, "videoUrl": "https://www.youtube.com/watch?v=" + uuid.uuid4().hex[:11], "categoryId": LECT, "extraCategoryIds": [HAD], "kidsBands": ["7-10", "3-6"]})
ok(r.status_code == 201, "création avec catégories et tranches d'âge")
tn = rq("GET", f"/talks/{r.json()['id']}").json()
ok(tn["extraCategoryIds"] == [HAD] and tn["kidsBands"] == ["3-6", "7-10"] and tn["showAdults"] is False, "création : un contenu Kids est masqué des adultes par défaut")
ok(rq("POST", "/talks", headers=ORG, json={"title": "Trop de catégories", "videoUrl": "https://www.youtube.com/watch?v=" + uuid.uuid4().hex[:11], "extraCategoryIds": [1, 2, 3]}).status_code == 400, "création : 3 catégories supplémentaires refusées")

# ---- Séries : le filtre par catégorie principale inclut les sous-catégories
cur.execute("insert into series(owner_id,title,description,speaker,category_id,has_seasons,access,published) values (%s,%s,'d','x',%s,false,'free',true) returning id", (aid, "Série lecture " + tag, LECT)); sid = str(cur.fetchone()[0])
T_ep = talk("Épisode lecture"); cur.execute("insert into series_episodes(talk_id,series_id,position) values (%s,%s,1)", (T_ep, sid))
ok(any(s["id"] == sid for s in rq("GET", "/series", params={"category": CORAN}).json()), "série classée en sous-catégorie : trouvée par sa catégorie principale")

# ---- Nettoyage de la catégorie supprimée
ok(rq("DELETE", f"/categories/{LECT}", headers=ADM).status_code == 200, "supprimer une sous-catégorie")
ok(rq("GET", f"/talks/{T_lect}").json()["category"] is None, "ses conférences restent en ligne, sans catégorie")
print("TOUT OK")
