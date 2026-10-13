"""24.2 (correctif) : les questions sont écrites dans la langue du site (français par défaut), pas dans celle de la vidéo.
Prérequis : API (3055), PG de test (5544), translator + fausse API Claude lancés."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


A = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
requests.put(B + "/admin/settings", headers=A, json={"values": {"quiz_language": None}}); time.sleep(11)  # réglage par défaut (le service relit toutes les 10 s)
aid = cur.execute("select id from users where email='admin@test.local'") or cur.fetchone()[0]
ar = ["مرحبا بكم في هذه المحاضرة المخصصة للصبر في ابتلاءات الحياة اليومية",
      "الصبر قبل كل شيء طريقة للنظر إلى الابتلاءات بوضوح وثقة في الله",
      "ليس الصبر أن تسكت بل ألا تدع الغضب واليأس يتحكمان فيك أبدا",
      "النقطة الثانية تتعلق بالشكر الذي يرافق كل حال صعبة كانت أم سعيدة"]
fr = ["Bienvenue à cette conférence consacrée à la patience dans les épreuves.", "La patience est d'abord une manière de regarder les épreuves avec confiance.",
      "Patienter n'est pas se taire mais ne pas laisser la colère nous dominer.", "Le deuxième point concerne la gratitude en toute situation."]


def talk(with_fr):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language,language) "
                "values ('Conf arabe','d','Cheikh','youtube',%s,%s,'published','ready','free',600,'ready','ar','ar') returning id", ("v" + uuid.uuid4().hex[:9], aid))
    tid = cur.fetchone()[0]
    for i, tx in enumerate(ar):
        cur.execute("insert into transcript_segments values (%s,'ar',%s,%s,%s,%s)", (tid, i, i * 21000, i * 21000 + 20000, tx))
        if with_fr:
            cur.execute("insert into transcript_segments values (%s,'fr',%s,%s,%s,%s)", (tid, i, i * 21000, i * 21000 + 20000, fr[i]))
    return tid


def generate(tid):
    r = requests.post(f"{B}/talks/{tid}/studio/quiz/generate", headers=A, json={"count": 3}); ok(r.status_code == 202, "génération demandée")
    for _ in range(40):
        time.sleep(1)
        d = requests.get(f"{B}/talks/{tid}/studio/quiz", headers=A).json()
        if d["job"] and d["job"]["status"] in ("ready", "failed"):
            return d
    ok(False, "génération terminée à temps")


# vidéo arabe, traduction française disponible : questions en français, citation en français
d = generate(talk(True)); qs = d["questions"]
ok(d["job"]["status"] == "ready" and len(qs) >= 1, f"génération réussie ({len(qs)} questions)")
ok(all(q["lang"] == "fr" for q in qs), "langue des questions : fr")
ok(all("(French)" in q["explanation"] or "(Français)" in q["explanation"] or "(fr" in q["explanation"].lower() for q in qs), "l'IA reçoit la consigne d'écrire en français")
ok(all(q["evidenceQuote"] in fr for q in qs) or all(any(f in q["evidenceQuote"] for f in fr) for q in qs), "citation affichée : transcription traduite en français")

# vidéo arabe sans traduction : questions quand même en français, citation d'origine
d = generate(talk(False)); qs = d["questions"]
ok(len(qs) >= 1 and all(q["lang"] == "fr" for q in qs), "sans traduction : questions en français")
ok(all(any(a in q["evidenceQuote"] for a in ar) for q in qs), "sans traduction : citation dans la langue d'origine (mot pour mot)")

# réglage du site : arabe
requests.put(B + "/admin/settings", headers=A, json={"values": {"quiz_language": "ar"}})
time.sleep(12)  # le service relit les réglages toutes les 10 s
d = generate(talk(False)); ok(all(q["lang"] == "ar" for q in d["questions"]) and len(d["questions"]) >= 1, "réglage « Langue des questions » = ar respecté")
requests.put(B + "/admin/settings", headers=A, json={"values": {"quiz_language": None}})
print("TOUT OK")
