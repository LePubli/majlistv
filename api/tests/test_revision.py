"""24.5 : révision espacée J+1/J+3/J+7/J+21, rappels (bibliothèque), préférences e-mail. Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(name="Amina Test", role=None):
    email = f"mem-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": name})
    if role:
        cur.execute("update users set role=%s where email=%s", (role, email))
    cur.execute("select id from users where email=%s", (email,))
    return login(email, "Passw0rd-test"), cur.fetchone()[0]


def subscribe(uid, tier):
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:8], uid, tier))


ADM = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
STD, ustd = member(); LRN, ulrn = member("Yacine Apprenant"); subscribe(ustd, "standard"); subscribe(ulrn, "learning")
O1, uo1 = member("Orga Un", "organizer"); O2, uo2 = member("Orga Deux", "organizer")
tag = uuid.uuid4().hex[:6]


def talk(title, owner=aid):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language,language) "
                "values (%s,'d','Cheikh Test','youtube',%s,%s,'published','ready','free',600,'ready','fr','fr') returning id", (f"{title} {tag}", "v" + uuid.uuid4().hex[:9], owner))
    tid = cur.fetchone()[0]
    for i in range(1, 4):
        cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,evidence_quote,origin,status) values (%s,'fr',%s,'[\"A\",\"B\",\"C\"]',0,'Parce que.',%s,%s,'ai','approved')",
                    (tid, f"Question {i} ?", i * 20000, f"Passage numéro {i} de la conférence, cité mot pour mot ici."))
    for i, tx in enumerate(["Premier passage de la conférence sur la patience.", "Deuxième passage : la patience est une lumière.", "Troisième passage hors intervalle."]):
        cur.execute("insert into transcript_segments values (%s,'fr',%s,%s,%s,%s)", (tid, i, i * 20000, i * 20000 + 19000, tx))
    return tid


def submit(h, tid, good=True):
    qs = requests.get(f"{B}/talks/{tid}/quiz", headers=h).json()["questions"]
    return requests.post(f"{B}/talks/{tid}/quiz/submit", headers=h, json={"answers": [{"questionId": q["id"], "index": 0 if good else 1} for q in qs]}).json()


def item(uid, tid):
    cur.execute("select stage, anchor_on - current_date, due_on - current_date, reviews from revision_items where user_id=%s and talk_id=%s", (uid, tid))
    return cur.fetchone()


def shift(uid, tid, anchor_days_ago):  # simule le temps qui passe : recule l'ancre et l'échéance
    cur.execute("update revision_items set anchor_on = anchor_on - %s, due_on = due_on - %s where user_id=%s and talk_id=%s", (anchor_days_ago, anchor_days_ago, uid, tid))


t1 = talk("Révision A")
# --- accès
ok(requests.get(f"{B}/me/revision").status_code in (401, 403), "révision : connexion obligatoire")
r = requests.get(f"{B}/me/revision", headers=STD); ok(r.status_code == 403 and r.json()["code"] == "learning_required", "abonné standard : révision refusée (Apprentissage)")
ok(requests.put(f"{B}/me/learning/prefs", headers=STD, json={"dailyEmail": False}).status_code == 403, "abonné standard : préférences refusées")
s = submit(STD, t1); ok(s["learning"] is None and item(ustd, t1) is None, "abonné standard : quiz gratuit, aucun calendrier de révision")

# --- calendrier
s = submit(LRN, t1); rv = s["learning"]["review"]
ok(s["passed"] and rv["stage"] == 0 and rv["advanced"] is False and not rv["mastered"], "1re tentative : calendrier créé, stage 0")
ok(item(ulrn, t1)[2] == 1 and rv["nextReviewOn"], "première révision à J+1")
s = submit(LRN, t1); ok(item(ulrn, t1)[0] == 0 and item(ulrn, t1)[2] == 1, "refaire le quiz avant l'échéance ne change pas le calendrier")
d = requests.get(f"{B}/me/revision", headers=LRN).json()
ok(d["items"] == [] and d["total"] == 0 and d["upcoming"]["week"] == 1, "rien à réviser aujourd'hui, 1 révision cette semaine")
shift(ulrn, t1, 1)  # hier : l'échéance J+1 est aujourd'hui
d = requests.get(f"{B}/me/revision", headers=LRN).json()
ok(len(d["items"]) == 1 and d["items"][0]["id"] == str(t1) and d["items"][0]["revision"]["stage"] == 0 and d["items"][0]["quizState"] == "review", "révision du jour : la conférence apparaît")
ok(d["items"][0]["title"].startswith("Révision A") and "posterUrl" in d["items"][0], "carte complète (titre, vignette)")
s = submit(LRN, t1); rv = s["learning"]["review"]
ok(rv["advanced"] and rv["stage"] == 1 and item(ulrn, t1)[2] == 2, "à l'échéance, réussi : J+3 (dans 2 jours, ancre = hier)")
shift(ulrn, t1, 2); cur.execute("update revision_items set stage=2 where user_id=%s and talk_id=%s", (ulrn, t1))  # en retard, stage 2 (J+7)
s = submit(LRN, t1, good=False); rv = s["learning"]["review"]
ok(not s["passed"] and rv["stage"] == 0 and item(ulrn, t1)[2] == 1 and item(ulrn, t1)[1] == 0, "raté à l'échéance : retour à J+1, ancre = aujourd'hui")
cur.execute("update revision_items set stage=3, anchor_on=current_date-21, due_on=current_date where user_id=%s and talk_id=%s", (ulrn, t1))
s = submit(LRN, t1); rv = s["learning"]["review"]
ok(rv["mastered"] and rv["stage"] == 4 and rv["nextReviewOn"] is None, "J+21 réussi : conférence acquise")
d = requests.get(f"{B}/me/revision", headers=LRN).json(); ok(d["items"] == [] and d["upcoming"]["mastered"] == 1, "acquise : plus de révision, comptée dans « acquis »")
s = submit(LRN, t1); ok(item(ulrn, t1)[0] == 4, "acquise : refaire le quiz ne relance pas le calendrier")
cur.execute("update revision_items set stage=1, anchor_on=current_date-10, due_on=current_date-7 where user_id=%s and talk_id=%s", (ulrn, t1))
s = submit(LRN, t1); ok(item(ulrn, t1)[0] == 2 and item(ulrn, t1)[2] == 1, "très en retard : l'échéance suivante n'est jamais dans le passé (demain au plus tôt)")

# --- limite quotidienne, retard, conférence retirée
t2, t3 = talk("Révision B"), talk("Révision C")
cur.execute("update revision_items set stage=0, anchor_on=current_date-1, due_on=current_date where user_id=%s and talk_id=%s", (ulrn, t1))
for t in (t2, t3):
    submit(LRN, t); shift(ulrn, t, 1)
cur.execute("update revision_items set due_on=current_date-3 where user_id=%s and talk_id=%s", (ulrn, t3))
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"revision_daily_max": "2"}})
d = requests.get(f"{B}/me/revision", headers=LRN).json()
ok(len(d["items"]) == 2 and d["total"] == 3 and d["remaining"] == 1, "limite quotidienne : 2 affichées, 1 reportée")
ok(d["items"][0]["id"] == str(t3) and d["items"][0]["revision"]["lateDays"] == 3, "la plus en retard d'abord")
requests.put(B + "/admin/settings", headers=ADM, json={"values": {"revision_daily_max": None}})
cur.execute("update talks set publication='draft' where id=%s", (t3,))
d = requests.get(f"{B}/me/revision", headers=LRN).json(); ok(all(x["id"] != str(t3) for x in d["items"]), "conférence dépubliée : retirée des révisions")

# --- passage à l'Apprentissage : l'historique entre dans le calendrier
cur.execute("insert into quiz_attempts(user_id,talk_id,score,total,percent,passed,answers,created_at) values (%s,%s,3,3,100,true,'[]',now()-interval '5 days')", (ustd, t2))
subscribe(ustd, "learning")
d = requests.get(f"{B}/me/revision", headers=STD).json()
ok(any(x["id"] == str(t2) for x in d["items"]), "nouveau membre Apprentissage : ses anciens quiz entrent dans le calendrier (échéance aujourd'hui)")

# --- préférences e-mail
ok(d["dailyEmail"] is True and "emailEnabled" in d, "e-mail quotidien activé par défaut")
r = requests.put(f"{B}/me/learning/prefs", headers=LRN, json={"dailyEmail": False}); ok(r.status_code == 200 and r.json()["dailyEmail"] is False, "désactivation de l'e-mail quotidien")
ok(requests.get(f"{B}/me/revision", headers=LRN).json()["dailyEmail"] is False, "préférence conservée")
ok(requests.put(f"{B}/me/learning/prefs", headers=LRN, json={"dailyEmail": "non"}).status_code == 400, "valeur invalide refusée")

# --- bibliothèque de rappels (Studio)
R = f"{B}/talks/{t1}/studio/reminders"
ok(requests.get(R).status_code in (401, 403) and requests.get(R, headers=STD).status_code == 403, "Studio rappels : réservé aux organisateurs")
ok(requests.get(R, headers=O2).status_code == 404, "Studio rappels : pas ceux d'un autre organisateur")
cur.execute("update talks set organizer_id=%s where id=%s", (uo1, t1))
ok(requests.post(R, headers=O1, json={"text": "Un passage saisi à la main sans source"}).status_code == 400, "saisie manuelle : source obligatoire")
r = requests.post(R, headers=O1, json={"text": "La patience est la clé du soulagement.", "attribution": "Hadith relu par l'organisateur — référence : à compléter"}); ok(r.status_code == 201 and r.json()["status"] == "draft" and r.json()["origin"] == "manual", "saisie manuelle : créée en brouillon")
m1 = r.json()["id"]
r = requests.post(R + "/from-transcript", headers=O1, json={"fromMs": 0, "toMs": 40000}); ok(r.status_code == 201, "extrait de la transcription")
ok(r.json()["text"] == "Premier passage de la conférence sur la patience. Deuxième passage : la patience est une lumière." and r.json()["origin"] == "transcript" and r.json()["startMs"] == 0, "extrait copié mot pour mot (aucune IA)")
m2 = r.json()["id"]
ok(requests.post(R + "/from-transcript", headers=O1, json={"fromMs": 500000, "toMs": 520000}).status_code == 404, "intervalle sans transcription : refusé")
ok(requests.post(R + "/from-transcript", headers=O1, json={"fromMs": 100, "toMs": 50}).status_code == 400, "intervalle inversé : refusé")
r = requests.post(R + "/from-quiz", headers=O1); ok(r.status_code == 201 and r.json()["added"] == 3, "citations des questions validées reprises (3)")
ok(requests.post(R + "/from-quiz", headers=O1).json()["added"] == 0, "pas de doublon à la seconde reprise")
d = requests.get(R, headers=O1).json(); ok(len(d["reminders"]) == 5 and d["langs"] == ["fr"] and d["transcriptReady"], "liste des rappels")
# validation
r = requests.patch(f"{B}/studio/reminders/{m1}", headers=O1, json={"status": "approved"}); ok(r.status_code == 200 and r.json()["status"] == "approved" and r.json()["approvedAt"], "rappel manuel validé")
r = requests.patch(f"{B}/studio/reminders/{m2}", headers=O1, json={"text": "Texte retouché à la main par l'organisateur"}); ok(r.json()["origin"] == "manual" and r.json()["status"] == "draft", "extrait retouché : redevient une saisie manuelle, repasse en brouillon")
r = requests.patch(f"{B}/studio/reminders/{m2}", headers=O1, json={"status": "approved"}); ok(r.status_code == 400 and r.json()["code"] == "source_required", "retouché sans source : validation refusée")
r = requests.patch(f"{B}/studio/reminders/{m2}", headers=O1, json={"status": "approved", "attribution": "Conférence, minute 0"}); ok(r.status_code == 200, "retouché avec source : validé")
ok(requests.patch(f"{B}/studio/reminders/{m1}", headers=O2, json={"status": "draft"}).status_code == 404, "validation par un autre organisateur refusée")
ok(requests.patch(f"{B}/studio/reminders/{m1}", headers=O1, json={}).status_code == 400, "modification vide refusée")
q = [x for x in d["reminders"] if x["origin"] == "quiz"][0]
r = requests.patch(f"{B}/studio/reminders/{q['id']}", headers=O1, json={"status": "approved"}); ok(r.status_code == 200 and r.json()["origin"] == "quiz", "citation de quiz : validation directe (déjà vérifiée)")

# --- rappel du jour
cur.execute("delete from reminders where talk_id=%s and id not in (%s, %s, %s)", (t1, m1, m2, q["id"]))
cur.execute("update reminders set status='draft', approved_at=null where talk_id is distinct from %s", (t1,))  # seule la conférence de ce test fournit des rappels publiés
d = requests.get(f"{B}/me/revision", headers=LRN).json(); rem = d["reminder"]
ok(rem is not None and rem["talkId"] == str(t1) and rem["text"] and "id" in rem, "rappel du jour : un passage validé de la bibliothèque")
ok(requests.get(f"{B}/me/revision", headers=LRN).json()["reminder"]["id"] == rem["id"], "stable toute la journée")
# brouillons jamais diffusés
cur.execute("update reminders set status='draft', approved_at=null where talk_id=%s", (t1,))
ok(requests.get(f"{B}/me/revision", headers=LRN).json()["reminder"] is None, "brouillons : jamais diffusés")
# 24.6 : le rappel du jour ne dépend plus des quiz : un membre qui n'a jamais passé de quiz reçoit aussi un rappel
cur.execute("update reminders set status='approved' where talk_id=%s", (t1,))
STD2, ustd2 = member(); subscribe(ustd2, "learning")
ok(requests.get(f"{B}/me/revision", headers=STD2).json()["reminder"]["talkId"] == str(t1), "aucun quiz passé : le rappel du jour est quand même proposé")
ok(requests.delete(f"{B}/studio/reminders/{m1}", headers=O2).status_code == 404 and requests.delete(f"{B}/studio/reminders/{m1}", headers=O1).status_code == 204, "suppression (propriétaire seulement)")
cur.execute("delete from talks where id in (%s,%s,%s)", (t1, t2, t3))
cur.execute("select count(*) from revision_items where talk_id in (%s,%s,%s)", (t1, t2, t3)); ok(cur.fetchone()[0] == 0, "conférence supprimée : calendrier et rappels nettoyés")
print("TOUT OK")
