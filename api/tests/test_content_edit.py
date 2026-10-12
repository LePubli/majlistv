"""10.5 : correction de la transcription, du résumé et des chapitres (+ retraduction / régénération demandées).
Prérequis : API (3055), PG de test (5544)."""
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
ADM = login("admin@test.local", "AdminPassw0rd-test")
vid = "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(11))
tid = requests.post(B + "/talks", headers=O1, json={"title": "Conf correction", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + vid, "rightsConfirmed": True}).json()["id"]
U = f"{B}/talks/{tid}/studio"

# 1) Pas prête : 409
r = requests.get(U + "/transcript", headers=O1); ok(r.status_code == 409 and r.json()["code"] == "not_ready", "transcription pas prête : 409")

# Données : 3 segments fr, 3 segments en, traduction en prête, résumé fr + en prêts
cur.execute("update talks set transcript_status='ready', transcript_language='fr', duration_seconds=600, transcript_text='Bonjour a tous le cheikh parle de la paix' where id=%s", (tid,))
for lang, texts in (("fr", ["Bonjour a tous", "le cheikh parle", "de la paix"]), ("en", ["Hello all", "the sheikh speaks", "about peace"])):
    for i, tx in enumerate(texts):
        cur.execute("insert into transcript_segments values (%s,%s,%s,%s,%s,%s)", (tid, lang, i, i * 1000, i * 1000 + 900, tx))
cur.execute("insert into transcript_translations(talk_id, lang, status, progress) values (%s,'en','ready',100)", (tid,))
for lang in ("fr", "en"):
    cur.execute("insert into talk_insights(talk_id, lang, status, summary, key_points, chapters) values (%s,%s,'ready','Résumé auto','[\"point\"]','[{\"ms\":0,\"title\":\"Intro\"}]')", (tid, lang))

r = requests.get(U + "/transcript", headers=O1).json()
ok(r["lang"] == "fr" and r["sourceLang"] == "fr" and len(r["segments"]) == 3 and r["languages"] == ["en", "fr"], "lecture : langue d'origine, 3 segments, langues disponibles")
ok(r["segments"][0] == {"idx": 0, "s": 0, "e": 900, "t": "Bonjour a tous"}, "format d'un segment")
ok(requests.get(U + "/transcript?lang=en", headers=O1).json()["segments"][0]["t"] == "Hello all", "lecture d'une traduction")
ok(requests.get(U + "/transcript", headers=O2).status_code == 404, "autre organisateur : 404")
ok(requests.get(U + "/transcript").status_code == 401, "sans connexion : 401")
ok(requests.get(U + "/transcript", headers=ADM).status_code == 200, "admin : accès")

# 2) Correction de la langue d'origine
def put(body, h=O1):
    return requests.put(U + "/transcript", headers=h, json={"lang": "fr", **body})


r = put({"changes": [{"idx": 0, "text": "Bonjour à tous"}, {"idx": 1, "text": "le cheikh Ahmed parle"}]})
ok(r.status_code == 200 and r.json() == {"changed": 2, "retranslating": 0, "regenerating": False}, "2 segments corrigés, rien relancé")
cur.execute("select transcript_text, transcript_edited_at is not null from talks where id=%s", (tid,))
ok(cur.fetchone() == ("Bonjour à tous le cheikh Ahmed parle de la paix", True), "texte complet reconstruit, date de correction posée")
cur.execute("select status from transcript_translations where talk_id=%s", (tid,)); ok(cur.fetchone()[0] == "ready", "traduction intacte sans demande")
ok(put({"changes": [{"idx": 0, "text": "Bonjour à tous"}]}).json()["changed"] == 0, "texte identique : 0 changement")
ok(put({"changes": [{"idx": 0, "text": "  "}]}).status_code == 400, "texte vide refusé")
ok(put({"changes": [{"idx": 99, "text": "x"}]}).status_code == 400, "segment inconnu refusé")
ok(put({"changes": [{"idx": 0, "text": "a"}, {"idx": 0, "text": "b"}]}).status_code == 400, "segment en double refusé")
ok(put({"changes": [{"idx": 0, "text": "x"}]}, O2).status_code == 404, "autre organisateur : écriture refusée")
ok(put({"changes": []}).status_code == 400, "liste vide refusée")

# 3) La correction est visible partout : sous-titres, transcription publique, recherche
tok = requests.get(f"{B}/talks/{tid}").json()["playbackToken"]
vtt = requests.get(f"{B}/talks/{tid}/subs/fr.vtt", params={"t": tok}).text
ok("cheikh Ahmed" in vtt, "sous-titres WebVTT corrigés")
ok(requests.get(f"{B}/talks/{tid}/transcript", params={"t": tok}).json()["segments"][1]["t"] == "le cheikh Ahmed parle", "transcription publique corrigée")
ok(any(h["id"] == tid for h in requests.get(B + "/search", params={"q": "Ahmed"}).json()["hits"]), "recherche : le mot corrigé est trouvé")

# 4) Retraduction + régénération du résumé demandées
r = put({"changes": [{"idx": 2, "text": "de la paix et de la justice"}], "retranslate": True, "regenerateInsights": True})
ok(r.json() == {"changed": 1, "retranslating": 1, "regenerating": True}, "retraduction et résumé relancés")
cur.execute("select status, progress from transcript_translations where talk_id=%s", (tid,)); ok(cur.fetchone() == ("pending", 0), "traduction en attente")
cur.execute("select status, edited from talk_insights where talk_id=%s and lang='fr'", (tid,)); ok(cur.fetchone() == ("pending", False), "résumé fr en attente")
cur.execute("select status from talk_insights where talk_id=%s and lang='en'", (tid,)); ok(cur.fetchone()[0] == "ready", "résumé en intact (refait après le fr par le translator)")
cur.execute("update transcript_translations set status='ready' where talk_id=%s", (tid,))
cur.execute("update talk_insights set status='ready' where talk_id=%s", (tid,))

# 5) Correction d'une traduction : ne relance rien
r = requests.put(U + "/transcript", headers=O1, json={"lang": "en", "changes": [{"idx": 1, "text": "the sheikh Ahmed speaks"}], "retranslate": True, "regenerateInsights": True})
ok(r.json() == {"changed": 1, "retranslating": 0, "regenerating": False}, "traduction corrigée : aucune relance")
cur.execute("select status from transcript_translations where talk_id=%s", (tid,)); ok(cur.fetchone()[0] == "ready", "traduction toujours prête")

# 6) Résumé et chapitres
r = requests.get(U + "/insights", headers=O1).json()
ok(r["sourceLang"] == "fr" and r["durationSeconds"] == 600 and {i["lang"] for i in r["insights"]} == {"fr", "en"}, "lecture des résumés")
body = {"summary": "Un résumé corrigé.", "keyPoints": ["Point A", "Point B"], "chapters": [{"ms": 120000, "title": "Fin"}, {"ms": 0, "title": "Début"}]}
r = requests.put(U + "/insights/fr", headers=O1, json=body); ok(r.status_code == 200 and r.json()["translating"] == 0, "résumé fr enregistré")
fr = [i for i in requests.get(U + "/insights", headers=O1).json()["insights"] if i["lang"] == "fr"][0]
ok(fr["summary"] == "Un résumé corrigé." and fr["edited"] and [c["title"] for c in fr["chapters"]] == ["Début", "Fin"], "résumé corrigé, marqué modifié, chapitres triés par temps")
ok(requests.get(f"{B}/talks/{tid}/insights", params={"t": tok, "lang": "fr"}).json()["summary"] == "Un résumé corrigé.", "le visiteur voit le résumé corrigé")
cur.execute("select status from talk_insights where talk_id=%s and lang='en'", (tid,)); ok(cur.fetchone()[0] == "ready", "autres langues intactes")
r = requests.put(U + "/insights/fr", headers=O1, json={**body, "translateOthers": True}); ok(r.json()["translating"] == 1, "traduction des autres langues demandée")
cur.execute("select status, edited from talk_insights where talk_id=%s and lang='en'", (tid,)); ok(cur.fetchone() == ("pending", False), "résumé en remis en attente")
cur.execute("select status from talk_insights where talk_id=%s and lang='fr'", (tid,)); ok(cur.fetchone()[0] == "ready", "résumé fr toujours prêt")
ok(requests.put(U + "/insights/en", headers=O1, json=body).status_code == 409, "langue en cours de traduction : 409")
cur.execute("update talk_insights set status='ready' where talk_id=%s", (tid,))
ok(requests.put(U + "/insights/fr", headers=O1, json={**body, "chapters": [{"ms": 9999999, "title": "Trop tard"}]}).status_code == 400, "chapitre après la fin refusé")
ok(requests.put(U + "/insights/fr", headers=O1, json={"summary": "", "keyPoints": [], "chapters": []}).status_code == 400, "résumé vide refusé")
ok(requests.put(U + "/insights/fr", headers=O1, json={**body, "chapters": [{"ms": 0, "title": ""}]}).status_code == 400, "titre de chapitre vide refusé")
ok(requests.put(U + "/insights/fr", headers=O2, json=body).status_code == 404, "autre organisateur : refusé")
ok(requests.put(U + "/insights/de", headers=O1, json=body).status_code == 404, "langue sans résumé (hors origine) : 404")
cur.execute("delete from talk_insights where talk_id=%s", (tid,))
ok(requests.put(U + "/insights/fr", headers=O1, json=body).status_code == 200, "résumé écrit à la main quand la génération avait échoué (langue d'origine)")

requests.delete(f"{B}/talks/{tid}", headers=O1)
print("\nTOUT EST OK")
