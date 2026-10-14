"""31 : thèmes, étiquettes organisateur, engagement depuis un thème, « Mon évolution », retour anonyme aux organisateurs.
Prérequis : API (3055, avec PRACTICE_KEY), PG de test (5544)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def user(tier=None, role="user"):
    email = f"th-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Th"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}, str(uid)


def bare():
    # utilisateur sans connexion (économise les appels : limite de 100 requêtes par minute)
    email = f"th-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Th"})
    cur.execute("select id from users where email=%s", (email,)); return str(cur.fetchone()[0])


def setting(k, v):
    requests.put(B + "/admin/settings", headers=ADM, json={"values": {k: v}}); time.sleep(0.2)


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
O1, o1id = user(role="organizer"); O2, _ = user(role="organizer"); PLAIN, _ = user(); L, lid = user("learning")
tag = uuid.uuid4().hex[:6]
mk = lambda n: requests.post(B + "/talks", headers=O1, json={"title": f"Conf thème {n} {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + n + "abcdefgh")[:11], "rightsConfirmed": True}).json()["id"]
t1, t2 = mk("a"), mk("b")
cur.execute("update talks set publication='published' where id in (%s,%s)", (t1, t2))

# --- bibliothèque cachée tant que la base n'est pas activée
setting("practice_themes_on", "false")
ok(requests.get(B + "/themes").json() == {"enabled": False, "themes": []}, "base désactivée : liste vide")
ok(requests.get(B + "/themes/Q2").status_code == 404, "base désactivée : page de thème introuvable")
r = requests.get(f"{B}/talks/{t1}"); ok(r.json().get("themes") == [], "base désactivée : la conférence n'affiche aucun thème")

# --- étiquettes (Studio)
St = f"{B}/studio/talks/{t1}/themes"
d = requests.get(St, headers=O1).json()
ok(d["enabled"] is False and d["max"] == 3 and d["selected"] == [] and len(d["themes"]) == 33, "Studio : 33 thèmes proposés, aucun choisi")
ok(requests.get(St, headers=O2).status_code == 404, "un autre organisateur n'a pas accès")
ok(requests.get(St, headers=PLAIN).status_code == 403 and requests.get(St).status_code in (401, 403), "membre simple et visiteur refusés")
ok(requests.put(St, headers=O1, json={"themeIds": ["Q1", "Q2", "Q3", "Q4"]}).status_code == 400, "plus de 3 thèmes refusé")
ok(requests.put(St, headers=O1, json={"themeIds": ["Z9"]}).status_code == 400, "identifiant mal formé refusé")
ok(requests.put(St, headers=O1, json={"themeIds": ["Q99"]}).status_code == 400, "thème inconnu refusé")
ok(requests.put(St, headers=O2, json={"themeIds": ["Q2"]}).status_code == 404, "un autre organisateur ne peut pas étiqueter")
ok(requests.put(St, headers=O1, json={"themeIds": ["Q2", "D4", "Q2"]}).json()["selected"] == ["D4", "Q2"], "étiquettes enregistrées (doublon ignoré)")
ok(requests.put(f"{B}/studio/talks/{t2}/themes", headers=ADM, json={"themeIds": ["Q2"]}).status_code == 200, "un administrateur peut étiqueter")

# --- base activée
setting("practice_themes_on", "true")
lst = requests.get(B + "/themes").json()
ok(lst["enabled"] and len(lst["themes"]) == 33 and {t["kind"] for t in lst["themes"]} == {"quality", "defect", "action"}, "33 thèmes : qualités, défauts, actions")
q2 = next(t for t in lst["themes"] if t["id"] == "Q2")
ok(q2["talks"] >= 2, "compteur de conférences par thème")
p = requests.get(B + "/themes/Q2").json()
ok(len(p["steps"]) == 3 and p["steps"][0]["size"] == 1 and {x["id"] for x in p["talks"]} >= {t1, t2}, "page du thème : 3 petits pas et conférences associées")
cur.execute("update talks set publication='draft' where id=%s", (t2,))
ok(t2 not in {x["id"] for x in requests.get(B + "/themes/Q2").json()["talks"]}, "une conférence non publiée n'apparaît pas")
cur.execute("update talks set publication='published' where id=%s", (t2,))
ok(requests.get(B + "/themes/A5").json()["kind"] == "action", "thème d'action disponible")
ok(requests.get(B + "/themes/Q99").status_code == 404 and requests.get(B + "/themes/xx").status_code in (400, 404), "thème inconnu : 404")
ok([x["id"] for x in requests.get(f"{B}/talks/{t1}").json()["themes"]] == ["D4", "Q2"], "la conférence affiche ses thèmes")

# --- les thèmes d'action ne servent pas aux objectifs de bilan
ok(requests.get(B + "/me/selfcheck/themes", headers=L).json()["themes"].__len__() == 24, "bilan : seulement qualités et défauts (24)")
ok(requests.post(B + "/me/selfcheck/goals", headers=L, json={"nature": "defect", "themeId": "Q2", "consent": True}).status_code == 400, "qualité refusée dans la liste des défauts")

# --- s'engager depuis un thème
E = B + "/me/practice/themes/Q2"
ok(requests.post(E, headers=PLAIN, json={"size": 1}).status_code == 403, "sans Apprentissage : refusé")
ok(requests.post(E, headers=L, json={"size": 1}).status_code == 409, "accord nécessaire")
ok(requests.post(E, headers=L, json={"size": 4, "consent": True}).status_code == 400, "taille hors 1-3 refusée")
ok(requests.post(B + "/me/practice/themes/Q99", headers=L, json={"size": 1, "consent": True}).status_code == 404, "thème inconnu : 404")
r = requests.post(E, headers=L, json={"size": 1, "consent": True, "niyya": "Pour garder le calme"})
ok(r.status_code == 201 and r.json()["text"].startswith("Attendre 10 secondes") and r.json()["dueKind"] == "week", "engagement créé depuis le thème (échéance cette semaine)")
mine = requests.get(B + "/me/practice", headers=L).json()["items"]
ok(len(mine) == 1 and mine[0]["talkId"] is None and mine[0]["niyya"] == "Pour garder le calme", "visible dans « Mes engagements »")
cur.execute("select text_enc, theme_enc from practice_commitments where user_id=%s", (lid,)); te, th = cur.fetchone()
ok("Attendre" not in te and th != "Q2" and th != "", "texte et thème chiffrés en base")

# --- Mon évolution
EV = B + "/me/evolution"
ok(requests.get(EV, headers=PLAIN).status_code == 403 and requests.get(EV).status_code == 401, "évolution : réservée à Apprentissage")
d = requests.get(EV, headers=L).json()
q = next(t for t in d["themes"] if t["id"] == "Q2")
ok(len(d["months"]) == 12 and d["month"] == d["months"][0] and q["made"] == 1 and q["done"] == 0, "mois en cours : 1 engagement pris sur la patience")
ok(requests.get(EV + "?month=1999-01", headers=L).status_code == 400 and requests.get(EV + "?month=abc", headers=L).status_code == 400, "mois hors période refusé")
# conférence terminée + quiz réussi + engagement sur conférence + objectif avec bilan
cur.execute("insert into watch_progress(user_id,talk_id,position_ms,duration_ms,completed) values (%s,%s,1000,1000,true)", (lid, t1))
cur.execute("insert into quiz_attempts(user_id,talk_id,score,total,percent,passed) values (%s,%s,4,5,80,true)", (lid, t1))
cur.execute("insert into quiz_attempts(user_id,talk_id,score,total,percent,passed) values (%s,%s,5,5,100,true)", (lid, t1))
cur.execute("insert into practice_commitments(user_id,talk_id,size,text_enc,niyya_enc,status,done_at) values (%s,%s,1,'x','','done',now())", (lid, t1))
g = requests.post(B + "/me/selfcheck/goals", headers=L, json={"nature": "quality", "themeId": "Q2"}).json()
requests.put(f"{B}/me/selfcheck/goals/{g['id']}/checkin", headers=L, json={"status": "progress"})
d = requests.get(EV, headers=L).json()
q = next(t for t in d["themes"] if t["id"] == "Q2"); d4 = next(t for t in d["themes"] if t["id"] == "D4")
ok(q["watched"] == 1 and q["quizzes"] == 1, "appris : 1 conférence vue, 1 quiz réussi (deux tentatives = 1 conférence)")
ok(q["made"] == 2 and q["done"] == 1 and q["goals"] == 1 and q["progress"] == 1, "mis en pratique : engagements pris/tenus, objectif en progrès")
ok(d4["watched"] == 1 and d4["goals"] == 0, "la conférence compte pour chacun de ses thèmes")
ok(not any(k in q for k in ("score", "percent", "streak", "rank")), "aucun score ni classement")
# mois passé : vide pour ces faits
prev = d["months"][1]
ok(requests.get(f"{EV}?month={prev}", headers=L).json()["themes"] == [], "mois précédent : rien")
# un autre compte ne voit rien
L2, _ = user("learning")
ok(requests.get(EV, headers=L2).json()["themes"] == [], "un autre compte ne voit pas ces données")

# --- retour anonyme aux organisateurs (6 personnes minimum)
SP = f"{B}/studio/stats?days=30"
r = requests.get(SP, headers=O1).json()["practice"]
ok(r["min"] == 6 and r["committed"] is None and r["talks"] == [], "1 personne : aucun chiffre")
time.sleep(61)
users = [bare() for _ in range(4)]
for u in users:
    cur.execute("insert into practice_commitments(user_id,talk_id,size,text_enc,niyya_enc) values (%s,%s,1,'x','')", (u, t1))
r = requests.get(SP, headers=O1).json()["practice"]
ok(r["committed"] is None, "5 personnes : toujours masqué (seuil : au-delà de 5)")
u6 = bare()
cur.execute("insert into practice_commitments(user_id,talk_id,size,text_enc,niyya_enc) values (%s,%s,1,'x','')", (u6, t1))
cur.execute("insert into practice_commitments(user_id,talk_id,size,text_enc,niyya_enc) values (%s,%s,2,'y','')", (u6, t1))  # même personne 2 fois
r = requests.get(SP, headers=O1).json()["practice"]
ok(r["committed"] == 6 and r["talks"][0]["talkId"] == t1 and r["talks"][0]["committed"] == 6 and r["done"] is None, "6 personnes : chiffre affiché (une personne comptée une fois)")
ok(requests.get(f"{SP}&talk={t1}", headers=O2).status_code == 404, "un autre organisateur ne voit pas ces chiffres")
ok("practice" in requests.get(B + "/admin/stats?days=30", headers=ADM).json() and requests.get(B + "/admin/stats?days=30", headers=ADM).json()["practice"] is None, "statistiques du site entier : pas de chiffre")
ok(requests.get(f"{SP}&audience=kids", headers=O1).json()["practice"] is None, "Kids : aucun chiffre")
raw = str(requests.get(SP, headers=O1).json()["practice"])
ok(not any(u in raw for u in users + [lid]), "aucune identité dans la réponse")
csv_txt = requests.get(SP + "&format=csv", headers=O1).text
ok("Après la conférence" in csv_txt, "export CSV : section retour anonyme")

# --- effacement du compte : cascade
cur.execute("delete from users where id=%s", (lid,))
cur.execute("select count(*) from practice_commitments where user_id=%s", (lid,)); ok(cur.fetchone()[0] == 0, "suppression du compte : engagements effacés")
setting("practice_themes_on", "false")
print("TOUT EST OK")
