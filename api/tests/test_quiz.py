"""24.2 : quiz de compréhension — réglages, questions, validation, file de relecture, génération par l'IA (fausse API).
Prérequis : API (3055), PG de test (5544), service translator + fausse API Claude lancés (voir README, étape 24.2)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def organizer():
    email = f"orga-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga"})
    cur.execute("update users set role='organizer' where email=%s", (email,))
    return login(email, "Passw0rd-test")


O1, O2, ADM = organizer(), organizer(), login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
tid = requests.post(B + "/talks", headers=O1, json={"title": f"Conf quiz {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "abcde")[:11], "rightsConfirmed": True}).json()["id"]
Q = f"{B}/talks/{tid}/studio/quiz"
good = {"question": "Quelle vertu est au centre de la conférence ?", "options": ["La patience", "La richesse", "La vitesse"], "correctIndex": 0,
        "explanation": "L'intervenant la définit dès l'introduction.", "evidenceMs": 12000, "evidenceQuote": "La patience est une manière de regarder les épreuves"}

# --- état initial
r = requests.get(Q, headers=O1); d = r.json()
ok(r.status_code == 200 and d["questions"] == [] and d["approved"] == 0 and d["ready"] is False, "état initial : aucune question")
ok(d["min"] == 3 and d["max"] == 10 and d["passPercent"] == 70, "réglages par défaut : 3 à 10 questions, seuil 70 %")
ok(d["override"] is None and d["defaultEnabled"] is True and d["enabled"] is True, "quiz activé par défaut (réglage du site)")
ok(requests.get(Q, headers=O2).status_code == 404, "un autre organisateur n'a pas accès")
ok(requests.get(Q).status_code in (401, 403), "sans connexion : refusé")
ok(requests.get(Q, headers=ADM).status_code == 200, "un administrateur a accès")

# --- génération : transcription pas prête
r = requests.post(Q + "/generate", headers=O1, json={}); ok(r.status_code == 409 and r.json()["code"] == "not_ready", "génération refusée sans transcription")
ok(requests.post(Q + "/generate", headers=O1, json={"count": 99}).status_code == 400, "nombre de questions hors limites refusé")

# --- activer / désactiver
r = requests.put(Q + "/settings", headers=O1, json={"enabled": False}); ok(r.json()["enabled"] is False, "désactivé pour cette conférence")
ok(requests.get(Q, headers=O1).json()["override"] is False, "le choix est conservé")
r = requests.put(Q + "/settings", headers=O1, json={"enabled": None}); ok(r.json()["enabled"] is True, "retour au réglage du site")
requests.put(f"{B}/admin/settings", headers=ADM, json={"values": {"quiz_default_enabled": "false"}})
ok(requests.get(Q, headers=O1).json()["enabled"] is False, "réglage du site « désactivé par défaut » : suivi par la conférence")
requests.put(f"{B}/admin/settings", headers=ADM, json={"values": {"quiz_default_enabled": "true"}})
ok(requests.put(Q + "/settings", headers=O2, json={"enabled": True}).status_code == 404, "réglage : un autre organisateur est refusé")
ok(requests.put(Q + "/settings", headers=O1, json={"enabled": "oui"}).status_code == 400, "réglage invalide refusé")

# --- ajout manuel + validations
r = requests.post(Q + "/questions", headers=O1, json=good); q1 = r.json()
ok(r.status_code == 201 and q1["status"] == "draft" and q1["origin"] == "manual", "question saisie à la main : brouillon")
for name, bad in {"2 réponses": {**good, "options": ["a", "b"]}, "5 réponses": {**good, "options": list("abcde")},
                  "bonne réponse hors liste": {**good, "correctIndex": 3}, "réponses en double": {**good, "options": ["Oui", "oui", "Non"]},
                  "question vide": {**good, "question": " "}, "minute négative": {**good, "evidenceMs": -5}}.items():
    ok(requests.post(Q + "/questions", headers=O1, json=bad).status_code == 400, f"refusé : {name}")
ok(requests.post(Q + "/questions", headers=O2, json=good).status_code == 404, "ajout par un autre organisateur refusé")

# --- chapitre déduit de la minute
cur.execute("insert into talk_insights(talk_id, lang, status, summary, chapters) values (%s,'fr','ready','r','[{\"ms\":0,\"title\":\"Introduction\"},{\"ms\":60000,\"title\":\"La patience dans l''épreuve\"}]') on conflict (talk_id, lang) do update set status='ready', chapters=excluded.chapters", (tid,))
r = requests.post(Q + "/questions", headers=O1, json={**good, "question": "Quelle est la place de la patience dans l'épreuve ?", "evidenceMs": 75000}).json()
ok(r["chapterMs"] == 60000 and r["chapterTitle"] == "La patience dans l'épreuve", "chapitre déduit de la minute (75 s -> chapitre à 60 s)")
q2 = r
r = requests.patch(f"{B}/studio/quiz/questions/{q2['id']}", headers=O1, json={"evidenceMs": 5000}).json()
ok(r["chapterMs"] == 0 and r["chapterTitle"] == "Introduction", "changer la minute recalcule le chapitre")
requests.delete(f"{B}/studio/quiz/questions/{q2['id']}", headers=O1)

# --- validation (relecture)
P = lambda qid, body, h=O1: requests.patch(f"{B}/studio/quiz/questions/{qid}", headers=h, json=body)
ok(P(q1["id"], {"status": "approved"}, O2).status_code == 404, "valider la question d'un autre : refusé")
noexp = requests.post(Q + "/questions", headers=O1, json={**good, "question": "Question sans explication ?", "explanation": ""}).json()
r = P(noexp["id"], {"status": "approved"}); ok(r.status_code == 400 and "explication" in r.json()["error"], "validation refusée sans explication")
nomin = requests.post(Q + "/questions", headers=O1, json={**good, "question": "Question sans minute ?", "evidenceMs": None}).json()
r = P(nomin["id"], {"status": "approved"}); ok(r.status_code == 400 and "minute" in r.json()["error"], "validation refusée sans minute")
requests.delete(f"{B}/studio/quiz/questions/{noexp['id']}", headers=O1); requests.delete(f"{B}/studio/quiz/questions/{nomin['id']}", headers=O1)

r = P(q1["id"], {"status": "approved"}); ok(r.status_code == 200 and r.json()["status"] == "approved" and r.json()["reviewedAt"], "question validée (date de relecture enregistrée)")
cur.execute("select reviewed_by is not null from quiz_questions where id=%s", (q1["id"],)); ok(cur.fetchone()[0], "le relecteur est enregistré")
r = P(q1["id"], {"question": "Quelle vertu est au cœur de la conférence ?"}).json(); ok(r["status"] == "approved" and "cœur" in r["question"], "modifier une question validée la laisse validée")
ok(requests.get(Q, headers=O1).json()["approved"] == 1 and requests.get(Q, headers=O1).json()["ready"] is False, "1 validée sur 3 : quiz pas encore prêt")

# --- plafond de 10 questions validées (8 lignes ajoutées en base pour aller vite : q1 + 8 = 9 validées)
for i in range(8):
    cur.execute("insert into quiz_questions(talk_id, lang, question, options, correct_index, explanation, evidence_ms, origin, status) values (%s,'fr',%s,'[\"a\",\"b\",\"c\"]',0,'x',%s,'manual','approved')",
                (tid, f"Question remplie {i} ?", 1000 * (i + 1)))
ids = [requests.post(Q + "/questions", headers=O1, json={**good, "question": f"Question numéro {i} sur la conférence ?", "evidenceMs": 20000 + 1000 * i}).json()["id"] for i in range(2)]
codes = [P(i, {"status": "approved"}).status_code for i in ids]
ok(codes == [200, 409], "10 questions validées au maximum : la 11e est refusée")
ids = [ids[0]]
d = requests.get(Q, headers=O1).json(); ok(d["approved"] == 10 and d["ready"] is True, "quiz prêt (≥ 3 validées)")
ok([q["evidenceMs"] for q in d["questions"]] == sorted(q["evidenceMs"] for q in d["questions"]), "questions classées dans l'ordre de la vidéo")
lines = ["Bienvenue à cette conférence consacrée à la patience dans les épreuves de la vie.",
         "La patience est d'abord une manière de regarder les épreuves avec lucidité et confiance.",
         "Elle ne consiste pas à se taire mais à ne pas se laisser dominer par la colère ni le désespoir.",
         "Le deuxième point concerne la gratitude qui accompagne toute situation difficile ou heureuse.",
         "Enfin la constance dans la prière est la meilleure école pour apprendre à patienter vraiment.",
         "En conclusion retenons que la patience se cultive chaque jour par de petits efforts répétés."]
cur.execute("update talks set transcript_status='ready', transcript_language='fr', duration_seconds=600 where id=%s", (tid,))
for i, tx in enumerate(lines):
    cur.execute("insert into transcript_segments values (%s,'fr',%s,%s,%s,%s)", (tid, i, i * 21000, i * 21000 + 20000, tx))
r = requests.post(Q + "/generate", headers=O1, json={}); ok(r.status_code == 409 and r.json()["code"] == "full", "génération refusée quand le quiz est complet")
P(ids[0], {"status": "rejected"}); cur.execute("update quiz_questions set status='draft' where talk_id=%s and question='Question remplie 0 ?'", (tid,))
d = requests.get(Q, headers=O1).json(); ok(d["approved"] == 8 and d["drafts"] == 2, "refuser / remettre en brouillon retire la question des validées")
ok(requests.delete(f"{B}/studio/quiz/questions/{ids[0]}", headers=O2).status_code == 404, "supprimer la question d'un autre : refusé")

# --- file de relecture
dr = requests.post(Q + "/questions", headers=O1, json={**good, "question": "Question à relire dans la file ?"}).json()
rv = requests.get(f"{B}/studio/quiz/review", headers=O1).json()
ok(dr["id"] in [q["id"] for q in rv["questions"]] and all(q["status"] == "draft" for q in rv["questions"]), "file de relecture : uniquement les brouillons")
ok(all(q["talkTitle"] for q in rv["questions"]), "file de relecture : titre de la conférence renvoyé")
ok(dr["id"] not in [q["id"] for q in requests.get(f"{B}/studio/quiz/review", headers=O2).json()["questions"]], "file de relecture : propre à chaque organisateur")
ok(dr["id"] in [q["id"] for q in requests.get(f"{B}/studio/quiz/review", headers=ADM).json()["questions"]], "file de relecture : l'administrateur voit tout")
ok(requests.get(f"{B}/studio/quiz/review").status_code in (401, 403), "file de relecture : connexion obligatoire")
for q in requests.get(Q, headers=O1).json()["questions"]:
    requests.delete(f"{B}/studio/quiz/questions/{q['id']}", headers=O1)

# --- génération par l'IA (service translator + fausse API)
rr = requests.post(Q + "/generate", headers=O2, json={}); ok(rr.status_code == 404, f"génération par un autre organisateur refusée ({rr.status_code})")
r = requests.post(Q + "/generate", headers=O1, json={"count": 5}); ok(r.status_code == 202, "génération demandée")
ok(requests.post(Q + "/generate", headers=O1, json={}).status_code in (202, 409), "seconde demande pendant le traitement : acceptée ou refusée proprement")
for _ in range(60):
    d = requests.get(Q, headers=O1).json()
    if d["job"] and d["job"]["status"] in ("ready", "failed"):
        break
    time.sleep(1)
ok(d["job"] and d["job"]["status"] == "ready", f"génération terminée ({d['job']})")
ok(d["job"]["produced"] == 5 and d["job"]["dropped"] == 2, "7 propositions : 5 gardées, 2 écartées (citation inventée, réponses en double)")
ok(len(d["questions"]) == 5 and all(q["status"] == "draft" and q["origin"] == "ai" for q in d["questions"]), "les questions générées arrivent en brouillon")
ok(all(q["evidenceQuote"] and q["evidenceMs"] is not None and q["explanation"] for q in d["questions"]), "chaque question a sa minute, sa citation et son explication")
cur.execute("select count(*) from quiz_questions q join transcript_segments s on s.talk_id=q.talk_id and s.lang=q.lang and q.evidence_quote like '%%' || s.text || '%%' where q.talk_id=%s", (tid,))
ok(cur.fetchone()[0] >= 5, "chaque citation est un extrait mot pour mot de la transcription")
ok(all(q["chapterTitle"] in ("", "Début", "Introduction", "La patience dans l'épreuve") for q in d["questions"]), "chapitre rattaché")
ok(all(len(q["options"]) == 4 for q in d["questions"]) and len({q["correctIndex"] for q in d["questions"]}) >= 1, "4 réponses par question")

# Relecture puis nouvelle génération : les questions validées sont conservées, les brouillons remplacés
first = d["questions"][0]
ok(P(first["id"], {"status": "approved"}).status_code == 200, "une question générée se valide")
r = requests.post(Q + "/generate", headers=O1, json={"count": 4}); ok(r.status_code == 202, "nouvelle génération")
for _ in range(60):
    d = requests.get(Q, headers=O1).json()
    if d["job"]["status"] in ("ready", "failed") and d["job"]["wanted"] == 4:
        break
    time.sleep(1)
ok(d["job"]["status"] == "ready", "nouvelle génération terminée")
ok(any(q["id"] == first["id"] and q["status"] == "approved" for q in d["questions"]), "la question validée est conservée")
ok(sum(1 for q in d["questions"] if q["status"] == "draft") == 3 and len(d["questions"]) == 4, "les anciens brouillons sont remplacés (4 propositions, dont 1 doublon de la question validée, écartée)")

# La conférence supprimée emporte ses questions
requests.delete(f"{B}/talks/{tid}", headers=O1)
cur.execute("select count(*) from quiz_questions where talk_id=%s", (tid,)); ok(cur.fetchone()[0] == 0, "suppression de la conférence : questions supprimées")
print("TOUT OK")
