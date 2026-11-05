"""Références citées (amélioration 3.5) : lecture publique (validées seulement, texte de la source), Studio (détection, ajout, relecture, droits).
Prérequis : API (3055), PG de test (5544), compte admin admin@test.local. Le service d'IA (translator) n'est pas lancé : ses résultats sont simulés en base ;
la vérification des extraits est testée à part (translator/tests/test_references_clean.py)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def user(role="user"):
    email = f"ref-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Ref Test"})
    cur.execute("update users set role=%s where email=%s", (role, email))
    tok = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]
    cur.execute("select id from users where email=%s", (email,))
    return {"authorization": "Bearer " + tok}, cur.fetchone()[0]


ADM = {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
ORG, uorg = user("organizer"); ORG2, _ = user("organizer"); MOD, _ = user("moderator"); MEM, _ = user("user")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]


def talk(owner, status="published", transcript="ready"):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language) "
                "values (%s,'d','Cheikh','youtube','abc',%s,%s,'ready','free',600,%s,'fr') returning id", ("Réf test " + uuid.uuid4().hex[:5], owner, status, transcript))
    return str(cur.fetchone()[0])


# Source : le corpus (un verset, un hadith). Ce texte, et lui seul, doit être affiché.
cur.execute("delete from corpus_items where (collection='quran' and ref in ('2:153','2:154')) or (collection='bukhari' and ref='1')")
cur.execute("insert into corpus_items(kind,collection,ref,label,text_ar,text_fr,grade) values ('quran','quran','2:153','Coran 2:153 (Al-Baqara), trad. Hamidullah','يا أيها الذين آمنوا','O vous qui croyez ! Cherchez secours dans l''endurance et la prière','')")
cur.execute("insert into corpus_items(kind,collection,ref,label,text_ar,text_fr,grade) values ('hadith','bukhari','1','Sahih al-Boukhari, n° 1','إنما الأعمال بالنيات','Les actes ne valent que par les intentions','Sahih')")

T = talk(aid)
# accès public : rien de validé → 404
ok(requests.get(f"{B}/talks/{T}/references").status_code == 404, "public : aucune référence validée → 404")
r = requests.get(f"{B}/talks/{T}").json()
ok(r.get("references") == {"available": False, "count": 0}, "fiche vidéo : références non disponibles")

# résultats simulés du service d'IA
def ins(tid, key, kind, status, origin="ai", **kw):
    f = dict(sura=None, aya_from=None, aya_to=None, collection="", number="", said_as="", start_ms=1000, excerpt="extrait", match=None, found=False); f.update(kw)
    cur.execute("insert into talk_references(talk_id,kind,sura,aya_from,aya_to,collection,number,said_as,ref_key,start_ms,excerpt,match,found,origin,status) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
                (tid, kind, f["sura"], f["aya_from"], f["aya_to"], f["collection"], f["number"], f["said_as"], key, f["start_ms"], f["excerpt"], f["match"], f["found"], origin, status))
    return str(cur.fetchone()[0])


q1 = ins(T, "q:2:153-153", "quran", "approved", sura=2, aya_from=153, aya_to=153, start_ms=9000, excerpt="Cherchez secours dans l'endurance", match=90, found=True)
h1 = ins(T, "h:bukhari:1", "hadith", "draft", collection="bukhari", number="1", start_ms=25000, found=True, match=40)
hu = ins(T, "h:?:x", "hadith", "approved", start_ms=45000, excerpt="celui qui ne remercie pas les gens")
q2 = ins(T, "q:2:154-154", "quran", "draft", sura=2, aya_from=154, aya_to=154)

r = requests.get(f"{B}/talks/{T}/references"); j = r.json()
ok(r.status_code == 200 and [x["id"] for x in j["references"]] == [q1, hu], "public : seules les références validées, dans l'ordre de la vidéo")
a = j["references"][0]
ok(a["label"] == "Coran 2:153 (Al-Baqara)" and a["fr"].startswith("O vous qui croyez") and a["ar"] and a["startMs"] == 9000, "public : libellé, texte de la source (arabe + français) et minute")
ok("O vous qui croyez" in a["fr"] and "Hamidullah" in a["credit"], "public : crédit de la traduction")
ok("status" not in a and "excerpt" not in a and "origin" not in a and "match" not in a, "public : ni statut, ni extrait, ni origine, ni concordance")
u = j["references"][1]
ok(u["unidentified"] is True and u["label"] == "" and u["fr"] == "", "public : hadith sans source = « non identifié », aucun texte deviné")
ok(requests.get(f"{B}/talks/{T}").json()["references"] == {"available": True, "count": 2}, "fiche vidéo : 2 références disponibles")
cur.execute("update talk_references set status='approved' where id=%s", (h1,))
h = [x for x in requests.get(f"{B}/talks/{T}/references").json()["references"] if x["id"] == h1][0]
ok(h["label"] == "Sahih al-Boukhari, n° 1" and h["fr"] == "Les actes ne valent que par les intentions" and h["grade"] == "Sahih", "public : hadith validé, texte du corpus et degré")
cur.execute("update talk_references set status='draft' where id=%s", (h1,))
cur.execute("update talks set publication='draft' where id=%s", (T,))
ok(requests.get(f"{B}/talks/{T}/references").status_code == 404, "public : vidéo non publiée → 404")
cur.execute("update talks set publication='published' where id=%s", (T,))

# Studio : droits
ok(requests.get(f"{B}/talks/{T}/studio/references").status_code in (401, 403), "studio : connexion obligatoire")
ok(requests.get(f"{B}/talks/{T}/studio/references", headers=MEM).status_code == 403, "studio : membre simple refusé")
ok(requests.get(f"{B}/talks/{T}/studio/references", headers=ORG).status_code == 404, "studio : organisateur d'une AUTRE vidéo refusé")
for who, h_ in (("administrateur", ADM), ("modérateur", MOD)):
    ok(requests.get(f"{B}/talks/{T}/studio/references", headers=h_).status_code == 200, f"studio : {who} autorisé")
TO = talk(uorg)
d = requests.get(f"{B}/talks/{T}/studio/references", headers=ADM).json()
ok(d["approved"] == 2 and d["drafts"] == 2 and d["transcriptReady"] and d["job"] is None and len(d["references"]) == 4, "studio : compte des validées / brouillons")
x = [r_ for r_ in d["references"] if r_["id"] == h1][0]
ok(x["status"] == "draft" and x["match"] == 40 and x["found"] and x["hasText"] and x["origin"] == "ai" and x["collection"] == "bukhari", "studio : détail complet pour la relecture")

# détection
TN = talk(uorg, transcript="pending")
ok(requests.post(f"{B}/talks/{TN}/studio/references/detect", headers=ORG).status_code == 409, "détection : transcription pas prête → 409")
r = requests.post(f"{B}/talks/{TO}/studio/references/detect", headers=ORG)
ok(r.status_code == 202, "détection : demande mise en file")
cur.execute("select status, lang from reference_jobs where talk_id=%s", (TO,)); ok(cur.fetchone() == ("pending", "fr"), "détection : tâche « pending » dans la langue de la transcription")
ok(requests.post(f"{B}/talks/{TO}/studio/references/detect", headers=ORG).status_code == 409, "détection : déjà en cours → 409")
cur.execute("update reference_jobs set status='failed', error='x' where talk_id=%s", (TO,))
ok(requests.post(f"{B}/talks/{TO}/studio/references/detect", headers=ORG).status_code == 202, "détection : relance après échec")
ok(requests.post(f"{B}/talks/{TO}/studio/references/detect", headers=ORG2).status_code == 404, "détection : autre organisateur refusé")

# ajout à la main
H = ORG
r = requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "quran", "sura": 2, "ayaFrom": 153, "startMs": 12000, "excerpt": "Cherchez secours"})
ok(r.status_code == 201, "ajout verset : créé")
m = r.json()
ok(m["status"] == "draft" and m["origin"] == "manual" and m["found"] and m["ayaTo"] == 153 and m["label"] == "Coran 2:153 (Al-Baqara)", "ajout verset : brouillon, texte retrouvé dans le corpus")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "quran", "sura": 2, "ayaFrom": 153}).status_code == 409, "ajout verset : doublon refusé")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "quran"}).status_code == 400, "ajout verset : sourate et verset obligatoires")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "quran", "sura": 2, "ayaFrom": 5, "ayaTo": 3}).status_code == 400, "ajout verset : fin avant début refusée")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "quran", "sura": 2, "ayaFrom": 1, "ayaTo": 11}).status_code == 400, "ajout verset : plus de 10 versets refusé")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "quran", "sura": 115, "ayaFrom": 1}).status_code == 400, "ajout verset : sourate 115 refusée")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "hadith", "number": "12"}).status_code == 400, "ajout hadith : numéro sans recueil refusé")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "hadith", "number": "abc", "collection": "bukhari"}).status_code == 400, "ajout hadith : numéro non numérique refusé")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "hadith"}).status_code == 400, "ajout hadith : rien d'indiqué refusé")
r = requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "hadith", "collection": "bukhari", "number": "1", "startMs": 30000}); hid = r.json()["id"]
ok(r.status_code == 201 and r.json()["found"] and r.json()["fr"].startswith("Les actes") and r.json()["status"] == "draft", "ajout hadith : texte du corpus, brouillon")
r = requests.post(f"{B}/talks/{TO}/studio/references", headers=H, json={"kind": "hadith", "collection": "tirmidhi", "number": "5", "saidAs": "Tirmidhi"})
ok(r.status_code == 201 and not r.json()["found"] and r.json()["label"] == "Tirmidhi, n° 5", "ajout hadith d'un recueil sans texte : source dite seulement, aucun texte inventé")
ok(r.json()["fr"] == "" and r.json()["ar"] == "", "ajout hadith : pas de texte quand la source n'existe pas")
ok(requests.post(f"{B}/talks/{TO}/studio/references", headers=ORG2, json={"kind": "quran", "sura": 2, "ayaFrom": 154}).status_code == 404, "ajout : autre organisateur refusé")

# relecture
rid = m["id"]
ok(requests.get(f"{B}/talks/{TO}/references").status_code == 404, "avant validation : rien de public")
r = requests.patch(f"{B}/studio/references/{rid}", headers=H, json={"status": "approved"})
ok(r.status_code == 200 and r.json()["status"] == "approved" and r.json()["reviewedAt"], "validation : statut et date de relecture")
ok(len(requests.get(f"{B}/talks/{TO}/references").json()["references"]) == 1, "après validation : visible du public")
ok(requests.patch(f"{B}/studio/references/{rid}", headers=ORG2, json={"status": "rejected"}).status_code == 404, "relecture : autre organisateur refusé")
ok(requests.patch(f"{B}/studio/references/{rid}", headers=H, json={}).status_code == 400, "relecture : rien à modifier refusé")
r = requests.patch(f"{B}/studio/references/{rid}", headers=H, json={"ayaFrom": 154, "ayaTo": 154})
ok(r.status_code == 200 and r.json()["ayaFrom"] == 154 and r.json()["match"] is None and r.json()["found"] is False, "correction du verset : concordance remise à zéro, texte re-vérifié")
ok(requests.patch(f"{B}/studio/references/{rid}", headers=H, json={"ayaFrom": 153, "ayaTo": 153}).status_code == 200, "correction : retour au verset 153")
ok(requests.patch(f"{B}/studio/references/{hid}", headers=H, json={"startMs": 99000}).json()["startMs"] == 99000, "correction : minute modifiée")
ok(requests.patch(f"{B}/studio/references/{hid}", headers=H, json={"collection": "", "number": "1"}).status_code == 400, "correction : numéro sans recueil refusé")
ok(requests.patch(f"{B}/studio/references/{rid}", headers=H, json={"status": "rejected"}).json()["status"] == "rejected", "refus : statut « rejected »")
ok(requests.get(f"{B}/talks/{TO}/references").status_code == 404, "refusée : plus publique")

# file de relecture
rv = requests.get(f"{B}/studio/references/review", headers=ORG).json()["references"]
ok(len(rv) >= 2 and all(x["status"] == "draft" and x["talkTitle"] for x in rv) and all(x["talkId"] == TO for x in rv), "file de relecture : brouillons de MES vidéos seulement")
rv_all = requests.get(f"{B}/studio/references/review", headers=ADM).json()["references"]
ok(any(x["talkId"] == T for x in rv_all) and any(x["talkId"] == TO for x in rv_all), "file de relecture : l'administrateur voit tout")
ok(requests.get(f"{B}/studio/references/review", headers=MEM).status_code == 403, "file de relecture : membre refusé")

# suppression
ok(requests.delete(f"{B}/studio/references/{hid}", headers=ORG2).status_code == 404, "suppression : autre organisateur refusé")
ok(requests.delete(f"{B}/studio/references/{hid}", headers=H).status_code == 204, "suppression : 204")
cur.execute("select count(*) from talk_references where id=%s", (hid,)); ok(cur.fetchone()[0] == 0, "suppression : ligne supprimée")
# suppression de la vidéo : références et tâche supprimées avec elle
cur.execute("delete from talks where id=%s", (TO,)); cur.execute("select count(*) from talk_references where talk_id=%s", (TO,)); ok(cur.fetchone()[0] == 0, "vidéo supprimée : références supprimées")
print("Tous les contrôles sont passés.")
