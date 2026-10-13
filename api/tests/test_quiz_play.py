"""24.3 : passer le quiz (public), correction côté serveur, tentatives, « quiz à rattraper », signalements. Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member():
    email = f"mem-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Membre"})
    cur.execute("select id from users where email=%s", (email,))
    return login(email, "Passw0rd-test"), cur.fetchone()[0]


ADM = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
U1, u1 = member(); U2, u2 = member()
tag = uuid.uuid4().hex[:6]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language) values (%s,'d','Cheikh','youtube','abc',%s,'published','ready','free',600,'ready','fr') returning id", (f"Quiz public {tag}", aid))
tid = str(cur.fetchone()[0])
Q = f"{B}/talks/{tid}/quiz"


def addq(i, status="approved", correct=0):
    cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,evidence_quote,chapter_ms,chapter_title,origin,status) values (%s,'fr',%s,%s,%s,%s,%s,'citation','0','Intro','manual',%s) returning id",
                (tid, f"Question {i} ?", '["Réponse A","Réponse B","Réponse C"]', correct, f"Parce que {i}.", 1000 * i, status))
    return str(cur.fetchone()[0])


# --- pas assez de questions validées
ok(requests.get(f"{B}/talks/{tid}").json()["quiz"] == {"available": False, "count": 0}, "fiche : quiz indisponible sans question")
ok(requests.get(Q).status_code == 404, "quiz non proposé : 404")
ids = [addq(i) for i in range(1, 3)]
ok(requests.get(Q).status_code == 404 and requests.get(f"{B}/talks/{tid}").json()["quiz"]["available"] is False, "2 questions validées sur 3 : toujours indisponible")
ids.append(addq(3)); ids += [addq(4), addq(5, correct=2)]
draft = addq(6, "draft"); rej = addq(7, "rejected")
info = requests.get(f"{B}/talks/{tid}").json()["quiz"]
ok(info == {"available": True, "count": 5}, "fiche : quiz disponible (5 validées ; brouillon et refusée ignorés)")

# --- lecture publique : jamais les réponses
r = requests.get(Q); d = r.json()
ok(r.status_code == 200 and len(d["questions"]) == 5 and d["passPercent"] == 70 and d["last"] is None, "visiteur sans compte : accès au quiz (5 questions, seuil 70 %)")
raw = r.text
ok("correct" not in raw.lower() and "explanation" not in raw and "Parce que" not in raw, "les bonnes réponses et explications ne sont pas envoyées avant la correction")
ok(draft not in raw and rej not in raw, "brouillons et questions refusées absents")
ok([q["id"] for q in d["questions"]] == ids, "questions dans l'ordre de la vidéo")

# --- correction côté serveur
ans = lambda picks: {"answers": [{"questionId": q, "index": i} for q, i in zip(ids, picks)]}
r = requests.post(Q + "/submit", json=ans([0, 0, 0, 0, 2])).json()
ok(r["score"] == 5 and r["percent"] == 100 and r["passed"] is True and r["saved"] is False and r["best"] is None, "tout juste : 100 %, réussi, non enregistré (visiteur)")
ok(all(x["explanation"] and x["evidenceMs"] is not None for x in r["results"]) and r["results"][0]["correctIndex"] == 0, "correction : explication, minute et bonne réponse renvoyées")
r = requests.post(Q + "/submit", json=ans([0, 0, 0, 1, 1])).json()
ok(r["score"] == 3 and r["percent"] == 60 and r["passed"] is False, "3/5 = 60 % : sous le seuil, non réussi")
r = requests.post(Q + "/submit", json={"answers": [{"questionId": q, "index": 0} for q in ids[:3]]}).json()
ok(r["score"] == 3 and r["total"] == 5 and r["results"][4]["chosen"] is None, "question sans réponse : comptée fausse")
r = requests.post(Q + "/submit", json={"answers": [{"questionId": draft, "index": 0}, {"questionId": str(uuid.uuid4()), "index": 0}]}).json()
ok(r["score"] == 0, "réponses à des questions étrangères : ignorées")
ok(requests.post(Q + "/submit", json={"answers": [{"questionId": ids[0], "index": 9}]}).status_code == 400, "indice de réponse invalide refusé")
ok(requests.post(f"{B}/talks/{uuid.uuid4()}/quiz/submit", json={"answers": []}).status_code == 404, "conférence inconnue : 404")
cur.execute("select count(*) from quiz_attempts where talk_id=%s", (tid,)); ok(cur.fetchone()[0] == 0, "aucune tentative enregistrée pour un visiteur")

# --- membre connecté : tentatives enregistrées
r = requests.post(Q + "/submit", headers=U1, json=ans([0, 0, 0, 1, 1])).json()
ok(r["saved"] is True and r["best"] == 60, "membre : tentative enregistrée, meilleur score 60 %")
last = requests.get(Q, headers=U1).json()["last"]
ok(last["percent"] == 60 and last["passed"] is False and last["everPassed"] is False, "le quiz rappelle le dernier résultat du membre")
ok(requests.get(Q, headers=U2).json()["last"] is None, "les résultats sont propres à chaque membre")

# --- quiz à rattraper
ok(requests.get(f"{B}/me/quiz/todo").status_code in (401, 403), "quiz à rattraper : connexion obligatoire")
todo = requests.get(f"{B}/me/quiz/todo", headers=U1).json()
ok([x["id"] for x in todo] == [tid] and todo[0]["quizState"] == "retry" and todo[0]["bestPercent"] == 60, "tenté sans réussite : « à revoir » avec le meilleur score")
ok(requests.get(f"{B}/me/quiz/todo", headers=U2).json() == [], "autre membre (n'a pas regardé) : rien à rattraper")
cur.execute("insert into watch_progress(user_id,talk_id,position_ms,duration_ms,completed) values (%s,%s,590000,600000,true)", (u2, tid))
todo = requests.get(f"{B}/me/quiz/todo", headers=U2).json()
ok([x["id"] for x in todo] == [tid] and todo[0]["quizState"] == "todo", "vidéo terminée sans quiz : « à passer »")
r = requests.post(Q + "/submit", headers=U1, json=ans([0, 0, 0, 0, 2])).json()
ok(r["passed"] is True and r["best"] == 100, "réussite enregistrée")
ok(requests.get(f"{B}/me/quiz/todo", headers=U1).json() == [], "quiz réussi : retiré de la liste à rattraper")
ok(requests.get(Q, headers=U1).json()["last"]["everPassed"] is True, "« déjà réussi » mémorisé")
cur.execute("select score,total,percent,passed from quiz_attempts where user_id=%s order by created_at", (u1,))
ok(cur.fetchall() == [(3, 5, 60, False), (5, 5, 100, True)], "historique des tentatives conservé")

# --- signalements
ok(requests.post(f"{Q}/questions/{ids[1]}/report", json={"reason": "La réponse me semble fausse"}).status_code == 204, "visiteur : signalement enregistré")
ok(requests.post(f"{Q}/questions/{ids[1]}/report", headers=U1, json={}).status_code == 204 and requests.post(f"{Q}/questions/{ids[1]}/report", headers=U1, json={}).status_code == 204, "membre : double signalement sans erreur")
cur.execute("select count(*) from quiz_reports where question_id=%s", (ids[1],)); ok(cur.fetchone()[0] == 2, "un seul signalement ouvert par membre")
ok(requests.post(f"{Q}/questions/{draft}/report", json={}).status_code == 404, "signaler une question non publiée : 404")
rv = requests.get(f"{B}/studio/quiz/review", headers=ADM).json()["questions"]
rep = next((q for q in rv if q["id"] == ids[1]), None)
ok(rep and rep["status"] == "approved" and rep["reports"] == 2 and "La réponse me semble fausse" in rep["reportReasons"], "file de relecture : la question signalée réapparaît avec ses motifs")
st = requests.get(f"{B}/talks/{tid}/studio/quiz", headers=ADM).json()
ok(next(q for q in st["questions"] if q["id"] == ids[1])["reports"] == 2, "onglet Quiz : nombre de signalements")
ok(requests.post(f"{B}/studio/quiz/questions/{ids[1]}/reports/dismiss", headers=U1).status_code in (401, 403), "classer un signalement : réservé aux organisateurs")
ok(requests.post(f"{B}/studio/quiz/questions/{ids[1]}/reports/dismiss", headers=ADM).status_code == 204, "signalement classé sans suite")
ok(ids[1] not in [q["id"] for q in requests.get(f"{B}/studio/quiz/review", headers=ADM).json()["questions"]], "plus dans la file de relecture")
requests.post(f"{Q}/questions/{ids[2]}/report", json={"reason": "Ambiguë"})
r = requests.patch(f"{B}/studio/quiz/questions/{ids[2]}", headers=ADM, json={"question": "Question 3 reformulée ?"}); ok(r.status_code == 200, "question corrigée")
ok(ids[2] not in [q["id"] for q in requests.get(f"{B}/studio/quiz/review", headers=ADM).json()["questions"]], "corriger la question clôt ses signalements")

# --- désactivation
requests.put(f"{B}/talks/{tid}/studio/quiz/settings", headers=ADM, json={"enabled": False})
ok(requests.get(Q).status_code == 404 and requests.get(f"{B}/talks/{tid}").json()["quiz"]["available"] is False, "quiz désactivé : plus proposé")
ok(requests.post(Q + "/submit", json={"answers": []}).status_code == 404, "quiz désactivé : plus de correction")
requests.put(f"{B}/talks/{tid}/studio/quiz/settings", headers=ADM, json={"enabled": None})
cur.execute("update talks set publication='draft' where id=%s", (tid,))
ok(requests.get(Q).status_code == 404, "conférence en brouillon : quiz invisible")
cur.execute("update talks set publication='published' where id=%s", (tid,))
ok(requests.get(Q).status_code == 200, "conférence republiée : quiz de nouveau disponible")
cur.execute("delete from talks where id=%s", (tid,)); cur.execute("select count(*) from quiz_attempts where talk_id=%s", (tid,)); ok(cur.fetchone()[0] == 0, "suppression de la conférence : tentatives supprimées")
print("TOUT OK")
