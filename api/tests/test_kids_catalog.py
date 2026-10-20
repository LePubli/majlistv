"""Mejliss Kids en vrai catalogue (20/10) : rubriques (Admin), classement des conférences (Studio, lot), catalogue enfant (rangées :
rubriques, nouveautés, pour ton âge, parce que tu as aimé, plus regardés), recherche enfant (titre, intervenant, rubrique ; jamais d'adulte,
de brouillon ni de saisie dangereuse), droits. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks, rubrics = [], [], []


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for r in rubrics: cur.execute("delete from kid_rubrics where id=%s", (r,))
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

# --- Rubriques (Admin)
r = requests.get(B + "/admin/kids/rubrics", headers=ADM); L = r.json()
ok(r.status_code == 200 and {"histoires", "prophetes", "valeurs", "coran", "sciences", "chants", "jeux", "arabe"} <= {x["slug"] for x in L}, "8 rubriques de départ présentes")
ok(requests.get(B + "/admin/kids/rubrics", headers=ORG).status_code == 403, "liste Admin refusée à un organisateur")
ok(requests.post(B + "/admin/kids/rubrics", headers=ORG, json={"names": {"fr": "X"}}).status_code == 403, "création refusée à un organisateur")
r = requests.post(B + "/admin/kids/rubrics", headers=ADM, json={"names": {"fr": f"Test {tag}", "en": "Test", "ar": "اختبار"}, "emoji": "🧪"}); ok(r.status_code == 201, "rubrique créée"); R1 = r.json(); rubrics.append(R1["id"])
r = requests.post(B + "/admin/kids/rubrics", headers=ADM, json={"names": {"fr": f"Test {tag}"}}); ok(r.status_code == 201 and r.json()["slug"] != R1["slug"], "même nom : identifiant distinct"); R2 = r.json(); rubrics.append(R2["id"])
ok(requests.post(B + "/admin/kids/rubrics", headers=ADM, json={"names": {"fr": ""}}).status_code == 400, "nom vide refusé")
ok(requests.patch(f"{B}/admin/kids/rubrics/{R2['id']}", headers=ADM, json={"names": {"fr": f"Deuxième {tag}", "en": "Second"}}).json()["names"]["fr"] == f"Deuxième {tag}", "rubrique renommée")
ok(requests.put(B + "/admin/kids/rubrics/order", headers=ADM, json={"ids": [R2["id"], R1["id"]]}).status_code == 204, "ordre enregistré")
L = {x["id"]: x for x in requests.get(B + "/admin/kids/rubrics", headers=ADM).json()}
ok(L[R2["id"]]["position"] < L[R1["id"]]["position"], "R2 passe avant R1")

# --- Conférences + classement (Studio)
UP = {"3-6": ["3-6", "7-10", "11-14"], "7-10": ["7-10", "11-14"], "11-14": ["11-14"], None: []}


def talk(title, band, owner=None, pub="published", speaker="Cheikh Kids", access="free"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) values (%s,'une histoire de patience',%s,'youtube',%s,%s,%s,'ready',%s,600,%s) returning id",
                (f"{title} {tag}", speaker, "v" + uuid.uuid4().hex[:9], owner or oid, pub, access, UP[band])); tid = str(cur.fetchone()[0]); talks.append(tid); return tid


A = talk("Histoire A", "7-10"); Bt = talk("Histoire B", "3-6"); C = talk("Chant C", "7-10"); D = talk("Brouillon D", "7-10", pub="draft"); ADULT = talk("Adulte E", None); OTHER = talk("De l'autre", "7-10", owner=o2id)
_r = requests.put(f"{B}/studio/talks/{A}/kid-rubrics", headers=ORG, json={"rubricIds": [R1["id"], R2["id"]]}); ok(sorted(_r.json().get("rubricIds") or []) == sorted([R1["id"], R2["id"]]), "l'organisateur classe sa conférence")
ok(sorted(requests.get(f"{B}/studio/talks/{A}/kid-rubrics", headers=ORG).json()["rubricIds"]) == sorted([R1["id"], R2["id"]]), "classement relu")
ok(requests.put(f"{B}/studio/talks/{OTHER}/kid-rubrics", headers=ORG, json={"rubricIds": [R1["id"]]}).status_code == 404, "pas la conférence d'un autre")
ok(requests.put(f"{B}/studio/talks/{A}/kid-rubrics", headers=ORG, json={"rubricIds": [999999]}).status_code == 400, "rubrique inconnue refusée")
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
k = requests.post(B + "/me/kids/profiles", headers=P, json={"name": "Yacine", "band": "7-10"}).json()["id"]
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
ok(next(t for t in d["talks"] if t["id"] == A)["rubricIds"] == sorted([R1["id"], R2["id"]]), "chaque vidéo porte ses rubriques")
# rubrique inactive : cachée
ok(requests.patch(f"{B}/admin/kids/rubrics/{R2['id']}", headers=ADM, json={"active": False}).json()["active"] is False, "rubrique désactivée")
d = requests.get(B + "/kids/catalog", headers=K).json()
ok(R2["id"] not in [x["id"] for x in d["rubrics"]] and R2["id"] not in [s.get("rubricId") for s in d["shelves"]], "rubrique inactive cachée aux enfants")
ok(requests.patch(f"{B}/admin/kids/rubrics/{R2['id']}", headers=ADM, json={"active": True}).status_code == 200, "rubrique réactivée")
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
res = {t["id"] for t in S(f"{tag}")}
ok(D not in res and ADULT not in res, "jamais de brouillon ni de contenu adulte")
ok({t["id"] for t in S(f"histoire {tag}", rubric=R2["id"])} == {A, C} and {t["id"] for t in S(f"histoire {tag}", rubric=R1["id"])} == {A, Bt}, "recherche filtrée par rubrique")
ok(S("zzzzzzzz") == [], "aucun résultat : liste vide")
ok(S("%") == [] and S("_") == [] and S("\\") == [], "caractères spéciaux sans effet")
ok(requests.get(B + "/kids/search", headers=K, params={"q": ""}).status_code == 400, "requête vide refusée")
ok(requests.get(B + "/kids/search", params={"q": "histoire"}).status_code == 401, "recherche : visiteur refusé")
ok(all("transcript" not in str(t.keys()) for t in S("histoire")), "aucun extrait de transcription")
# catalogue restreint par le parent : « sélection » → rien ne sort de la sélection
cur.execute("update kid_profiles set catalog_mode='selected' where id=%s", (k,))
requests.put(f"{B}/me/kids/profiles/{k}/catalog", headers=P, json={"talkIds": [A], "allowed": True})
ok({t["id"] for t in S(f"histoire {tag}")} == {A}, "recherche : respecte le catalogue choisi par le parent")
ok({t["id"] for t in requests.get(B + "/kids/catalog", headers=K).json()["talks"]} == {A}, "catalogue : idem")
# temps écoulé
cur.execute("update kid_profiles set daily_limit_min=5 where id=%s", (k,)); cur.execute("insert into kid_usage(profile_id, day, seconds, last_ping) values (%s,(now() AT TIME ZONE 'Europe/Paris')::date,600,now()) on conflict (profile_id, day) do update set seconds=600", (k,))
ok(S("histoire") == [] and requests.get(B + "/kids/catalog", headers=K).json()["talks"] == [], "temps écoulé : rien n'est proposé")
# suppression d'une rubrique : les conférences restent
ok(requests.delete(f"{B}/admin/kids/rubrics/{R1['id']}", headers=ADM).status_code == 204, "rubrique supprimée")
cur.execute("select count(*) from talks where id=%s", (A,)); ok(cur.fetchone()[0] == 1, "la conférence est conservée")
ok(requests.delete(f"{B}/admin/kids/rubrics/{R1['id']}", headers=ADM).status_code == 404, "déjà supprimée : 404")
cleanup()
print("Catalogue Kids : tout est bon")
