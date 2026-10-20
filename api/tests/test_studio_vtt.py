"""Téléchargement des sous-titres (.vtt) depuis le Studio : droits, langues, format.
Prérequis : API (3055), PG de test (5544)."""
import random, sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def organizer():
    email = f"orga-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga"})
    cur.execute("update users set role='organizer' where email=%s", (email,))
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}


O1, O2 = organizer(), organizer()
vid = "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))
tid = requests.post(B + "/talks", headers=O1, json={"title": "Conf vtt", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + vid, "rightsConfirmed": True}).json()["id"]
U = f"{B}/talks/{tid}/studio/subs"
cur.execute("update talks set transcript_status='ready', transcript_language='fr', duration_seconds=600 where id=%s", (tid,))
for i, tx in enumerate(["Bonjour à tous", "le cheikh parle --> de la <paix>", "Merci"]):
    cur.execute("insert into transcript_segments values (%s,'fr',%s,%s,%s,%s)", (tid, i, i * 1000 + (3600000 if i == 2 else 0), i * 1000 + 900 + (3600000 if i == 2 else 0), tx))
cur.execute("insert into transcript_segments values (%s,'en',0,0,900,'Hello all')", (tid,))

r = requests.get(U + "/fr.vtt", headers=O1)
ok(r.status_code == 200 and r.headers["content-type"].startswith("text/vtt"), "fr.vtt : 200 text/vtt")
ok("attachment" in r.headers.get("content-disposition", "") and "sous-titres-fr.vtt" in r.headers["content-disposition"], "en-tête de téléchargement")
t = r.text
ok(t.startswith("WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.900\nBonjour à tous"), "format WebVTT et premier sous-titre")
ok("--&gt;" in t and "&lt;paix>" in t, "caractères spéciaux échappés")
ok("3\n01:00:02.000 --> 01:00:02.900\nMerci" in t, "horodatage après 1 heure")
ok(t.count("-->") == 3 and t.endswith("\n"), "3 sous-titres, fichier terminé par un saut de ligne")
ok(requests.get(U + "/en.vtt", headers=O1).text.count("-->") == 1, "autre langue : en.vtt")
ok(requests.get(U + "/de.vtt", headers=O1).status_code == 404, "langue sans sous-titres : 404")
ok(requests.get(U + "/fr.txt", headers=O1).status_code == 404, "mauvaise extension : 404")
ok(requests.get(U + "/..%2Ffr.vtt", headers=O1).status_code in (400, 404), "nom piégé refusé")
ok(requests.get(U + "/fr.vtt", headers=O2).status_code == 404, "un autre organisateur : 404")
ok(requests.get(U + "/fr.vtt").status_code in (401, 403), "sans connexion : refusé")
cur.execute("delete from talks where id=%s", (tid,))
print("\nTout est bon")
