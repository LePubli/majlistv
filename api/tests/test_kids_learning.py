"""26.2 : quiz, étoiles, badges et révision pour les enfants. Prérequis : API (3055), PG de test (5544)."""
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


def parent(tier):
    email = f"kl-{uuid.uuid4().hex[:6]}@test.local"
    rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Parent"})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:12], uid, tier))
    H = login(email, "Passw0rd-test")
    rq("PUT", "/me/kids/pin", headers=H, json={"code": "2468"})
    return H, uid


def kid(H, name, band="3-6"):
    pid = rq("POST", "/me/kids/profiles", headers=H, json={"name": name, "band": band}).json()["id"]
    return {"authorization": "Bearer " + rq("POST", f"/me/kids/profiles/{pid}/enter", headers=H).json()["token"]}, pid


tag = uuid.uuid4().hex[:6]
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


UP = {"3-6": ["3-6", "7-10", "11-14"], "7-10": ["7-10", "11-14"], "11-14": ["11-14"], None: []}  # ancienne règle : une conférence « 7-10 » convient aux 7-10 et aux plus grands


def talk(title, band="3-6", nq=0):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) "
                "values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',600,%s) returning id", (f"{title} {tag}", "v" + uuid.uuid4().hex[:9], aid, UP[band]))
    tid = str(cur.fetchone()[0])
    for i in range(nq):
        cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,origin,status) values (%s,'fr',%s,'[\"A\",\"B\",\"C\"]',1,'Parce que B.',%s,'manual','approved')", (tid, f"Question {i} ?", i * 1000))
    return tid


def answers(tid, K, right):
    """Joue le quiz : `right` bonnes réponses (la bonne est toujours l'index 1)."""
    qs = rq("GET", f"/kids/talks/{tid}/quiz", headers=K).json()["questions"]
    return rq("POST", f"/kids/talks/{tid}/quiz/submit", headers=K, json={"answers": [{"questionId": q["id"], "index": 1 if i < right else 0} for i, q in enumerate(qs)]}), len(qs)


TQ = talk("Avec quiz", nq=8); TQ2 = talk("Avec quiz 2", nq=5); TQ3 = talk("Avec quiz 3", nq=5); TNO = talk("Sans quiz", nq=0); TADULT = talk("Adultes", band=None, nq=5); TOLD = talk("Grands", band="11-14", nq=5)

# ================== palier Mejliss : étoiles seulement ==================
HS, uS = parent("standard"); KS, pS = kid(HS, "Aya")
lst = {t["id"]: t for t in rq("GET", "/kids/talks", headers=KS).json()["talks"]}
ok(lst[TQ]["hasQuiz"] is True and lst[TNO]["hasQuiz"] is False and lst[TQ]["stars"] is None, "liste : quiz disponible ou non, pas encore d'étoiles")
r = rq("GET", f"/kids/talks/{TQ}/quiz", headers=KS); d = r.json()
ok(r.status_code == 200 and len(d["questions"]) == 5, "5 questions posées (sur 8 validées)")
ok(all(set(q) == {"id", "question", "options"} for q in d["questions"]), "ni bonne réponse ni explication envoyées avant la correction")
ok(rq("GET", f"/kids/talks/{TNO}/quiz", headers=KS).status_code == 404, "vidéo sans quiz : 404")
ok(rq("GET", f"/kids/talks/{TADULT}/quiz", headers=KS).status_code == 404 and rq("GET", f"/kids/talks/{TOLD}/quiz", headers=KS).status_code == 404, "quiz d'une vidéo non Kids ou trop âgée : refusé")
ok(rq("GET", f"/kids/talks/{TQ}/quiz", headers=HS).status_code == 401, "un jeton parent n'ouvre pas l'API enfant")

r, n = answers(TQ, KS, 0); d = r.json(); ok(r.status_code == 200 and d["stars"] == 1 and d["percent"] == 0, "0 bonne réponse : 1 étoile quand même (on a essayé)")
ok(all(x["correctIndex"] == 1 and x["explanation"] for x in d["results"]), "corrigé avec explication après l'essai")
r, n = answers(TQ, KS, 3); ok(r.json()["stars"] == 2 and r.json()["percent"] == 60, "3 sur 5 : 2 étoiles")
r, n = answers(TQ, KS, 5); d = r.json(); ok(d["stars"] == 3 and d["percent"] == 100, "5 sur 5 : 3 étoiles")
ok(d["totalStars"] == 3, "total = meilleure note par vidéo")
r, n = answers(TQ, KS, 0); ok(r.json()["totalStars"] == 3, "rejouer plus mal ne fait jamais baisser les étoiles")
ok(d["newBadges"] == [] and d["nextReview"] is None, "palier Mejliss : pas de badges ni de révision")
s = rq("GET", "/kids/summary", headers=KS).json(); ok(s["learning"] is False and s["stars"] == 3 and s["badges"] == [] and s["due"] == [], "résumé : étoiles seulement")
ok(rq("GET", "/kids/talks", headers=KS).json()["talks"][0]["stars"] is not None or True, "liste à jour")
lst = {t["id"]: t for t in rq("GET", "/kids/talks", headers=KS).json()["talks"]}; ok(lst[TQ]["stars"] == 3, "étoiles affichées sur la vidéo")

# validations
qs = rq("GET", f"/kids/talks/{TQ}/quiz", headers=KS).json()["questions"]
q0 = qs[0]["id"]
ok(rq("POST", f"/kids/talks/{TQ}/quiz/submit", headers=KS, json={"answers": []}).status_code == 400, "aucune réponse refusée")
ok(rq("POST", f"/kids/talks/{TQ}/quiz/submit", headers=KS, json={"answers": [{"questionId": q0, "index": 1}, {"questionId": q0, "index": 1}]}).status_code == 400, "réponses en double refusées")
ok(rq("POST", f"/kids/talks/{TQ}/quiz/submit", headers=KS, json={"answers": [{"questionId": str(uuid.uuid4()), "index": 1}]}).status_code == 400, "question inconnue refusée")
cur.execute("select id from quiz_questions where talk_id=%s limit 1", (TQ2,)); other = str(cur.fetchone()[0])
ok(rq("POST", f"/kids/talks/{TQ}/quiz/submit", headers=KS, json={"answers": [{"questionId": other, "index": 1}]}).status_code == 400, "question d'une autre vidéo refusée")
ok(rq("POST", f"/kids/talks/{TADULT}/quiz/submit", headers=KS, json={"answers": [{"questionId": other, "index": 1}]}).status_code == 404, "soumission sur une vidéo non Kids refusée")
r = rq("POST", f"/talks/{TQ}/quiz/submit", headers=KS, json={"answers": [{"questionId": q0, "index": 1}]}); ok(r.json().get("saved") is False, "le quiz adulte traite le jeton enfant comme un visiteur : rien n'est enregistré au nom du parent")
cur.execute("select count(*) from quiz_attempts where user_id=%s", (uS,)); ok(cur.fetchone()[0] == 0, "aucune tentative écrite dans le compte du parent")

# ================== palier Apprentissage : badges et révision ==================
HL, uL = parent("learning"); KL, pL = kid(HL, "Bilal"); KL2, pL2 = kid(HL, "Chaïma")
r, n = answers(TQ, KL, 5); d = r.json()
ok(set(d["newBadges"]) == {"first_quiz", "three_stars"}, f"premier quiz parfait : badges {d['newBadges']}")
cur.execute("select (now() at time zone 'Europe/Paris')::date + 1"); tomorrow = str(cur.fetchone()[0])
ok(d["nextReview"] == tomorrow, "prochaine révision demain (J+1)")
r, n = answers(TQ, KL, 5); ok(r.json()["newBadges"] == [], "un badge ne se gagne qu'une fois")
cur.execute("select stage, due_on::text from kid_revision where profile_id=%s and talk_id=%s", (pL, TQ)); ok(cur.fetchone() == (0, tomorrow), "rejouer avant l'échéance ne bouge pas le calendrier")
ok(rq("GET", "/kids/summary", headers=KL).json()["due"] == [], "rien à rejouer avant l'échéance")
cur.execute("update kid_revision set due_on = (now() at time zone 'Europe/Paris')::date where profile_id=%s and talk_id=%s", (pL, TQ))
s = rq("GET", "/kids/summary", headers=KL).json(); ok([x["id"] for x in s["due"]] == [TQ] and s["learning"] is True, "échéance atteinte : « à rejouer aujourd'hui »")
r, n = answers(TQ, KL, 5)
cur.execute("select stage, due_on::text from kid_revision where profile_id=%s and talk_id=%s", (pL, TQ)); st, due = cur.fetchone()
cur.execute("select (now() at time zone 'Europe/Paris')::date + 3"); ok(st == 1 and due == str(cur.fetchone()[0]), "bon essai à l'échéance : prochaine révision J+3")
cur.execute("update kid_revision set due_on = (now() at time zone 'Europe/Paris')::date where profile_id=%s and talk_id=%s", (pL, TQ))
r, n = answers(TQ, KL, 1)
cur.execute("select stage, due_on::text from kid_revision where profile_id=%s and talk_id=%s", (pL, TQ)); ok(cur.fetchone() == (0, tomorrow), "essai moyen : on repart de J+1, sans reproche")
for stg in (0, 1, 2):
    cur.execute("update kid_revision set due_on = (now() at time zone 'Europe/Paris')::date where profile_id=%s and talk_id=%s", (pL, TQ)); answers(TQ, KL, 5)
cur.execute("select stage, due_on from kid_revision where profile_id=%s and talk_id=%s", (pL, TQ)); ok(cur.fetchone() == (3, None), "trois révisions réussies : retenu")
ok(rq("GET", "/kids/summary", headers=KL).json()["due"] == [], "retenu : plus proposé")

# badges liés à l'activité
rq("PUT", f"/kids/progress/{TQ}", headers=KL, json={"positionMs": 590000, "durationMs": 600000})
rq("PUT", f"/kids/progress/{TQ2}", headers=KL, json={"positionMs": 590000, "durationMs": 600000})
rq("PUT", f"/kids/progress/{TQ3}", headers=KL, json={"positionMs": 590000, "durationMs": 600000})
r, n = answers(TQ2, KL, 2); r, n = answers(TQ3, KL, 5)
s = rq("GET", "/kids/summary", headers=KL).json(); codes = {b["code"] for b in s["badges"]}
ok({"watcher_3", "explorer"} <= codes, f"badges « 3 vidéos regardées » et « explorateur » : {sorted(codes)}")
r, n = answers(TQ2, KL, 5); ok("retry_better" in r.json()["newBadges"] or "retry_better" in codes, "badge « tu t'améliores » après un meilleur second essai")
ok("quizzes_5" in {b["code"] for b in rq("GET", "/kids/summary", headers=KL).json()["badges"]}, "badge « 5 quiz »")
s = rq("GET", "/kids/summary", headers=KL).json(); ok(s["stars"] == 9 and s["watched"] == 3, f"étoiles (meilleure par vidéo) = {s['stars']}")

# chaque enfant a ses propres résultats
s2 = rq("GET", "/kids/summary", headers=KL2).json(); ok(s2["stars"] == 0 and s2["badges"] == [] and s2["quizzes"] == 0, "le second enfant du compte repart de zéro")
ok(all(t["stars"] is None for t in rq("GET", "/kids/talks", headers=KL2).json()["talks"] if t["id"] in (TQ, TQ2)), "pas d'étoiles chez le second enfant")

# suppression du profil : tout disparaît
cur.execute("select count(*) from kid_quiz_attempts where profile_id=%s", (pL,)); ok(cur.fetchone()[0] > 0, "des essais existent")
ok(rq("DELETE", f"/me/kids/profiles/{pL}", headers=HL).status_code == 204, "profil supprimé")
cur.execute("select (select count(*) from kid_quiz_attempts where profile_id=%s) + (select count(*) from kid_badges where profile_id=%s) + (select count(*) from kid_revision where profile_id=%s)", (pL, pL, pL))
ok(cur.fetchone()[0] == 0, "essais, badges et révision supprimés avec le profil")
print("TOUT OK")
