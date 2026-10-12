"""10.6 : chronologie du traitement (déclencheurs SQL), relance de conversion, retraduction forcée.
Prérequis : API (3055) et PG de test (5544)."""
import random, sys, uuid, requests, psycopg2

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


O1, O2 = organizer(), organizer()
vid = "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))
tid = requests.post(B + "/talks", headers=O1, json={"title": "Conf suivi", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + vid, "rightsConfirmed": True}).json()["id"]
U = f"{B}/talks/{tid}"


def events(h=O1):
    r = requests.get(U + "/studio/timeline", headers=h)
    return r.json()["events"] if r.status_code == 200 else r.status_code


def has(kind, status=None, lang=None):
    return any(e["kind"] == kind and (status is None or e["status"] == status) and (lang is None or e["lang"] == lang) for e in events())


ev = events()
ok(has("created") and has("transcript", "pending"), "création et transcription en attente enregistrées")
ok(events(O2) == 404 and requests.get(U + "/studio/timeline").status_code == 401, "chronologie réservée au propriétaire")

cur.execute("update talks set transcript_status='processing' where id=%s", (tid,))
cur.execute("update talks set transcript_status='failed', transcript_error='Whisper indisponible' where id=%s", (tid,))
cur.execute("update talks set transcript_status='ready', transcript_error=NULL, transcript_language='fr', duration_seconds=100 where id=%s", (tid,))
ev = events()
tr = [e for e in ev if e["kind"] == "transcript"]
ok([e["status"] for e in reversed(tr)] == ["pending", "processing", "failed", "ready"], "transcription : pending, processing, failed, ready dans l'ordre")
ok(any(e["status"] == "failed" and e["message"] == "Whisper indisponible" for e in tr), "message d'erreur conservé")
ok(ev[0]["status"] == "ready" and ev[0]["kind"] == "transcript", "tri : le plus récent d'abord")
cur.execute("update talks set title='autre titre' where id=%s", (tid,))
ok(len(events()) == len(ev), "un changement sans rapport n'ajoute aucun évènement")

# traductions + résumés
cur.execute("insert into transcript_translations(talk_id, lang) values (%s,'en')", (tid,))
cur.execute("update transcript_translations set status='processing' where talk_id=%s", (tid,))
cur.execute("update transcript_translations set progress=50 where talk_id=%s", (tid,))
cur.execute("update transcript_translations set status='ready', progress=100 where talk_id=%s", (tid,))
en = [e["status"] for e in reversed(events()) if e["kind"] == "translation" and e["lang"] == "en"]
ok(en == ["pending", "processing", "ready"], "traduction en : 3 évènements (la progression n'en crée pas)")
cur.execute("insert into talk_insights(talk_id, lang, status, summary) values (%s,'fr','ready','r')", (tid,))
ok(has("insights", "ready", "fr"), "résumé fr prêt enregistré")

# Retraduction forcée
r = requests.post(U + "/translations", headers=O1, json={"lang": "en"}); ok(r.status_code == 202, "ajout d'une langue déjà prête : accepté")
cur.execute("select status from transcript_translations where talk_id=%s and lang='en'", (tid,)); ok(cur.fetchone()[0] == "ready", "sans force : traduction prête non touchée")
r = requests.post(U + "/translations", headers=O1, json={"lang": "en", "force": True}); ok(r.status_code == 202, "retraduction forcée acceptée")
cur.execute("select status from transcript_translations where talk_id=%s and lang='en'", (tid,)); ok(cur.fetchone()[0] == "pending", "avec force : traduction remise en attente")
ok([e["status"] for e in events() if e["kind"] == "translation" and e["lang"] == "en"][0] == "pending", "évènement de relance enregistré")
cur.execute("update transcript_translations set status='processing' where talk_id=%s", (tid,))
requests.post(U + "/translations", headers=O1, json={"lang": "en", "force": True})
cur.execute("select status from transcript_translations where talk_id=%s and lang='en'", (tid,)); ok(cur.fetchone()[0] == "processing", "force : une traduction en cours n'est pas interrompue")
cur.execute("update transcript_translations set status='failed', error='quota dépassé' where talk_id=%s", (tid,))
me = {t["id"]: t for t in requests.get(B + "/me/talks", headers=O1).json()}[tid]
ok(me["translations"][0]["error"] == "quota dépassé", "/me/talks : message d'erreur de la traduction")

# Résumé modifié à la main, publication
requests.put(U + "/studio/insights/fr", headers=O1, json={"summary": "Mon résumé", "keyPoints": [], "chapters": []})
ok(has("insights", "edited", "fr"), "résumé modifié à la main enregistré")
requests.patch(U, headers=O1, json={"publication": "draft"})
requests.patch(U, headers=O1, json={"publication": "scheduled", "publishAt": "2099-01-01T10:00:00Z"})
pub = [e for e in events() if e["kind"] == "publication"]
ok([e["status"] for e in reversed(pub)] == ["draft", "scheduled"] and pub[0]["message"] == "2099-01-01T10:00:00Z", "publication : brouillon puis programmée avec sa date")
requests.put(U + "/studio/transcript", headers=O1, json={"lang": "fr", "changes": [{"idx": 0, "text": "x"}]})  # 400 : pas de segment, aucun évènement
cur.execute("insert into transcript_segments values (%s,'fr',0,0,900,'a')", (tid,))
requests.put(U + "/studio/transcript", headers=O1, json={"lang": "fr", "changes": [{"idx": 0, "text": "b"}]})
ok(has("edited", "transcript"), "correction de la transcription enregistrée")

# Relance de conversion
r = requests.post(U + "/reconvert", headers=O1); ok(r.status_code == 400, "vidéo de plateforme : rien à convertir (400)")
cur.execute("update talks set source='upload', video_status='failed', video_error='ffmpeg a échoué', transcode_attempts=3 where id=%s", (tid,))
ok(any(e["kind"] == "video" and e["status"] == "failed" and e["message"] == "ffmpeg a échoué" for e in events()), "échec de conversion enregistré avec son message")
me = {t["id"]: t for t in requests.get(B + "/me/talks", headers=O1).json()}[tid]; ok(me["videoError"] == "ffmpeg a échoué", "/me/talks : videoError")
ok(requests.post(U + "/reconvert", headers=O2).status_code == 404, "autre organisateur : refusé")
r = requests.post(U + "/reconvert", headers=O1); ok(r.status_code == 202, "relance de conversion acceptée")
cur.execute("select video_status, video_error, transcode_attempts from talks where id=%s", (tid,)); ok(cur.fetchone() == ("pending", None, 0), "vidéo remise en attente, compteur remis à zéro")
ok(requests.post(U + "/reconvert", headers=O1).status_code == 409, "relance impossible si la conversion n'a pas échoué")

# Suppression
cur.execute("update talks set source='youtube' where id=%s", (tid,))
requests.delete(U, headers=O1)
cur.execute("select count(*) from talk_events where talk_id=%s", (tid,)); ok(cur.fetchone()[0] == 0, "suppression de la conférence : chronologie supprimée")
print("\nTOUT EST OK")
