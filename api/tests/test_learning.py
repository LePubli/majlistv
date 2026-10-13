"""24.4 : palier Apprentissage — accès réservé, score, badges, courbe, attestation (page publique), tiers Stripe. Prérequis : API (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(name="Amina Test"):
    email = f"mem-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": name})
    cur.execute("select id from users where email=%s", (email,))
    return login(email, "Passw0rd-test"), cur.fetchone()[0]


def subscribe(uid, tier):
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:8], uid, tier))


ADM = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
FREE, ufree = member(); STD, ustd = member(); LRN, ulrn = member("Yacine Apprenant")
subscribe(ustd, "standard"); subscribe(ulrn, "learning")
tag = uuid.uuid4().hex[:6]

# --- accès au palier
ok(requests.get(f"{B}/me/learning").status_code in (401, 403), "tableau Apprentissage : connexion obligatoire")
for who, h in (("sans abonnement", FREE), ("abonné standard", STD)):
    r = requests.get(f"{B}/me/learning", headers=h); ok(r.status_code == 403 and r.json()["code"] == "learning_required", f"{who} : accès refusé (offre Apprentissage)")
ok(requests.get(f"{B}/me/learning", headers=LRN).status_code == 200, "abonné Apprentissage : accès")
ok(requests.get(f"{B}/me/learning", headers=ADM).status_code == 200, "administrateur : accès")
st = lambda h: requests.get(f"{B}/billing/status", headers=h).json()
ok(st(FREE)["tier"] is None and st(FREE)["learning"] is False, "statut : sans abonnement")
ok(st(STD)["tier"] == "standard" and st(STD)["learning"] is False, "statut : palier standard")
ok(st(LRN)["tier"] == "learning" and st(LRN)["learning"] is True and st(LRN)["subscription"]["tier"] == "learning", "statut : palier Apprentissage")
cur.execute("update subscriptions set status='canceled' where user_id=%s", (ulrn,))
ok(requests.get(f"{B}/me/learning", headers=LRN).status_code == 403, "abonnement Apprentissage résilié : accès retiré")
cur.execute("update subscriptions set status='active' where user_id=%s", (ulrn,))

# --- contenu : une série de 3 conférences avec quiz
def mk_talk(title, cat=None):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,category_id) values (%s,'d','Cheikh','youtube','abc',%s,'published','ready','free',600,%s) returning id", (f"{title} {tag}", aid, cat))
    t = str(cur.fetchone()[0])
    for i in range(1, 4):
        cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,origin,status) values (%s,'fr',%s,'[\"A\",\"B\",\"C\"]',0,'x',%s,'manual','approved')", (t, f"Q{i} de {title} ?", 1000 * i))
    return t


cur.execute("select id from categories order by id limit 3"); cats = [r[0] for r in cur.fetchall()]
eps = [mk_talk(f"Episode {i}", cats[i] if len(cats) > i else None) for i in range(3)]
cur.execute("insert into series(owner_id,title,speaker,published) values (%s,%s,'Cheikh Test',true) returning id", (aid, f"Série apprentissage {tag}")); sid = str(cur.fetchone()[0])
for i, t in enumerate(eps):
    cur.execute("insert into series_episodes(talk_id,series_id,position) values (%s,%s,%s)", (t, sid, i + 1))
qid = {}
for i, t in enumerate(eps):
    cur.execute("select id from quiz_questions where talk_id=%s order by evidence_ms", (t,)); qid[t] = [str(r[0]) for r in cur.fetchall()]


def play(h, t, picks):
    return requests.post(f"{B}/talks/{t}/quiz/submit", headers=h, json={"answers": [{"questionId": q, "index": p} for q, p in zip(qid[t], picks)]}).json()


# --- tableau vide
d = requests.get(f"{B}/me/learning", headers=LRN).json()
ok(d["score"] == 0 and d["quizzesTaken"] == 0 and d["curve"] == [] and d["series"] == [] and not any(b["earned"] for b in d["badges"]), "tableau vide au départ")
ok([b["id"] for b in d["badges"]] == ["first_quiz", "passed_5", "passed_10", "perfect", "comeback", "streak_3", "explorer", "series_done"], "8 badges proposés")

# --- la correction annonce le score et les badges (palier Apprentissage seulement)
r = play(STD, eps[0], [0, 0, 0]); ok(r["learning"] is None, "abonné standard : pas de score ni de badge dans la correction")
r = play(LRN, eps[0], [0, 1, 1])  # 1/3 = 33 %
ok(r["passed"] is False and r["learning"]["score"] == 33 and r["learning"]["newBadges"] == [], "tentative ratée : score 33, aucun badge")
r = play(LRN, eps[0], [0, 0, 0])
ok(r["passed"] is True and r["learning"]["score"] == 100 and r["learning"]["previousScore"] == 33, "réussite : score 100 (le meilleur résultat compte)")
ok(set(r["learning"]["newBadges"]) == {"first_quiz", "perfect", "comeback"}, "badges gagnés : Premier quiz, Sans faute, Persévérant")
r = play(LRN, eps[0], [0, 0, 0]); ok(r["learning"]["newBadges"] == [], "un badge déjà obtenu n'est pas annoncé deux fois")

# --- série : progression puis attestation
d = requests.get(f"{B}/me/learning", headers=LRN).json()
s = next(x for x in d["series"] if x["id"] == sid)
ok(s["total"] == 3 and s["passed"] == 1 and s["complete"] is False and s["attestation"] is None, "série : 1 quiz réussi sur 3")
r = requests.post(f"{B}/me/learning/attestations", headers=LRN, json={"seriesId": sid}); ok(r.status_code == 409 and r.json()["code"] == "incomplete" and "2" in r.json()["error"], "attestation refusée tant qu'il reste des quiz")
ok(requests.post(f"{B}/me/learning/attestations", headers=STD, json={"seriesId": sid}).status_code == 403, "attestation : réservée au palier Apprentissage")
ok(requests.post(f"{B}/me/learning/attestations", headers=LRN, json={"seriesId": str(uuid.uuid4())}).status_code == 404, "attestation : série sans quiz tenté introuvable")
play(LRN, eps[1], [0, 0, 0]); r = play(LRN, eps[2], [0, 0, 0])
ok("series_done" in r["learning"]["newBadges"], "dernier quiz réussi : badge « Série terminée »")
d = requests.get(f"{B}/me/learning", headers=LRN).json()
ok(d["score"] == 100 and d["quizzesPassed"] == 3 and d["quizzesTaken"] == 3, "score 100, 3 quiz réussis")
ok(len(d["curve"]) >= 2 and d["curve"][-1]["score"] == 100, "courbe d'apprentissage disponible")
ok(all(b["earned"] for b in d["badges"] if b["id"] in ("first_quiz", "perfect", "comeback", "series_done")), "badges obtenus affichés avec leur date")
ok(next(b for b in d["badges"] if b["id"] == "first_quiz")["earnedAt"], "date d'obtention renvoyée")
ok(len(d["recent"]) >= 3 and d["recent"][0]["title"], "dernières tentatives listées")
s = next(x for x in d["series"] if x["id"] == sid); ok(s["complete"] is True and s["average"] == 100, "série complète")
r = requests.post(f"{B}/me/learning/attestations", headers=LRN, json={"seriesId": sid}); a = r.json()
ok(r.status_code == 201 and a["created"] is True and len(a["code"]) == 12 and a["url"].endswith("/attestation/" + a["code"]), "attestation délivrée (code de 12 caractères)")
r2 = requests.post(f"{B}/me/learning/attestations", headers=LRN, json={"seriesId": sid}).json()
ok(r2["code"] == a["code"] and r2["created"] is False, "redemander l'attestation renvoie la même")
cur.execute("select count(*) from attestations where user_id=%s", (ulrn,)); ok(cur.fetchone()[0] == 1, "une seule attestation par série et par membre")

# --- page publique
pub = requests.get(f"{B}/attestations/{a['code']}")
p = pub.json()
ok(pub.status_code == 200 and p["holder"] == "Yacine Apprenant" and p["seriesTitle"] == f"Série apprentissage {tag}" and p["quizzes"] == 3 and p["average"] == 100, "vérification publique : titulaire, série, quiz, moyenne")
ok("email" not in pub.text.lower() and "user" not in pub.text.lower(), "la page publique n'expose ni e-mail ni identifiant")
ok(requests.get(f"{B}/attestations/inconnuinconnu").status_code == 404, "code inconnu : 404")
ok(requests.get(f"{B}/attestations/a").status_code == 400, "code mal formé refusé")
d = requests.get(f"{B}/me/learning", headers=LRN).json(); ok(next(x for x in d["series"] if x["id"] == sid)["attestation"]["code"] == a["code"], "le tableau indique l'attestation obtenue")
ok(requests.delete(f"{B}/me/learning/attestations/{a['code']}", headers=STD).status_code == 204, "supprimer l'attestation d'un autre : sans effet")
ok(requests.get(f"{B}/attestations/{a['code']}").status_code == 200, "… elle existe toujours")
ok(requests.delete(f"{B}/me/learning/attestations/{a['code']}", headers=LRN).status_code == 204 and requests.get(f"{B}/attestations/{a['code']}").status_code == 404, "le membre peut retirer son attestation")

# --- l'historique d'un abonné standard est conservé : il le retrouve en passant au palier supérieur
play(STD, eps[1], [0, 0, 0]); subscribe(ustd, "learning")
d = requests.get(f"{B}/me/learning", headers=STD).json()
ok(d["quizzesPassed"] == 2 and d["score"] == 100 and any(b["id"] == "first_quiz" and b["earned"] for b in d["badges"]), "passer à Apprentissage : l'historique des quiz déjà passés est repris")

# --- érosion du score
cur.execute("update quiz_attempts set created_at = now() - interval '60 days' where user_id=%s", (ulrn,))
d = requests.get(f"{B}/me/learning", headers=LRN).json(); ok(d["score"] == 80, "sans révision depuis 60 jours : score 100 -> 80")
play(LRN, eps[0], [0, 0, 0]); d = requests.get(f"{B}/me/learning", headers=LRN).json(); ok(d["score"] > 80, "refaire un quiz relève le score")
cur.execute("update quiz_attempts set created_at = now() - interval '400 days' where user_id=%s", (ulrn,))
d = requests.get(f"{B}/me/learning", headers=LRN).json(); ok(d["score"] == 60, "le score ne descend jamais sous 60 %")

# --- série non publiée / quiz retiré : pas d'attestation
cur.execute("update series set published=false where id=%s", (sid,))
ok(all(x["id"] != sid for x in requests.get(f"{B}/me/learning", headers=STD).json()["series"]), "série dépubliée : disparaît du tableau")
cur.execute("delete from series where id=%s", (sid,)); cur.execute("delete from talks where id = any(%s::uuid[])", (eps,))
print("TOUT OK")
