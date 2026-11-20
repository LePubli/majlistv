"""Mejliss Kids en vrai catalogue (phase 4 du 20/11) : les univers Kids sont des catégories Kids (table categories), classement des conférences
(Studio, lot), catalogue enfant (rangées : univers, nouveautés, pour ton âge, parce que tu as aimé, plus regardés), pages univers et série,
tranche d'âge contrôlée côté serveur, recherche enfant (titre, intervenant, univers ; jamais d'adulte, de brouillon ni de saisie dangereuse), droits. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks, rubrics, series_ids = [], [], [], []


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for sid in series_ids: cur.execute("delete from series where id=%s", (sid,))
    for r in rubrics: cur.execute("delete from categories where parent_id=%s", (r,)); cur.execute("delete from categories where id=%s", (r,))
    for u in users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def login(email):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test" if "admin" not in email else "AdminPassw0rd-test"}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)


def member(role=None, label="m"):
    email = f"kc-{label}-{tag}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": f"{label} {tag}"})
    if role: cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]; users.append(uid)
    return login(email), uid


ADM = login("admin@test.local"); cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"kids_enabled": None, "kids_max_standard": None, "kids_max_learning": None}})
ORG, oid = member("organizer", "orga"); ORG2, o2id = member("organizer", "orgb"); USR, _ = member(None, "membre")

# --- Univers Kids = catégories Kids (créées dans Admin → Catégories)
r = requests.get(B + "/studio/kids/rubrics", headers=ORG); L = r.json()
ok(r.status_code == 200 and {"kids-series-aventures", "kids-histoires-prophetes", "kids-coran", "kids-foi", "kids-pratiques", "kids-belles-valeurs", "kids-sciences-decouvertes", "kids-apprendre-arabe", "kids-jeux-quiz", "kids-chansons-contes"} <= {x["slug"] for x in L}, "10 univers Kids présents")
ok(requests.get(B + "/studio/kids/rubrics", headers=USR).status_code == 403, "liste Studio refusée à un simple membre")
ok(requests.get(B + "/admin/kids/rubrics", headers=ADM).status_code == 404, "ancien écran Admin des rubriques : supprimé")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Test {tag}", "catalogueType": "kids", "icon": "🧪", "translations": {"en": {"name": "Test"}, "ar": {"name": "اختبار"}}}); ok(r.status_code == 201, "univers créé (catégorie Kids)"); R1 = r.json(); rubrics.append(R1["id"])
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Deuxième {tag}", "catalogueType": "kids"}); ok(r.status_code == 201, "second univers créé"); R2 = r.json(); rubrics.append(R2["id"])
ok(requests.patch(f"{B}/categories/{R2['id']}", headers=ADM, json={"displayOrder": 0}).status_code == 200 and requests.patch(f"{B}/categories/{R1['id']}", headers=ADM, json={"displayOrder": 5}).status_code == 200, "ordre choisi dans Admin → Catégories")
L = {x["id"]: x for x in requests.get(B + "/studio/kids/rubrics", headers=ORG).json()}
ok(L[R1["id"]]["names"] == {"fr": f"Test {tag}", "en": "Test", "ar": "اختبار"} and L[R1["id"]]["emoji"] == "🧪", "textes FR / EN / AR et icône repris de la catégorie")
ok(L[R2["id"]]["position"] < L[R1["id"]]["position"], "R2 passe avant R1")

# --- Conférences + classement (Studio)
UP = {"3-5": ["3-5", "6-8", "9-12"], "6-8": ["6-8", "9-12"], "9-12": ["9-12"], None: []}


def talk(title, band, owner=None, pub="published", speaker="Cheikh Kids", access="free"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) values (%s,'une histoire de patience',%s,'youtube',%s,%s,%s,'ready',%s,600,%s) returning id",
                (f"{title} {tag}", speaker, "v" + uuid.uuid4().hex[:9], owner or oid, pub, access, UP[band])); tid = str(cur.fetchone()[0]); talks.append(tid); return tid


A = talk("Histoire A", "6-8"); Bt = talk("Histoire B", "3-5"); C = talk("Chant C", "6-8"); D = talk("Brouillon D", "6-8", pub="draft"); ADULT = talk("Adulte E", None); OTHER = talk("De l'autre", "6-8", owner=o2id)
_r = requests.put(f"{B}/studio/talks/{A}/kid-rubrics", headers=ORG, json={"rubricIds": [R1["id"], R2["id"]]}); ok(sorted(_r.json().get("rubricIds") or []) == sorted([R1["id"], R2["id"]]), f"l'organisateur classe sa conférence ({_r.status_code} {_r.text[:200]})")
ok(sorted(requests.get(f"{B}/studio/talks/{A}/kid-rubrics", headers=ORG).json()["rubricIds"]) == sorted([R1["id"], R2["id"]]), "classement relu")
ok(requests.put(f"{B}/studio/talks/{OTHER}/kid-rubrics", headers=ORG, json={"rubricIds": [R1["id"]]}).status_code == 404, "pas la conférence d'un autre")
ok(requests.put(f"{B}/studio/talks/{A}/kid-rubrics", headers=ORG, json={"rubricIds": [999999]}).status_code == 400, "univers inconnu refusé")
ok(requests.put(f"{B}/studio/talks/{A}/kid-rubrics", headers=USR, json={"rubricIds": []}).status_code == 403, "simple membre refusé")
r = requests.post(B + "/studio/kids/rubrics/bulk", headers=ORG, json={"ids": [Bt, C, D, ADULT], "rubricIds": [R1["id"]], "mode": "add"}); ok(r.status_code == 200 and r.json()["updated"] == 4, "lot : ajout")
ok(requests.post(B + "/studio/kids/rubrics/bulk", headers=ORG, json={"ids": [OTHER], "rubricIds": [R1["id"]], "mode": "add"}).status_code == 404, "lot : conférence d'autrui refusée")
r = requests.post(B + "/studio/kids/rubrics/bulk", headers=ORG, json={"ids": [C], "rubricIds": [R1["id"]], "mode": "remove"}); ok(r.status_code == 200, "lot : retrait")
ok(requests.get(f"{B}/studio/talks/{C}/kid-rubrics", headers=ORG).json()["rubricIds"] == [], "C n'a plus de rubrique")
ok(requests.post(B + "/studio/kids/rubrics/bulk", headers=ORG, json={"ids": [C], "rubricIds": [R2["id"]], "mode": "replace"}).status_code == 200 and requests.get(f"{B}/studio/talks/{C}/kid-rubrics", headers=ORG).json()["rubricIds"] == [R2["id"]], "lot : remplacement")

# --- Parent + profil 7-10
P, pid = member(None, "parent"); cur.execute("update users set role='admin' where id=%s", (pid,))  # parent autorisé sans abonnement
P = login(f"kc-parent-{tag}@test.local")
requests.put(B + "/me/kids/pin", headers=P, json={"code": "2468"})
k = requests.post(B + "/me/kids/profiles", headers=P, json={"name": "Yacine", "band": "6-8"}).json()["id"]
tok = requests.post(f"{B}/me/kids/profiles/{k}/enter", headers=P).json()["token"]; K = {"authorization": "Bearer " + tok}
ok(requests.get(B + "/kids/catalog").status_code == 401, "catalogue : visiteur refusé")
ok(requests.get(B + "/kids/catalog", headers=ORG).status_code in (401, 403), "catalogue : jeton adulte refusé")
d = requests.get(B + "/kids/catalog", headers=K).json()
ids = {t["id"] for t in d["talks"]}
ok({A, Bt, C} <= ids and D not in ids and ADULT not in ids, "catalogue : brouillon et adulte absents, Kids présents")
kinds = [s["kind"] for s in d["shelves"]]
ok("new" in kinds and "age" in kinds, f"rangées : nouveautés + pour ton âge ({kinds})")
age = next(s for s in d["shelves"] if s["kind"] == "age")["ids"]
ok(A in age and C in age and Bt not in age, "« pour ton âge » : seulement les vidéos dont la tranche la plus basse est 7-10")
sh = {s["rubricId"]: s for s in d["shelves"] if s["kind"] == "rubric"}
ok(set(sh[R1["id"]]["ids"]) == {A, Bt} and set(sh[R2["id"]]["ids"]) == {A, C}, "rangées par rubrique")
ok([x["id"] for x in d["rubrics"] if x["id"] in (R1["id"], R2["id"])] == [R2["id"], R1["id"]], "rubriques dans l'ordre choisi dans l'Admin")
ok(next(t for t in d["talks"] if t["id"] == A)["rubricIds"] == [R2["id"], R1["id"]], "chaque vidéo porte ses univers (dans l'ordre de l'Admin)")
# rubrique inactive : cachée
ok(requests.patch(f"{B}/categories/{R2['id']}", headers=ADM, json={"isActive": False}).json()["isActive"] is False, "univers désactivé")
d = requests.get(B + "/kids/catalog", headers=K).json()
ok(R2["id"] not in [x["id"] for x in d["rubrics"]] and R2["id"] not in [s.get("rubricId") for s in d["shelves"]], "rubrique inactive cachée aux enfants")
ok(requests.patch(f"{B}/categories/{R2['id']}", headers=ADM, json={"isActive": True}).status_code == 200, "univers réactivé")
# parce que tu as aimé + plus regardés
cur.execute("insert into kid_progress(profile_id, talk_id, position_ms, completed) values (%s,%s,600000,true)", (k, A))
d = requests.get(B + "/kids/catalog", headers=K).json()
bs = next((s for s in d["shelves"] if s["kind"] == "because"), None)
ok(bs and bs["basedOn"]["id"] == A and Bt in bs["ids"] and A not in bs["ids"], "« parce que tu as aimé » : même rubrique, jamais la vidéo déjà vue")
ok("popular" not in [s["kind"] for s in d["shelves"]], "« plus regardés » caché tant qu'il y a moins de 3 vidéos regardées")
for t in (Bt, C):
    cur.execute("insert into kid_progress(profile_id, talk_id, position_ms, completed) values (%s,%s,1000,false)", (k, t))
d = requests.get(B + "/kids/catalog", headers=K).json()
ok("popular" in [s["kind"] for s in d["shelves"]], "« plus regardés » apparaît à partir de 3 vidéos")
ok("pop" not in d["talks"][0], "aucun compteur exposé")

# --- Recherche enfant
S = lambda q, **kw: requests.get(B + "/kids/search", headers=K, params={"q": q, **kw}).json()["talks"]
ok({A, Bt} <= {t["id"] for t in S(f"histoire {tag}")}, "recherche par titre (plusieurs mots)")
ok(A in {t["id"] for t in S("PATIENCE")}, "recherche dans la description, sans casse")
ok(C in {t["id"] for t in S("Deuxième")}, "recherche par nom de rubrique")
ok(C in {t["id"] for t in S("cheikh kids")}, "recherche par intervenant")
ok(C in {t["id"] for t in S("deuxieme")}, "sans accent : « deuxieme » trouve « Deuxième » (registre 47)")
ok(A in {t["id"] for t in S("Pätiénce")}, "accents en trop : trouvé quand même")
cur.execute("update talks set description = description || ' الصَّلاةُ' where id=%s", (C,))
ok(C in {t["id"] for t in S("الصلاة")} and C in {t["id"] for t in S("صلاه")}, "arabe : sans voyelles courtes, tâ marbûta = hâ")
ok({A, Bt} <= {t["id"] for t in S("histoirr")}, "faute de frappe : « histoirr » trouve « Histoire » (début du mot)")
ok({A, Bt} <= {t["id"] for t in S(f"histoires {tag}")}, "pluriel : « histoires » trouve « Histoire » (phase 5)")
ok(C in {t["id"] for t in S("zzzzzz deuxieme")}, "un seul mot juste suffit en dernier recours (phase 5)")
ok(S("zzzzzz yyyyyy") == [], "aucun mot trouvé : liste vide")
cur.execute("update talks set duration_seconds=300 where id=%s", (A,)); cur.execute("update talks set duration_seconds=3000 where id=%s", (Bt,))
ok(A in {t["id"] for t in S(f"histoire {tag}", duration="short")} and Bt not in {t["id"] for t in S(f"histoire {tag}", duration="short")}, "recherche Kids : filtre durée courte (phase 5)")
ok(requests.get(B + "/kids/search", headers=K, params={"q": "histoire", "progress": "done"}).status_code == 200, "filtres réservés aux adultes : ignorés côté Kids")
res = {t["id"] for t in S(f"{tag}")}
ok(D not in res and ADULT not in res, "jamais de brouillon ni de contenu adulte")
ok({t["id"] for t in S(f"histoire {tag}", rubric=R2["id"])} == {A, C} and {t["id"] for t in S(f"histoire {tag}", rubric=R1["id"])} == {A, Bt}, "recherche filtrée par rubrique")
ok(S("zzzzzzzz") == [], "aucun résultat : liste vide")
ok(S("%") == [] and S("_") == [] and S("\\") == [], "caractères spéciaux sans effet")
ok(requests.get(B + "/kids/search", headers=K, params={"q": ""}).status_code == 400, "requête vide refusée")
ok(requests.get(B + "/kids/search", params={"q": "histoire"}).status_code == 401, "recherche : visiteur refusé")
ok(all("transcript" not in str(t.keys()) for t in S("histoire")), "aucun extrait de transcription")
# --- Univers (tuiles), page d'un univers, thèmes, tranche d'âge côté serveur
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Vide {tag}", "catalogueType": "kids"}); R3 = r.json(); rubrics.append(R3["id"])
F = talk("Grand F", "9-12")                                             # 9-12 seulement : jamais proposé à un enfant de 6-8 ans
requests.post(B + "/studio/kids/rubrics/bulk", headers=ORG, json={"ids": [F], "rubricIds": [R1["id"]], "mode": "add"})
ok(requests.get(B + "/kids/universes").status_code == 401 and requests.get(B + "/kids/universes", headers=ORG).status_code in (401, 403), "univers : visiteur et jeton adulte refusés")
U = {x["id"]: x for x in requests.get(B + "/kids/universes", headers=K).json()["universes"]}
ok(R1["id"] in U and R2["id"] in U and R3["id"] not in U, "tuiles : un univers vide n'est pas proposé")
ok(U[R1["id"]]["talks"] == 2 and U[R2["id"]]["talks"] == 2, f"tuiles : vrais compteurs pour CET enfant, F (9-12) non compté ({U[R1['id']]['talks']})")
ok(U[R1["id"]]["names"]["en"] == "Test" and U[R1["id"]]["emoji"] == "🧪", "tuile : textes et icône de la catégorie")
r = requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}", headers=K); P1 = r.json()
ok(r.status_code == 200 and {t["id"] for t in P1["talks"]} == {A, Bt} and P1["total"] == 2 and P1["pageSize"] == 24, "page d'un univers : ses vidéos, sans F (tranche d'âge)")
ok(F not in {t["id"] for t in requests.get(B + "/kids/catalog", headers=K).json()["talks"]}, "catalogue : F absent pour un enfant de 6-8 ans")
ok(requests.get(f"{B}/kids/universes/introuvable-{tag}", headers=K).status_code == 404, "univers inconnu : 404")
ok(requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}").status_code == 401, "page d'un univers : visiteur refusé")
ok(requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}", headers=K, params={"page": 2}).json()["talks"] == [], "page 2 vide")
r = requests.post(B + "/categories", headers=ADM, json={"name": f"Thème {tag}", "parentId": R1["id"]}); S1 = r.json()
ok(r.status_code == 201 and S1["catalogueType"] == "kids", "thème créé : il suit le catalogue de son univers")
requests.post(f"{B}/categories/{S1['id']}/talks", headers=ADM, json={"add": [Bt]})
P1 = requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}", headers=K).json()
ok([x["id"] for x in P1["subs"]] == [S1["id"]] and P1["subs"][0]["talks"] == 1, "thèmes de l'univers avec leur compteur")
ok({t["id"] for t in requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}", headers=K, params={"sub": S1["slug"]}).json()["talks"]} == {Bt}, "filtre par thème")
ok(requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}", headers=K, params={"sub": "nexiste-pas"}).status_code == 404, "thème inconnu : 404")
ok(next(t for t in requests.get(B + "/kids/catalog", headers=K).json()["talks"] if t["id"] == Bt)["rubricIds"] == [R1["id"]], "une vidéo d'un thème appartient à l'univers parent")
# classement par univers : retirer R1 enlève aussi le thème
requests.post(B + "/studio/kids/rubrics/bulk", headers=ORG, json={"ids": [F], "rubricIds": [R1["id"]], "mode": "remove"})
ok(requests.get(f"{B}/studio/talks/{F}/kid-rubrics", headers=ORG).json()["rubricIds"] == [], "retrait d'un univers : F n'y est plus")
# --- Séries
cur.execute("insert into series(owner_id,title,description,category_id,published) values (%s,%s,'une série',%s,true) returning id", (aid, f"Série Kids {tag}", R1["id"])); SE = str(cur.fetchone()[0]); series_ids.append(SE)
for i, tid in enumerate((A, Bt, F)): cur.execute("insert into series_episodes(talk_id, series_id, position) values (%s,%s,%s)", (tid, SE, i + 1))
cur.execute("insert into series(owner_id,title,category_id,published) values (%s,%s,%s,false) returning id", (aid, f"Série cachée {tag}", R1["id"])); SE2 = str(cur.fetchone()[0]); series_ids.append(SE2)
cur.execute("insert into series(owner_id,title,category_id,published) values (%s,%s,%s,true) returning id", (aid, f"Série grands {tag}", R1["id"])); SE3 = str(cur.fetchone()[0]); series_ids.append(SE3)
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) values (%s,'x','Cheikh Kids','youtube',%s,%s,'published','ready','free',600,%s) returning id", (f"Grand G {tag}", "v" + uuid.uuid4().hex[:9], oid, ["13-15"])); G = str(cur.fetchone()[0]); talks.append(G)
cur.execute("insert into series_episodes(talk_id, series_id, position) values (%s,%s,1)", (G, SE3))
r = requests.get(f"{B}/kids/series/{SE}", headers=K); d = r.json()
ok(r.status_code == 200 and [e["id"] for e in d["episodes"]] == [A, Bt] and d["series"]["episodes"] == 2, "série : seulement les épisodes de sa tranche d'âge, dans l'ordre")
ok(requests.get(f"{B}/kids/series/{SE2}", headers=K).status_code == 404, "série non publiée : 404")
ok(requests.get(f"{B}/kids/series/{SE3}", headers=K).status_code == 404, "série sans épisode pour sa tranche d'âge : 404")
ok(requests.get(f"{B}/kids/series/{SE}").status_code == 401, "série : visiteur refusé")
P1 = requests.get(f"{B}/kids/universes/{L[R1['id']]['slug']}", headers=K).json()
ok([x["id"] for x in P1["series"]] == [SE], "la page de l'univers propose ses séries visibles par l'enfant")
ok(all(set(x.keys()) >= {"id", "title", "episodes", "posterUrl"} for x in P1["series"]), "série : champs attendus")
# le parent d'un enfant de 9-12 ans voit F et la série des grands pas encore
k2 = requests.post(B + "/me/kids/profiles", headers=P, json={"name": "Grand", "band": "13-15"}).json()["id"]
K2 = {"authorization": "Bearer " + requests.post(f"{B}/me/kids/profiles/{k2}/enter", headers=P).json()["token"]}
ok(requests.get(f"{B}/kids/series/{SE3}", headers=K2).status_code == 200, "tranche 13-15 : la série des grands est visible")
ok(requests.get(f"{B}/kids/series/{SE}", headers=K2).status_code == 404, "tranche 13-15 : pas la série des 6-8 (aucun épisode de sa tranche)")
# catalogue restreint par le parent : « sélection » → rien ne sort de la sélection
cur.execute("update kid_profiles set catalog_mode='selected' where id=%s", (k,))
requests.put(f"{B}/me/kids/profiles/{k}/catalog", headers=P, json={"talkIds": [A], "allowed": True})
ok({t["id"] for t in S(f"histoire {tag}")} == {A}, "recherche : respecte le catalogue choisi par le parent")
ok({t["id"] for t in requests.get(B + "/kids/catalog", headers=K).json()["talks"]} == {A}, "catalogue : idem")
# temps écoulé
cur.execute("update kid_profiles set daily_limit_min=5 where id=%s", (k,)); cur.execute("insert into kid_usage(profile_id, day, seconds, last_ping) values (%s,(now() AT TIME ZONE 'Europe/Paris')::date,600,now()) on conflict (profile_id, day) do update set seconds=600", (k,))
ok(S("histoire") == [] and requests.get(B + "/kids/catalog", headers=K).json()["talks"] == [], "temps écoulé : rien n'est proposé")
# suppression d'un univers : refusée tant qu'il est affiché aux enfants ; les conférences restent
ok(requests.delete(f"{B}/categories/{R1['id']}", headers=ADM, params={"detach": 1}).status_code == 409, "univers actif : suppression refusée (désactiver d'abord)")
requests.delete(f"{B}/categories/{S1['id']}", headers=ADM, params={"detach": 1})
requests.patch(f"{B}/categories/{R1['id']}", headers=ADM, json={"isActive": False})
ok(requests.delete(f"{B}/categories/{R1['id']}", headers=ADM, params={"detach": 1}).status_code in (200, 204), "univers désactivé : supprimé")
cur.execute("select count(*) from talks where id=%s", (A,)); ok(cur.fetchone()[0] == 1, "la conférence est conservée")
ok(requests.delete(f"{B}/categories/{R1['id']}", headers=ADM).status_code == 404, "déjà supprimé : 404")
cleanup()
print("Catalogue Kids : tout est bon")
