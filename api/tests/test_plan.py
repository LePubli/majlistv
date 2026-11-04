"""Planning de révisions (étape 1) : séances, jours de repos, révisions automatiques, accès réservé au palier Apprentissage.
Prérequis : API (3055), PG de test (5544), un compte admin admin@test.local."""
import sys, uuid, datetime, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def member(name="Plan Test"):
    email = f"plan-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": name})
    cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]
    tok = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]
    return {"authorization": "Bearer " + tok}, uid


def subscribe(uid, tier):
    cur.execute("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values (%s,%s,'active','p','month',now()+interval '20 days',1,%s)", ("sub_" + uuid.uuid4().hex[:8], uid, tier))


FREE, _ = member(); STD, ustd = member(); LRN, ulrn = member(); OTH, uoth = member()
subscribe(ustd, "standard"); subscribe(ulrn, "learning"); subscribe(uoth, "learning")
cur.execute("select (now() at time zone 'Europe/Paris')::date"); today = cur.fetchone()[0]
d = lambda n: (today + datetime.timedelta(days=n)).isoformat()
win = {"from": d(-3), "to": d(30)}

# accès
ok(requests.get(f"{B}/me/learning/plan", params=win).status_code in (401, 403), "planning : connexion obligatoire")
for who, h in (("sans abonnement", FREE), ("abonné standard", STD)):
    r = requests.get(f"{B}/me/learning/plan", headers=h, params=win)
    ok(r.status_code == 403 and r.json()["code"] == "learning_required", f"{who} : refusé")
    ok(requests.post(f"{B}/me/learning/plan", headers=h, json={"day": d(1), "kind": "custom", "note": "x"}).status_code == 403, f"{who} : ajout refusé")
r = requests.get(f"{B}/me/learning/plan", headers=LRN, params=win); j = r.json()
ok(r.status_code == 200 and j["today"] == today.isoformat() and j["items"] == [] and j["auto"] == [] and j["rest"] == [], "abonné Apprentissage : planning vide")
ok(requests.get(f"{B}/me/learning/plan", headers=LRN, params={"from": d(0), "to": d(200)}).status_code == 400, "fenêtre trop large refusée")
ok(requests.get(f"{B}/me/learning/plan", headers=LRN, params={"from": "oups", "to": d(2)}).status_code == 400, "date invalide refusée")

# contenu de test : une vidéo prête avec une question approuvée
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) values (%s,'d','Cheikh','youtube','abc',%s,'published','ready','free',600) returning id", ("Plan test " + uuid.uuid4().hex[:5], aid))
tid = cur.fetchone()[0]
cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,origin,status) values (%s,'fr','Q ?','[\"A\",\"B\",\"C\"]',0,'x',1000,'manual','approved') returning id", (tid,))
qid = cur.fetchone()[0]

# séances
H = LRN
r = requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(2), "kind": "custom", "note": "Relire mes notes"}); ok(r.status_code == 201 and r.json()["kind"] == "custom", "séance libre ajoutée")
cid = r.json()["id"]
ok(requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(2), "kind": "custom"}).status_code == 400, "séance libre sans note refusée")
ok(requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(2), "kind": "video"}).status_code == 400, "vidéo sans identifiant refusée")
ok(requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(2), "kind": "video", "talkId": str(uuid.uuid4())}).status_code == 404, "vidéo inconnue refusée")
ok(requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(-1), "kind": "custom", "note": "passé"}).status_code == 400, "jour passé refusé")
ok(requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(400), "kind": "custom", "note": "loin"}).status_code == 400, "plus d'un an refusé")
r = requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(3), "kind": "video", "talkId": str(tid)}); ok(r.status_code == 201, "séance vidéo ajoutée")
vid = r.json()["id"]
r = requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()
ok(len(r["items"]) == 2 and any(i["title"].startswith("Plan test") for i in r["items"]), "les séances reviennent avec le titre de la vidéo")

# déplacer, cocher
r = requests.patch(f"{B}/me/learning/plan/{cid}", headers=H, json={"day": d(5)}); ok(r.status_code == 200 and r.json()["day"] == d(5), "séance déplacée")
r = requests.patch(f"{B}/me/learning/plan/{cid}", headers=H, json={"done": True}); ok(r.json()["done"] is True, "séance cochée")
r = requests.patch(f"{B}/me/learning/plan/{cid}", headers=H, json={"done": False}); ok(r.json()["done"] is False, "séance décochée")
ok(requests.patch(f"{B}/me/learning/plan/{cid}", headers=H, json={}).status_code == 400, "modification vide refusée")
ok(requests.patch(f"{B}/me/learning/plan/{cid}", headers=H, json={"day": d(-2)}).status_code == 400, "déplacement vers le passé refusé")

# isolation entre membres
ok(requests.patch(f"{B}/me/learning/plan/{cid}", headers=OTH, json={"done": True}).status_code == 404, "un autre membre ne peut pas modifier ma séance")
requests.delete(f"{B}/me/learning/plan/{cid}", headers=OTH)
ok(len(requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["items"]) == 2, "un autre membre ne peut pas la supprimer")
ok(requests.get(f"{B}/me/learning/plan", headers=OTH, params=win).json()["items"] == [], "mon planning est privé")

# jours de repos
ok(requests.put(f"{B}/me/learning/plan/rest", headers=H, json={"day": d(5), "rest": True}).status_code == 409, "repos refusé sur un jour qui a des séances")
ok(requests.put(f"{B}/me/learning/plan/rest", headers=H, json={"day": d(7), "rest": True}).status_code == 200, "jour de repos posé")
ok(requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["rest"] == [d(7)], "jour de repos listé")
r = requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(7), "kind": "custom", "note": "finalement"}); ok(r.status_code == 201, "séance posée sur un repos")
ok(requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["rest"] == [], "… annule le repos")
requests.put(f"{B}/me/learning/plan/rest", headers=H, json={"day": d(9), "rest": True})
ok(requests.put(f"{B}/me/learning/plan/rest", headers=H, json={"day": d(9), "rest": False}).json()["rest"] is False, "repos retiré")
ok(requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["rest"] == [], "plus de repos")

# journée pleine
for i in range(18):
    requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(12), "kind": "custom", "note": f"n{i}"})
requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(12), "kind": "custom", "note": "n18"})
requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(12), "kind": "custom", "note": "n19"})
r = requests.post(f"{B}/me/learning/plan", headers=H, json={"day": d(12), "kind": "custom", "note": "de trop"}); ok(r.status_code == 409 and r.json()["code"] == "day_full", "20 séances par jour au plus")

# révisions automatiques
cur.execute("insert into revision_items(user_id, talk_id, stage, anchor_on, due_on, last_percent) values (%s,%s,1,%s,%s,80)", (ulrn, tid, d(-10), d(-2)))
a = requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["auto"]
if qid:
    ok(any(x["type"] == "revision" and x["day"] == d(0) for x in a), "révision en retard : ramenée à aujourd'hui")
    cur.execute("update revision_items set due_on=%s where user_id=%s", (d(4), ulrn))
    a = requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["auto"]
    ok(any(x["type"] == "revision" and x["day"] == d(4) and x["title"].startswith("Plan test") for x in a), "révision future : placée à son jour")
    cur.execute("insert into memory_card_progress(user_id, question_id, stage, due_on, seen, known, first_on, last_on) values (%s,%s,1,%s,1,1,%s,%s)", (ulrn, qid, d(6), d(-3), d(-3)))
    a = requests.get(f"{B}/me/learning/plan", headers=H, params=win).json()["auto"]
    ok(any(x["type"] == "cards" and x["day"] == d(6) and x["count"] == 1 for x in a), "cartes mémoire à revoir : un bloc par jour")
    ok(requests.get(f"{B}/me/learning/plan", headers=OTH, params=win).json()["auto"] == [], "révisions d'un autre membre invisibles")

# suppression
ok(requests.delete(f"{B}/me/learning/plan/{vid}", headers=H).status_code == 204, "séance supprimée")
cur.execute("delete from talks where id=%s", (tid,))
print("\nTout est bon")
