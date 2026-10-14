"""29.1 : génération des propositions d'action par l'IA (service translator + fausse API Claude), de bout en bout.
Prérequis : API (3055), PG de test (5544), translator (POLL_SECONDS=2) relié à tests/mock_claude.py (voir README, étape 29)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


email = f"pzg-{uuid.uuid4().hex[:6]}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (email,))
O = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}
tag = uuid.uuid4().hex[:6]
tid = requests.post(B + "/talks", headers=O, json={"title": f"Conf gén {tag}", "language": "fr", "translateTo": [], "videoUrl": "https://youtu.be/" + (tag + "abcde")[:11], "rightsConfirmed": True}).json()["id"]
S = f"{B}/talks/{tid}/studio/practice"
lines = ["Bienvenue à cette conférence consacrée à la patience dans les épreuves de la vie.",
         "La patience est d'abord une manière de regarder les épreuves avec lucidité et confiance.",
         "Elle ne consiste pas à se taire mais à ne pas se laisser dominer par la colère ni le désespoir.",
         "Le deuxième point concerne la gratitude qui accompagne toute situation difficile ou heureuse.",
         "Enfin la constance dans la prière est la meilleure école pour apprendre à patienter vraiment.",
         "En conclusion retenons que la patience se cultive chaque jour par de petits efforts répétés."]
cur.execute("update talks set transcript_status='ready', transcript_language='fr', duration_seconds=600 where id=%s", (tid,))
for i, tx in enumerate(lines):
    cur.execute("insert into transcript_segments values (%s,'fr',%s,%s,%s,%s)", (tid, i, i * 21000, i * 21000 + 20000, tx))

ok(requests.post(f"{S}/generate", headers=O, json={"count": 9}).status_code == 400, "nombre hors 3-5 refusé")
ok(requests.post(f"{S}/generate", headers=O, json={"count": 4}).status_code == 202, "génération demandée")
ok(requests.post(f"{S}/generate", headers=O, json={}).status_code in (202, 409), "seconde demande pendant le traitement : acceptée ou refusée proprement")
for _ in range(40):
    d = requests.get(S, headers=O).json()
    if d["job"] and d["job"]["status"] in ("ready", "failed"):
        break
    time.sleep(2)
j = d["job"]
ok(j and j["status"] == "ready", f"génération terminée ({j and j['status']} {j and j['error']})")
ok(j["produced"] == 4 and j["dropped"] == 3, f"4 propositions gardées, 3 écartées (citation inventée, hadith, guillemets) : {j['produced']}/{j['dropped']}")
sg = d["suggestions"]
ok(len(sg) == 4 and all(x["status"] == "draft" and x["origin"] == "ai" for x in sg), "propositions en brouillon, origine « ia »")
ok(all(x["evidenceQuote"] and x["evidenceMs"] is not None and x["reference"] == "" for x in sg), "chaque proposition a son passage cité ; aucune référence inventée")
cur.execute("select count(*) from practice_suggestions s join transcript_segments g on g.talk_id=s.talk_id and g.lang=s.lang and s.evidence_quote like '%%' || g.text || '%%' where s.talk_id=%s", (tid,))
ok(cur.fetchone()[0] >= 1, "le passage cité est bien tiré de la transcription")
ok(not any("hadith" in x["text"].lower() or "«" in x["text"] for x in sg), "aucun texte religieux ni citation dans les propositions")
ok(requests.get(f"{B}/talks/{tid}/practice").status_code == 404, "brouillons : rien de public")
# validation de l'une, puis nouvelle génération : la validée reste, les brouillons sont remplacés
keep = sg[0]["id"]
requests.patch(f"{B}/studio/practice/suggestions/{keep}", headers=O, json={"status": "approved"})
ok(requests.post(f"{S}/generate", headers=O, json={"count": 4}).status_code == 202, "nouvelle génération")
for _ in range(40):
    d = requests.get(S, headers=O).json()
    if d["job"]["status"] in ("ready", "failed"):
        break
    time.sleep(2)
ok(d["job"]["status"] == "ready", "nouvelle génération terminée")
ids = [x["id"] for x in d["suggestions"]]
ok(keep in ids and d["approved"] == 1, "la proposition validée est conservée")
drafts = [x for x in d["suggestions"] if x["status"] == "draft"]
ok(len(drafts) == 3 and all(x["text"] != sg[0]["text"] for x in drafts), "les anciens brouillons sont remplacés, sans doublon avec la proposition validée")
ok(requests.get(f"{B}/talks/{tid}/practice").status_code == 200, "la proposition validée est publique")
cur.execute("delete from talks where id=%s", (tid,))
print("tout est bon")
