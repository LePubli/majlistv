"""38 : cartes mémoire — palier, cartes issues des quiz validés, séance du jour, calendrier, plafonds, séance libre, suppression.
Prérequis : API de test (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(tier=None):
    email = f"cards-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Membre"})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    if tier:
        cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:8], uid, tier))
    return login(email, "Passw0rd-test"), uid


def setting(A, **kv):
    r = requests.put(B + "/admin/settings", headers=A, json={"values": kv}); ok(r.status_code == 200, f"réglage {list(kv)}")


ADM = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
L, lu = member("learning"); S, su = member("standard"); N, nu = member()
tag = uuid.uuid4().hex[:6]


def talk(title, pub="published"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language) values (%s,'d','Cheikh','youtube','abc',%s,%s,'ready','free',600,'ready','fr') returning id", (f"{title} {tag}", aid, pub))
    return str(cur.fetchone()[0])


def addq(tid, i, status="approved"):
    cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,evidence_quote,chapter_ms,chapter_title,origin,status) values (%s,'fr',%s,%s,1,%s,%s,'le passage cité',0,'Intro','manual',%s) returning id",
                (tid, f"Question {i} ?", '["Faux","Vrai","Autre"]', f"Parce que {i}.", 1000 * i, status))
    return str(cur.fetchone()[0])


def attempt(uid, tid):
    cur.execute("insert into quiz_attempts(user_id,talk_id,score,total,percent,passed) values (%s,%s,3,5,60,false)", (uid, tid))


t1 = talk("Cartes A"); t2 = talk("Cartes B"); t3 = talk("Cartes cachée", "draft")
q1 = [addq(t1, i) for i in range(1, 5)]; q2 = [addq(t2, i) for i in range(5, 8)]
dr = addq(t1, 9, "draft"); q3 = addq(t3, 10)

# 1) Palier et droits
ok(requests.get(B + "/me/cards").status_code == 401, "sans compte : 401")
for who, H in (("membre sans abonnement", N), ("abonnement standard", S)):
    r = requests.get(B + "/me/cards", headers=H); ok(r.status_code == 403 and r.json()["code"] == "learning_required", f"{who} : réservé à Apprentissage")
ok(requests.post(f"{B}/me/cards/{q1[0]}/answer", headers=N, json={"known": True}).status_code == 403, "réponse sans palier : 403")

# 2) Aucune carte tant qu'aucun quiz n'a été passé
r = requests.get(B + "/me/cards", headers=L).json()
ok(r["session"]["cards"] == [] and r["counts"]["total"] == 0, "aucun quiz passé : aucune carte")

# 3) Quiz passé sur A → ses 4 questions validées (pas le brouillon, pas la conférence B ni la cachée)
attempt(lu, t1)
setting(ADM, cards_daily_max="20", cards_new_per_day="3")
r = requests.get(B + "/me/cards", headers=L).json()
ids = [c["id"] for c in r["session"]["cards"]]
ok(len(ids) == 3 and set(ids) <= set(q1) and dr not in ids, "3 nouvelles cartes (plafond du jour), uniquement des questions validées de la conférence passée")
ok(r["counts"]["total"] == 4 and r["counts"]["newAvailable"] == 3, "compteurs : 4 cartes possibles, 3 nouvelles aujourd'hui")
c = r["session"]["cards"][0]
ok(c["front"].startswith("Question") and c["answer"] == "Vrai" and c["explanation"].startswith("Parce que") and c["quote"] == "le passage cité" and c["startMs"] is not None, "carte : recto, bonne réponse, explication, citation, minute")
ok("options" not in c and "correct_index" not in c and c["talkTitle"].startswith("Cartes A"), "carte : pas de liste d'options, titre de la conférence")
cur.execute("select 1"); other = requests.get(B + "/me/cards", headers=S)
ok(other.status_code == 403, "les cartes d'un membre ne fuient pas vers un autre")

# 4) Réponses et calendrier
a = requests.post(f"{B}/me/cards/{ids[0]}/answer", headers=L, json={"known": True}).json()
ok(a["stage"] == 1 and a["advanced"] and not a["mastered"], "carte sue : étape 1")
cur.execute("select due_on - current_date, stage, seen, known from memory_card_progress where user_id=%s and question_id=%s", (lu, ids[0]))
d = cur.fetchone(); ok(d[0] in (0, 1) and d[1] == 1 and d[2] == 1 and d[3] == 1, "revue programmée demain, compteurs à jour")
a = requests.post(f"{B}/me/cards/{ids[1]}/answer", headers=L, json={"known": False}).json()
ok(a["stage"] == 0 and not a["advanced"], "carte ratée : étape 0")
r = requests.get(B + "/me/cards", headers=L).json()
ok(ids[0] not in [c["id"] for c in r["session"]["cards"]] and ids[1] not in [c["id"] for c in r["session"]["cards"]], "cartes répondues : plus dans la séance du jour")
ok(r["counts"]["newAvailable"] == 1, "plafond de nouvelles cartes : 2 introduites sur 3")
# Avant l'échéance : le calendrier ne bouge pas
a = requests.post(f"{B}/me/cards/{ids[0]}/answer", headers=L, json={"known": True}).json()
ok(a["stage"] == 1 and not a["advanced"], "carte revue avant l'échéance : calendrier inchangé")

# 5) Échéance atteinte : la carte revient et avance
cur.execute("update memory_card_progress set due_on = current_date - 2 where user_id=%s and question_id=%s", (lu, ids[0]))
r = requests.get(B + "/me/cards", headers=L).json()
ok(r["session"]["cards"][0]["id"] == ids[0] and r["session"]["due"] == 1 and r["counts"]["due"] == 1, "carte échue en tête de séance (en retard de 2 jours)")
a = requests.post(f"{B}/me/cards/{ids[0]}/answer", headers=L, json={"known": True}).json()
ok(a["stage"] == 2 and a["advanced"], "réussie à l'échéance : étape 2")
cur.execute("select due_on - current_date from memory_card_progress where user_id=%s and question_id=%s", (lu, ids[0])); ok(cur.fetchone()[0] == 3, "prochaine revue dans 3 jours")
for expected, days in ((3, 7), (4, 21), (5, None)):
    cur.execute("update memory_card_progress set due_on = current_date where user_id=%s and question_id=%s", (lu, ids[0]))
    a = requests.post(f"{B}/me/cards/{ids[0]}/answer", headers=L, json={"known": True}).json()
    ok(a["stage"] == expected, f"étape {expected}")
ok(a["mastered"] and a["dueOn"] is None, "cinquième réussite : carte acquise, plus d'échéance")
r = requests.get(B + "/me/cards", headers=L).json(); ok(r["counts"]["mastered"] == 1, "compteur : 1 carte acquise")
r = requests.get(B + "/me/cards?free=1", headers=L).json()
ok(ids[1] in [c["id"] for c in r["session"]["cards"]] and ids[0] not in [c["id"] for c in r["session"]["cards"]] and r["free"] is True, "séance libre : cartes en cours même non échues, pas les acquises")

# 6) Contrôles d'accès aux cartes
ok(requests.post(f"{B}/me/cards/{dr}/answer", headers=L, json={"known": True}).status_code == 404, "question en brouillon : carte introuvable")
attempt(lu, t2)
ok(requests.post(f"{B}/me/cards/{q2[0]}/answer", headers=L, json={"known": True}).status_code == 200, "après le quiz de B : ses cartes deviennent accessibles")
ok(requests.post(f"{B}/me/cards/{q3}/answer", headers=L, json={"known": True}).status_code == 404, "conférence non publiée : carte introuvable")
ok(requests.post(f"{B}/me/cards/{uuid.uuid4()}/answer", headers=L, json={"known": True}).status_code == 404, "carte inconnue : 404")
ok(requests.post(f"{B}/me/cards/{q1[0]}/answer", headers=L, json={"known": "oui"}).status_code == 400, "réponse invalide : 400")
ok(requests.post(f"{B}/me/cards/pas-un-uuid/answer", headers=L, json={"known": True}).status_code == 400, "identifiant invalide : 400")

# 7) Plafond de séance
requests.post(f"{B}/me/cards/{ids[2]}/answer", headers=L, json={"known": False})
cur.execute("update memory_card_progress set due_on = current_date - 1 where user_id=%s and stage < 5", (lu,))
setting(ADM, cards_daily_max="2")
r = requests.get(B + "/me/cards", headers=L).json()
ok(len(r["session"]["cards"]) == 2 and r["session"]["remaining"] >= 1, "plafond de séance respecté, le reste est annoncé")
setting(ADM, cards_daily_max="20", cards_new_per_day="0")
cur.execute("delete from memory_card_progress where user_id=%s", (lu,))
r = requests.get(B + "/me/cards", headers=L).json(); ok(r["session"]["cards"] == [] and r["counts"]["newAvailable"] == 0, "0 nouvelle par jour : aucune carte nouvelle")
setting(ADM, cards_new_per_day="5")

# 8) Fonction désactivable (Admin → Fonctions) et suppression en cascade
requests.post(f"{B}/me/cards/{q1[0]}/answer", headers=L, json={"known": True})
cur.execute("delete from quiz_questions where id=%s", (q1[0],))
cur.execute("select count(*) from memory_card_progress where question_id=%s", (q1[0],)); ok(cur.fetchone()[0] == 0, "question supprimée : sa progression disparaît")
setting(ADM, feat_memorycards="false")
ok(requests.get(B + "/me/cards", headers=L).status_code in (403, 404), "fonction coupée : routes fermées")
setting(ADM, feat_memorycards="true")
ok(requests.get(B + "/me/cards", headers=L).status_code == 200, "fonction rétablie")

# 9) RGPD : l'export contient la progression, la suppression du compte l'efface
requests.post(f"{B}/me/cards/{q1[1]}/answer", headers=L, json={"known": True})
cur.execute("select count(*) from memory_card_progress where user_id=%s", (lu,)); ok(cur.fetchone()[0] >= 1, "progression enregistrée")
ex = requests.get(B + "/me/export", headers=L)
ok(ex.status_code == 200 and "memory_card_progress" in ex.text, "export RGPD : la progression des cartes est incluse")
cur.execute("delete from users where id=%s", (lu,)); cur.execute("select count(*) from memory_card_progress where user_id=%s", (lu,)); ok(cur.fetchone()[0] == 0, "compte supprimé : progression effacée")
for t in (t1, t2, t3): cur.execute("delete from talks where id=%s", (t,))
print("\nTout est OK")
