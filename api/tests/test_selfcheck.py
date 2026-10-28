"""30 : bilan personnel « Tazkiyat an-nafs » — objectifs, bilan hebdomadaire, thèmes, rappel (préférences), confidentialité, export, effacement.
Prérequis : API (3055, avec PRACTICE_KEY), PG de test (5544)."""
import csv, io, json, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def user(tier=None):
    email = f"sc-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Sc"})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}, str(uid)


def setting(k, v):
    requests.put(B + "/admin/settings", headers=ADM, json={"values": {k: v}}); time.sleep(0.1)


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
A, aid = user("learning"); A2, a2id = user("learning"); PLAIN, plain_id = user()
S = B + "/me/selfcheck"

# --- droits
ok(requests.get(S).status_code == 401, "sans connexion : refusé")
r = requests.get(S, headers=PLAIN)
ok(r.status_code == 403 and r.json()["code"] == "learning_required", "membre sans Apprentissage : refusé (learning_required)")
ok(requests.post(S + "/goals", headers=PLAIN, json={"nature": "defect", "title": "Ma colère", "consent": True}).status_code == 403, "membre sans Apprentissage : création refusée")
d = requests.get(S, headers=A).json()
ok(d["goals"] == [] and d["limit"] == 20 and len(d["weeks"]) == 8 and d["week"] == d["weeks"][-1] and d["consent"] is False, "état initial : aucun objectif, 8 semaines, pas d'accord")
ok(d["prefs"] == {"email": True, "weekday": 5} and d["themesEnabled"] is False and d["emailEnabled"] is True and d["emailHour"] == 17, "rappel : vendredi, actif, 17 h par défaut ; thèmes désactivés")
cur.execute("select to_char(date_trunc('week', now() at time zone 'Europe/Paris')::date,'YYYY-MM-DD')"); wk = cur.fetchone()[0]
ok(d["week"] == wk, f"semaine en cours = lundi {wk}")

# --- thèmes : désactivés tant que non relus
ok(requests.get(S + "/themes", headers=A).json() == {"enabled": False, "themes": []}, "base de thèmes désactivée par défaut")
r = requests.post(S + "/goals", headers=A, json={"nature": "defect", "themeId": "D4", "consent": True})
ok(r.status_code == 400 and r.json()["code"] == "theme", "thème refusé tant que la base est désactivée")

# --- création : accord, validation
r = requests.post(S + "/goals", headers=A, json={"nature": "defect", "title": "Ne plus m'énerver contre mes enfants"})
ok(r.status_code == 409 and r.json()["code"] == "consent_required", "premier objectif sans accord : 409 consent_required")
ok(requests.post(S + "/goals", headers=A, json={"nature": "defect", "title": "ab", "consent": True}).status_code == 400, "intitulé trop court refusé")
ok(requests.post(S + "/goals", headers=A, json={"nature": "autre", "title": "Mon objectif", "consent": True}).status_code == 400, "nature inconnue refusée")
ok(requests.post(S + "/goals", headers=A, json={"nature": "defect", "consent": True}).status_code == 400, "ni thème ni intitulé : refusé")
g1 = requests.post(S + "/goals", headers=A, json={"nature": "defect", "title": "Ne plus m'énerver contre mes enfants", "consent": True}).json()
ok(g1["nature"] == "defect" and g1["title"].startswith("Ne plus") and g1["current"] is None and g1["archived"] is False, "objectif créé (défaut à corriger)")
g2 = requests.post(S + "/goals", headers=A, json={"nature": "quality", "title": "Être plus patient"}).json()
ok(g2["nature"] == "quality", "objectif créé (qualité à cultiver), accord déjà donné")
cur.execute("select title_enc, theme_enc from self_goals where id=%s", (g1["id"],)); row = cur.fetchone()
ok("énerver" not in row[0] and "enfants" not in row[0] and row[0], "intitulé chiffré en base")
cur.execute("select count(*) from self_goals where title_enc like '%%patient%%' or title_enc like '%%énerver%%'"); ok(cur.fetchone()[0] == 0, "aucun intitulé en clair dans la table")

# --- thèmes activés
setting("practice_themes_on", "true")
t = requests.get(S + "/themes", headers=A).json()
ok(t["enabled"] and len(t["themes"]) == 24 and sum(1 for x in t["themes"] if x["kind"] == "quality") == 12 and sum(1 for x in t["themes"] if x["kind"] == "defect") == 12, "base de thèmes : 12 qualités + 12 défauts")
ok(all(set(x) == {"id", "kind", "title", "translit", "ar", "desc"} for x in t["themes"]), "thèmes sans les « petits pas » (réservés à l'étape 31)")
ok(any(x["id"] == "D4" and x["title"] == "La colère" and x["ar"] == "غضب" for x in t["themes"]), "thème D4 : La colère (غضب)")
r = requests.post(S + "/goals", headers=A, json={"nature": "quality", "themeId": "D4"})
ok(r.status_code == 400 and r.json()["code"] == "theme", "thème d'une autre liste refusé")
ok(requests.post(S + "/goals", headers=A, json={"nature": "defect", "themeId": "D99"}).status_code == 400 and requests.post(S + "/goals", headers=A, json={"nature": "defect", "themeId": "X1"}).status_code == 400, "thème inconnu refusé")
g3 = requests.post(S + "/goals", headers=A, json={"nature": "defect", "themeId": "D4"}).json()
ok(g3["title"] == "La colère" and g3["themeId"] == "D4", "objectif créé depuis un thème : intitulé repris")
cur.execute("select theme_enc from self_goals where id=%s", (g3["id"],)); enc = cur.fetchone()[0]; ok(enc != "D4" and len(enc) > 20, "le code du thème est chiffré aussi (il révélerait le défaut)")  # « D4 » peut apparaître par hasard dans du base64 : on ne teste pas la sous-chaîne
setting("practice_themes_on", "false")

# --- bilan de la semaine
C = f"{S}/goals/{g1['id']}/checkin"
ok(requests.put(C, headers=A, json={"status": "reussi"}).status_code == 400, "état inconnu refusé")
ok(requests.put(C, headers=A2, json={"status": "progress"}).status_code == 404, "un autre membre ne peut pas faire le bilan de mon objectif")
r = requests.put(C, headers=A, json={"status": "progress", "note": "Deux crises évitées, une ratée"}).json()
ok(r["week"] == wk and r["status"] == "progress" and r["note"].startswith("Deux crises"), "bilan : en progrès + note")
cur.execute("select note_enc from self_checkins where goal_id=%s", (g1["id"],)); ok("crises" not in cur.fetchone()[0], "note chiffrée en base")
r = requests.put(C, headers=A, json={"status": "achieved"}).json()
ok(r["status"] == "achieved" and r["note"].startswith("Deux crises"), "changer d'état garde la note")
r = requests.put(C, headers=A, json={"status": "achieved", "note": ""}).json()
ok(r["note"] == "", "note effaçable")
cur.execute("select count(*) from self_checkins where goal_id=%s", (g1["id"],)); ok(cur.fetchone()[0] == 1, "une seule ligne par objectif et par semaine")
# semaines passées
cur.execute("select to_char(%s::date - 14, 'YYYY-MM-DD'), to_char(%s::date - 49, 'YYYY-MM-DD'), to_char(%s::date - 56, 'YYYY-MM-DD'), to_char(%s::date + 7, 'YYYY-MM-DD'), to_char(%s::date - 12, 'YYYY-MM-DD')", (wk,) * 5)
w2, w7, w8, wnext, wmid = cur.fetchone()
ok(requests.put(C, headers=A, json={"status": "not_yet", "week": w2}).status_code == 200, "semaine passée (il y a 2 semaines) renseignable")
r = requests.put(C, headers=A, json={"status": "progress", "week": wmid}).json()
ok(r["week"] == w2, "une date en milieu de semaine est ramenée au lundi")
ok(requests.put(C, headers=A, json={"status": "progress", "week": w7}).status_code == 200, "il y a 7 semaines : possible (frise de 8 semaines)")
r = requests.put(C, headers=A, json={"status": "progress", "week": w8})
ok(r.status_code == 400 and r.json()["code"] == "week", "plus de 8 semaines : refusé")
r = requests.put(C, headers=A, json={"status": "progress", "week": wnext})
ok(r.status_code == 400 and r.json()["code"] == "week", "semaine à venir : refusée")
d = requests.get(S, headers=A).json()
g = {x["id"]: x for x in d["goals"]}[g1["id"]]
ok(g["current"]["status"] == "achieved" and g["marks"][wk] == "achieved" and g["marks"][w2] == "progress" and g["marks"][w7] == "progress" and len(g["marks"]) == 3, "vue : état de la semaine + frise des semaines passées")
ok(not any(k in json.dumps(d).lower() for k in ("percent", "pourcent", "score", "total", "streak", "badge")), "aucun total, score, pourcentage, série ni badge dans la réponse")
ok(requests.delete(f"{C}?week={w7}", headers=A2).status_code == 404, "un autre membre ne peut pas effacer mon bilan")
ok(requests.delete(f"{C}?week={w7}", headers=A).status_code == 204 and w7 not in {x["id"]: x for x in requests.get(S, headers=A).json()["goals"]}[g1["id"]]["marks"], "bilan d'une semaine effaçable")

# --- lien avec un engagement de l'étape 29
cur.execute("insert into practice_commitments(user_id,text_enc,status) values (%s,'x','doing') returning id", (aid,)); cid = str(cur.fetchone()[0])
cur.execute("insert into practice_commitments(user_id,text_enc,status) values (%s,'y','doing') returning id", (a2id,)); cid2 = str(cur.fetchone()[0])
r = requests.patch(f"{S}/goals/{g1['id']}", headers=A, json={"commitmentId": cid})
ok(r.status_code == 200 and r.json()["commitmentId"] == cid, "objectif relié à un de mes engagements")
ok(requests.patch(f"{S}/goals/{g1['id']}", headers=A, json={"commitmentId": cid2}).status_code == 404, "l'engagement d'un autre est refusé")
ok(requests.post(S + "/goals", headers=A, json={"nature": "quality", "title": "Objectif avec lien", "commitmentId": cid2}).status_code == 404, "idem à la création")
ok(requests.patch(f"{S}/goals/{g1['id']}", headers=A, json={"commitmentId": None}).json()["commitmentId"] is None, "lien retirable")
requests.patch(f"{S}/goals/{g1['id']}", headers=A, json={"commitmentId": cid})
cur.execute("delete from practice_commitments where id=%s", (cid,))
ok(requests.get(S, headers=A).json()["goals"][0]["commitmentId"] is None, "engagement supprimé : l'objectif reste, sans lien")

# --- modification, archivage, limite
ok(requests.patch(f"{S}/goals/{g2['id']}", headers=A2, json={"title": "Piraté"}).status_code == 404, "un autre membre ne peut pas modifier mon objectif")
ok(requests.patch(f"{S}/goals/{g2['id']}", headers=A, json={}).status_code == 400, "rien à modifier : refusé")
ok(requests.patch(f"{S}/goals/{g2['id']}", headers=A, json={"title": "Être patient avec mes proches"}).json()["title"] == "Être patient avec mes proches", "intitulé modifiable")
r = requests.patch(f"{S}/goals/{g2['id']}", headers=A, json={"archived": True}).json()
ok(r["archived"] is True, "objectif archivé")
ok(g2["id"] not in [x["id"] for x in requests.get(S, headers=A).json()["goals"]], "archivé : absent de la liste active")
ok(g2["id"] in [x["id"] for x in requests.get(S + "?archived=1", headers=A).json()["goals"]], "archivé : visible avec ?archived=1")
ok(requests.put(f"{S}/goals/{g2['id']}/checkin", headers=A, json={"status": "progress"}).status_code == 409, "bilan d'un objectif archivé : refusé tant qu'il n'est pas désarchivé")
ok(requests.patch(f"{S}/goals/{g2['id']}", headers=A, json={"archived": False}).json()["archived"] is False, "objectif désarchivé")
for i in range(20 - 3 + 1):  # g1, g2, g3 actifs = 3 ; on monte à 20
    r = requests.post(S + "/goals", headers=A, json={"nature": "quality", "title": f"Objectif numéro {i}"})
    if r.status_code != 201:
        break
ok(r.status_code == 409 and r.json()["code"] == "limit", "limite de 20 objectifs actifs : 409 limit")
n = requests.get(S, headers=A).json()["goals"]; ok(len(n) == 20, "exactement 20 objectifs actifs")
ok(requests.patch(f"{S}/goals/{n[-1]['id']}", headers=A, json={"archived": True}).status_code == 200 and requests.post(S + "/goals", headers=A, json={"nature": "quality", "title": "Un de plus après archivage"}).status_code == 201, "archiver libère une place, sans rien perdre")

# --- isolation entre comptes
ok(requests.get(S, headers=A2).json()["goals"] == [], "un autre membre ne voit aucun objectif")
ok(requests.delete(f"{S}/goals/{g1['id']}", headers=A2).status_code == 204 and any(x["id"] == g1["id"] for x in requests.get(S, headers=A).json()["goals"]), "supprimer l'objectif d'un autre ne fait rien")
adm = requests.get(S, headers=ADM).json()
ok(all(x["id"] not in {y["id"] for y in adm["goals"]} for x in n), "un administrateur ne voit que ses propres objectifs (aucune route d'accès aux autres comptes)")
for path in ("/admin/stats?days=7", "/admin/users"):
    body = requests.get(B + path, headers=ADM).text
    ok("énerver" not in body and "Objectif numéro" not in body and "self_goals" not in body, f"{path} : aucun contenu personnel")
st = requests.get(B + "/admin/stats?days=7", headers=ADM).json()
ok("selfcheck" not in json.dumps(st).lower() and "goal" not in json.dumps(st).lower(), "statistiques : aucune donnée du bilan")

# --- préférences du rappel
ok(requests.put(S + "/prefs", headers=A, json={}).status_code == 400 and requests.put(S + "/prefs", headers=A, json={"weekday": 9}).status_code == 400, "préférences invalides refusées")
r = requests.put(S + "/prefs", headers=A, json={"weekday": 6, "email": False}).json()
ok(r == {"email": False, "weekday": 6}, "rappel : samedi, désactivé")
ok(requests.get(S, headers=A).json()["prefs"] == {"email": False, "weekday": 6}, "préférences conservées")
ok(requests.put(S + "/prefs", headers=PLAIN, json={"email": False}).status_code == 403, "préférences réservées à Apprentissage")

# --- export
r = requests.get(S + "/export", headers=A); d = r.json()
ok(r.status_code == 200 and "attachment" in r.headers["content-disposition"] and len(d["goals"]) >= 20, "export JSON")
x = {g["title"]: g for g in d["goals"]}["Ne plus m'énerver contre mes enfants"]
ok(x["nature"] == "defect" and {c["week"] for c in x["checkins"]} == {wk, w2}, "export : objectifs et bilans en clair pour la personne")
r = requests.get(S + "/export?format=csv", headers=A)
rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
ok(r.headers["content-type"].startswith("text/csv") and rows[0] == ["liste", "objectif", "archive", "semaine", "etat", "note"] and any(x[1].startswith("Ne plus") and x[3] == wk and x[4] == "achieved" for x in rows), "export CSV (en-tête, une ligne par bilan)")
ok(requests.get(S + "/export?format=xml", headers=A).status_code == 400, "format d'export inconnu refusé")

# --- abonnement terminé : export et effacement restent possibles
cur.execute("update subscriptions set status='canceled' where user_id=%s", (aid,))
ok(requests.get(S, headers=A).status_code == 403 and requests.put(S + "/prefs", headers=A, json={"email": True}).status_code == 403, "abonnement terminé : bilan fermé")
ok(requests.get(S + "/export", headers=A).status_code == 200, "abonnement terminé : export possible")
ok(requests.delete(S, headers=A).status_code == 204, "abonnement terminé : effacement possible")
cur.execute("select count(*) from self_goals where user_id=%s", (aid,)); ok(cur.fetchone()[0] == 0, "objectifs effacés")
cur.execute("select count(*) from self_checkins c left join self_goals g on g.id=c.goal_id where g.id is null"); ok(cur.fetchone()[0] == 0, "bilans effacés avec les objectifs (cascade)")

# --- « Tout effacer » de l'étape 29 efface aussi le bilan et retire l'accord
cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,'learning')", ("sub_" + uuid.uuid4().hex[:12], a2id))
requests.post(S + "/goals", headers=A2, json={"nature": "quality", "title": "Un objectif à effacer", "consent": True})
ok(len(requests.get(S, headers=A2).json()["goals"]) == 1, "2e membre : un objectif")
requests.delete(B + "/me/practice", headers=A2)
d = requests.get(S, headers=A2).json()
ok(d["goals"] == [] and d["consent"] is False, "DELETE /me/practice : objectifs effacés et accord retiré")
# --- suppression du compte : cascade
requests.post(S + "/goals", headers=A2, json={"nature": "quality", "title": "Objectif avant suppression du compte", "consent": True})
cur.execute("delete from users where id=%s", (a2id,))
cur.execute("select count(*) from self_goals where user_id=%s", (a2id,)); ok(cur.fetchone()[0] == 0, "compte supprimé : objectifs supprimés (cascade)")
cur.execute("delete from self_goals where user_id=%s", (aid,))
setting("practice_themes_on", "false")
print("tout est bon")
