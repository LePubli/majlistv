"""Étape E1 (vitrine visiteur) : conférence tirée parmi les plus vues avec quiz, aucune fuite de réponse, quiz jouable sans compte,
chapitres cachés pour une conférence premium, fonction coupable. Prérequis : API (3055), PG de test (5544)."""
import sys, time, uuid, json, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
made = []


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def cleanup():
    for tid in made:
        cur.execute("delete from talks where id = %s", (tid,))
    cur.execute("delete from app_settings where key = 'feat_showcase'")


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


ADMIN = login("admin@test.local", "AdminPassw0rd-test")
cur.execute("select id from users where email = 'admin@test.local'"); aid = cur.fetchone()[0]
tag = uuid.uuid4().hex[:6]


def talk(title, access, views, with_quiz=True, chapters=True):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,quiz_enabled) values (%s,'Description de la conférence.','Cheikh Test','youtube',%s,%s,'published','ready',%s,2520,true) returning id",
                (f"{title} {tag}", "v" + uuid.uuid4().hex[:9], aid, access))
    tid = cur.fetchone()[0]; made.append(tid)
    if with_quiz:
        for i in range(3):
            cur.execute("insert into quiz_questions(talk_id, lang, question, options, correct_index, explanation, evidence_ms, origin, status) values (%s,'fr',%s,%s,1,%s,%s,'manual','approved')",
                        (tid, f"Question {i} de {title} ?", json.dumps(["Faux A", "Vrai B", "Faux C"]), f"Explication {i}", 60000 * (i + 1)))
    if chapters:
        cur.execute("insert into talk_insights(talk_id, lang, summary, key_points, chapters, status) values (%s,'fr','Résumé de test.','[]',%s,'ready')",
                    (tid, json.dumps([{"ms": 0, "title": "Introduction"}, {"ms": 510000, "title": "Chapitre 2"}])))
    cur.execute("insert into stat_talk_daily(day, talk_id, audience, views, plays) values (current_date, %s, 'web', %s, %s)", (tid, views, views))
    return str(tid)


# Les autres conférences avec quiz sont écartées le temps du test (valeur d'origine rétablie à la fin), pour un tirage prévisible.
cur.execute("select id, quiz_enabled from talks")
ORIG = cur.fetchall()
cur.execute("update talks set quiz_enabled = false")
_cleanup = cleanup


def cleanup():
    _cleanup()
    for tid, v in ORIG:
        cur.execute("update talks set quiz_enabled = %s where id = %s", (v, tid))


import atexit
atexit.register(lambda: cleanup())
free = talk("Conférence libre", "free", 50000)
prem = talk("Conférence premium", "premium", 40000)
noquiz = talk("Sans quiz", "free", 99999, with_quiz=False)

r = requests.get(B + "/showcase"); d = r.json()
ok(r.status_code == 200 and d["available"] is True, "GET /showcase public : une conférence est proposée")
ok(d["talk"]["id"] in (free, prem), "la conférence a un quiz (celle sans quiz, pourtant la plus vue, est écartée)")
ok(d["quizCount"] >= 3 and len(d["question"]["options"]) == 3, "une vraie question du quiz, avec ses réponses")
txt = json.dumps(d)
ok("correct" not in txt.lower() and "Explication" not in txt, "aucune bonne réponse ni explication dans la réponse de /showcase")
ok(d["talk"]["speaker"] == "Cheikh Test" and d["talk"]["durationSeconds"] == 2520 and d["talk"]["summary"] == "Résumé de test.", "intervenant, durée et résumé")

# Tirage aléatoire : les deux conférences ressortent sur plusieurs appels.
seen = set()
for _ in range(25):
    seen.add(requests.get(B + "/showcase").json()["talk"]["id"])
ok(seen == {free, prem}, "le tirage varie entre les conférences les plus vues")

# Chapitres : visibles pour une conférence libre, cachés (seulement leur nombre) pour une premium.
for _ in range(14):
    d = requests.get(B + "/showcase").json()
    if d["talk"]["id"] == free:
        ok([c["title"] for c in d["chapters"]] == ["Introduction", "Chapitre 2"], "conférence libre : chapitres affichés"); break
for _ in range(14):
    d = requests.get(B + "/showcase").json()
    if d["talk"]["id"] == prem:
        ok(d["chapters"] == [] and d["chapterCount"] == 2, "conférence premium : chapitres cachés, seul leur nombre est donné"); break

# Le quiz est jouable sans compte et corrige la question affichée.
d = requests.get(B + "/showcase").json(); tid = d["talk"]["id"]; q = d["question"]
res = requests.post(f"{B}/talks/{tid}/quiz/submit", json={"answers": [{"questionId": q["id"], "index": 1}]}).json()
mine = [x for x in res["results"] if x["questionId"] == q["id"]][0]
ok(res["saved"] is False and mine["correct"] is True and mine["explanation"].startswith("Explication"), "visiteur : bonne réponse reconnue, explication fournie, rien d'enregistré")
res = requests.post(f"{B}/talks/{tid}/quiz/submit", json={"answers": [{"questionId": q["id"], "index": 0}]}).json()
mine = [x for x in res["results"] if x["questionId"] == q["id"]][0]
ok(mine["correct"] is False and mine["correctIndex"] == 1, "mauvaise réponse : la bonne est révélée après coup")

# Une conférence non publiée n'est jamais proposée.
cur.execute("update talks set publication = 'draft' where id = %s", (free,)); cur.execute("update talks set publication = 'draft' where id = %s", (prem,))
d = requests.get(B + "/showcase").json()
ok(d["available"] is False or d["talk"]["id"] not in (free, prem), "conférences non publiées exclues")
cur.execute("update talks set publication = 'published' where id in (%s, %s)", (free, prem))

# Interrupteur : fonction « Vitrine visiteur » coupée → route fermée ; /features l'indique.
ok(requests.get(B + "/features").json().get("showcase") is True, "/features : vitrine activée par défaut")
assert requests.put(B + "/admin/features", json={"values": {"showcase": False}}, headers=ADMIN).status_code == 200; time.sleep(5.3)
r = requests.get(B + "/showcase")
ok(r.status_code == 404 and r.json()["code"] == "feature_off", "vitrine coupée : /showcase fermée")
ok(requests.get(B + "/features").json()["showcase"] is False, "/features reflète la vitrine coupée")
assert requests.put(B + "/admin/features", json={"values": {"showcase": True}}, headers=ADMIN).status_code == 200; time.sleep(5.3)
ok(requests.get(B + "/showcase").status_code == 200, "vitrine rallumée")

cleanup()
print("TOUT EST BON", flush=True)
