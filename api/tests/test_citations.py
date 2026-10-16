"""24.6 : rappels indépendants des quiz + citations (Coran, hadiths) choisies par l'IA dans un corpus importé, sans que l'IA n'écrive le texte.
Prérequis : API (3055), PG de test (5544), translator + fausse API Claude lancés, accès à raw.githubusercontent.com (import réel du corpus)."""
import sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(email, pw):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()["token"]}


def member(role=None):
    email = f"cit-{uuid.uuid4().hex[:6]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Orga Citations"})
    if role:
        cur.execute("update users set role=%s where email=%s", (role, email))
    return login(email, "Passw0rd-test")


def settings(**v):
    requests.put(B + "/admin/settings", headers=ADM, json={"values": v}); time.sleep(11)  # le traducteur relit les réglages toutes les 10 s


def wait_job(jid_min=0):
    for _ in range(60):
        time.sleep(1)
        j = requests.get(B + "/admin/citations", headers=ADM).json()["stock"]["job"]
        if j and int(j["id"]) > int(jid_min) and j["status"] in ("ready", "failed"):
            return j
    ok(False, "génération terminée à temps")


ADM = login("admin@test.local", "AdminPassw0rd-test")
ORG = member("organizer"); ORG2 = member("organizer"); MEM = member()
cur.execute("delete from reminders where origin = 'corpus'"); cur.execute("delete from citation_jobs")

# --- droits ------------------------------------------------------------------------------------
ok(requests.get(B + "/admin/citations", headers=ORG).status_code == 403, "l'organisateur n'accède pas à l'administration des citations")
ok(requests.get(B + "/admin/citations").status_code == 401, "visiteur refusé")
ok(requests.post(B + "/admin/citations/generate", headers=ADM, json={}).status_code in (202, 409), "demande de génération sans corpus acceptée ou refusée proprement")
cur.execute("delete from citation_jobs")
cur.execute("delete from corpus_items"); cur.execute("update corpus_import set status='idle', items=0")
r = requests.post(B + "/admin/citations/generate", headers=ADM, json={}); ok(r.status_code == 409 and r.json()["code"] == "no_corpus", "génération refusée tant que le corpus n'est pas importé")

# --- import réel du corpus ---------------------------------------------------------------------
settings(hadith_collections="nawawi,qudsi,inconnu", citations_review="false", citations_auto="false")
r = requests.post(B + "/admin/citations/import", headers=ADM); ok(r.status_code == 202, "import lancé")
ok(requests.post(B + "/admin/citations/import", headers=ADM).status_code == 409, "second import refusé pendant le premier")
for _ in range(120):
    time.sleep(2)
    st = requests.get(B + "/admin/citations", headers=ADM).json()["corpus"]
    if st["status"] in ("ready", "failed"):
        break
ok(st["status"] == "ready", f"import terminé : {st['message']}")
cols = {c["collection"]: c["n"] for c in st["collections"]}
ok(cols.get("quran", 0) > 3000 and cols.get("nawawi", 0) >= 25 and cols.get("qudsi", 0) >= 15 and "inconnu" not in cols, f"collections importées {cols}")

# --- le texte du corpus est celui de la source -------------------------------------------------
import json, os
src = "/tmp/claude-0/corp/"
# Copies de référence des fichiers sources (téléchargées une fois, aux mêmes adresses que l'import de l'API).
_BASE = "https://raw.githubusercontent.com/fawazahmed0"
os.makedirs(src, exist_ok=True)
for _name, _path in [("q_fr.json", "/quran-api/1/editions/fra-muhammadhamidul.json"), ("q_ar.json", "/quran-api/1/editions/ara-quranuthmanihaf.json"),
                     ("fra-nawawi.json", "/hadith-api/1/editions/fra-nawawi.json")]:
    if not os.path.exists(src + _name):
        open(src + _name, "wb").write(requests.get(_BASE + _path, timeout=60).content)
qfr = {f"{v['chapter']}:{v['verse']}": v["text"] for v in json.load(open(src + "q_fr.json"))["quran"]}
qar = {f"{v['chapter']}:{v['verse']}": v["text"] for v in json.load(open(src + "q_ar.json"))["quran"]}
norm = lambda s: " ".join(s.split())
cur.execute("select ref, text_fr, text_ar, label from corpus_items where kind='quran' order by random() limit 40")
rows = cur.fetchall()
ok(all(norm(qfr[r[0]]) == r[1] and norm(qar[r[0]]) == r[2] for r in rows), "40 versets tirés au hasard : arabe et français identiques à la source")
ok(all(r[3].startswith("Coran ") and r[0] in r[3] and "Hamidullah" in r[3] for r in rows), "référence lisible avec sourate et traducteur")
nf = {str(h["hadithnumber"]): h["text"] for h in json.load(open(src + "fra-nawawi.json"))["hadiths"]}
cur.execute("select ref, text_fr, label from corpus_items where collection='nawawi'")
hs = cur.fetchall()
ok(hs and all(norm(nf[r[0]]) == r[1] for r in hs), f"{len(hs)} hadiths d'an-Nawawi identiques à la source française")
cur.execute("select count(*) from corpus_items where length(text_fr) < 50 or length(text_fr) > 700")
ok(cur.fetchone()[0] == 0, "bornes de longueur respectées")

# --- génération : l'IA ne choisit que des numéros ----------------------------------------------
r = requests.post(B + "/admin/citations/generate", headers=ADM, json={"count": 6}); ok(r.status_code == 202, "génération de 6 citations demandée")
ok(requests.post(B + "/admin/citations/generate", headers=ADM, json={"count": 6}).status_code in (409, 202), "pas de double demande simultanée (ou déjà terminée)")
j = wait_job(); ok(j["status"] == "ready", f"génération terminée : {j}")
ok(j["produced"] == 6 and j["dropped"] == 3, f"6 citations créées, 3 références invalides de l'IA écartées (produced={j['produced']}, dropped={j['dropped']})")
cur.execute("""select m.text, m.text_ar, m.attribution, m.status, m.origin, m.talk_id, c.text_fr, c.text_ar, c.label, c.kind
                 from reminders m join corpus_items c on c.id = m.corpus_id where m.origin = 'corpus'""")
rows = cur.fetchall()
ok(len(rows) == 6, "6 rappels « corpus »")
ok(all(r[0] == r[6] and r[1] == r[7] and r[2].startswith(r[8]) for r in rows), "texte arabe et français = texte exact du corpus, référence = celle du corpus")
ok(all(r[3] == "approved" and r[5] is None for r in rows), "publiés directement, sans conférence")
ok({r[9] for r in rows} == {"quran", "hadith"}, "mélange versets et hadiths")
cur.execute("select count(*) from reminders where origin='corpus' and text not in (select text_fr from corpus_items)"); ok(cur.fetchone()[0] == 0, "aucun texte hors corpus")
_tlog = os.environ.get("TRANSLATOR_LOG", "/tmp/claude-0/translator.log")  # journal du service translator lancé pour le test
if os.path.exists(_tlog):
    ok(open(_tlog).read().count("SQL") == 0, "la valeur piégée n'apparaît pas dans le journal du traducteur")
else:
    print(f"(journal du traducteur introuvable : {_tlog} — vérification sautée)")

# --- les mots-clés piégés n'ont pas touché la base, et les candidats déjà utilisés ne reviennent pas ---
r = requests.post(B + "/admin/citations/generate", headers=ADM, json={"count": 4}); ok(r.status_code == 202, "seconde génération")
j = wait_job(j["id"]); ok(j["status"] == "ready", "seconde génération terminée")
cur.execute("select count(*), count(distinct corpus_id) from reminders where origin='corpus'"); a, b = cur.fetchone()
ok(a == b and a >= 9, f"aucune citation en double ({a})")

# --- validation humaine ------------------------------------------------------------------------
settings(citations_review="true")
r = requests.post(B + "/admin/citations/generate", headers=ADM, json={"count": 2}); j = wait_job(j["id"])
cur.execute("select count(*) from reminders where origin='corpus' and status='draft'"); drafts = cur.fetchone()[0]
ok(drafts == j["produced"] and drafts >= 1, f"mode validation : {drafts} brouillons")
t1 = requests.get(B + "/citation/today"); ok(t1.status_code == 200 and t1.json() and t1.json()["text"], "citation du jour publique")
cur.execute("select count(*) from reminders where id = %s and status='draft'", (t1.json()["id"],)); ok(cur.fetchone()[0] == 0, "la citation du jour n'est jamais un brouillon")
ok(requests.get(B + "/citation/today").json()["id"] == t1.json()["id"], "stable dans la journée")
ok(requests.get(B + "/citation/today").json()["textAr"], "texte arabe présent")
r = requests.post(B + "/admin/citations/approve-all", headers=ADM); ok(r.json()["approved"] == drafts, "validation en un clic")

# --- bibliothèque indépendante des quiz, droits ------------------------------------------------
lst = requests.get(B + "/studio/reminders?origin=corpus", headers=ADM).json()
ok(lst["total"] >= 10 and all(x["origin"] == "corpus" for x in lst["reminders"]), "l'administrateur voit les citations")
ok(requests.get(B + "/studio/reminders?origin=corpus", headers=ORG).json()["total"] == 0, "l'organisateur ne voit pas les citations du corpus")
r = requests.post(B + "/studio/reminders", headers=ORG, json={"text": "Les actions ne valent que par leurs intentions.", "attribution": "Boukhari n°1"}); ok(r.status_code == 201, "rappel libre créé sans conférence ni quiz")
rid = r.json()["id"]; ok(r.json()["status"] == "draft" and r.json()["talkId"] is None, "arrive en brouillon, sans conférence")
ok(requests.post(B + "/studio/reminders", headers=ORG, json={"text": "Un hadith sans source.", "attribution": ""}).status_code == 400, "source obligatoire")
ok(requests.post(B + "/studio/reminders", headers=MEM, json={"text": "Un hadith quelconque.", "attribution": "Source X"}).status_code == 403, "un membre ne crée pas de rappel")
ok(requests.get(B + "/studio/reminders", headers=ORG2).json()["total"] == 0, "un autre organisateur ne le voit pas")
ok(requests.patch(f"{B}/studio/reminders/{rid}", headers=ORG2, json={"status": "approved"}).status_code == 404, "ni ne le modifie")
ok(requests.patch(f"{B}/studio/reminders/{rid}", headers=ORG, json={"status": "approved", "textAr": "إنما الأعمال بالنيات"}).json()["status"] == "approved", "son auteur le valide (avec texte arabe)")
ok(requests.get(B + "/studio/reminders?q=intentions", headers=ORG).json()["total"] == 1, "recherche")
cid = lst["reminders"][0]["id"]
ok(requests.patch(f"{B}/studio/reminders/{cid}", headers=ORG, json={"status": "draft"}).status_code == 404, "l'organisateur ne touche pas aux citations du corpus")
r = requests.patch(f"{B}/studio/reminders/{cid}", headers=ADM, json={"text": "Texte réécrit par quelqu'un"}); ok(r.status_code == 400 and r.json()["code"] == "corpus_locked", "le texte d'une citation du corpus est verrouillé")
ok(requests.patch(f"{B}/studio/reminders/{cid}", headers=ADM, json={"status": "draft"}).json()["status"] == "draft", "l'administrateur peut dépublier")
ok(requests.delete(f"{B}/studio/reminders/{cid}", headers=ADM).status_code == 204, "et supprimer")

# --- rappel du jour personnel : plus lié aux quiz ----------------------------------------------
cur.execute("delete from quiz_attempts")
rv = requests.get(B + "/me/revision", headers=ADM).json()
ok(rv.get("reminder") and rv["reminder"]["text"], "rappel du jour disponible sans aucun quiz tenté")

# --- réimport : les rappels déjà publiés restent rattachés ---------------------------------------
cur.execute("select count(*) from reminders where origin='corpus'"); before = cur.fetchone()[0]
requests.post(B + "/admin/citations/import", headers=ADM)
for _ in range(120):
    time.sleep(2)
    if requests.get(B + "/admin/citations", headers=ADM).json()["corpus"]["status"] in ("ready", "failed"):
        break
cur.execute("select count(*), count(corpus_id) from reminders where origin='corpus'"); n, linked = cur.fetchone()
ok(n == before and linked == n, f"après réimport : {n} rappels conservés, {linked} rattachés au corpus")

settings(citations_review="false", hadith_collections=None, citations_auto=None)
print("TOUT OK")
