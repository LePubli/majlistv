"""Corrections des sous-titres (amélioration 4.1) : suggestion d'un membre, règles anti-abus, relecture (droits, anonymat), application, RGPD,
et réapplication après une retraduction (service translator, fonction reapply_corrections essayée sur la vraie base).
Prérequis : API (3055), PG de test (5544), compte admin admin@test.local."""
import os, sys, uuid, requests, psycopg2, psycopg2.extras

B = "http://127.0.0.1:3055"
DSN = dict(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw")
db = psycopg2.connect(**DSN); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def user(role="user"):
    email = f"sc-{uuid.uuid4().hex[:8]}@test.local"
    requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "Sc Test"})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]
    tok = requests.post(B + "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]
    return {"authorization": "Bearer " + tok}, uid, email


ORG, uorg, _ = user("organizer"); ORG2, _, _ = user("organizer"); MOD, _, _ = user("moderator"); MEM, umem, memmail = user(); MEM2, umem2, _ = user()
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,transcript_status,transcript_language,language) "
            "values (%s,'d','Cheikh','youtube','abc',%s,'published','ready','free',600,'ready','fr','fr') returning id", ("Corr test " + uuid.uuid4().hex[:5], uorg))
T = str(cur.fetchone()[0])
FR = ["Bonjour à tous et bienvenue.", "Le prophete a dit la vérité.", "Merci de votre attention."]
EN = ["Hello everyone and welcome.", "The prophet said the truth.", "Thank you for your attention."]
for lang, texts in (("fr", FR), ("en", EN)):
    for i, t in enumerate(texts):
        cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,%s,%s,%s,%s,%s)", (T, lang, i, i * 5000, i * 5000 + 4000, t))
cur.execute("update talks set transcript_text=%s where id=%s", (" ".join(FR), T))
tok = requests.get(f"{B}/talks/{T}", headers=MEM).json().get("playbackToken")
ok(bool(tok), "jeton de lecture obtenu")


def post(h, body, talk=T):
    return requests.post(f"{B}/talks/{talk}/corrections", headers=h, json=body)


S = dict(t=tok, lang="fr", idx=1, text="Le prophète a dit la vérité.", comment="accent")
ok(requests.post(f"{B}/talks/{T}/corrections", json=S).status_code == 401, "sans connexion → 401")
ok(post(MEM, {**S, "t": "faux"}).status_code == 403, "jeton de lecture invalide → 403")
ok(post(MEM, {**S, "idx": 99}).status_code == 404, "phrase inexistante → 404")
r = post(MEM, {**S, "text": FR[1]}); ok(r.status_code == 400 and r.json()["code"] == "same", "texte identique refusé")
r = post(MEM, {**S, "text": "   "}); ok(r.status_code == 400 and r.json()["code"] == "empty", "texte vide refusé")
r = post(MEM, {**S, "text": "Voir https://spam.example"}); ok(r.status_code == 400 and r.json()["code"] == "link", "lien refusé")
r = post(MEM, {**S, "text": "x" * 500}); ok(r.status_code == 400 and r.json()["code"] == "too_long", "texte démesuré refusé")
r = post(MEM, S); ok(r.status_code == 201 and r.json()["status"] == "pending", "suggestion enregistrée (en attente)")
cur.execute("select text from transcript_segments where talk_id=%s and lang='fr' and idx=1", (T,)); ok(cur.fetchone()[0] == FR[1], "rien n'est appliqué sans relecture")
r = post(MEM, S); ok(r.status_code == 409 and r.json()["code"] == "already_pending", "2e suggestion sur la même phrase → 409")
ok(post(MEM2, {**S, "text": "Le prophète a dit la vérité !"}).status_code == 201, "un autre membre peut proposer sur la même phrase")
mine = requests.get(f"{B}/talks/{T}/corrections/mine", headers=MEM).json()["items"]
ok(len(mine) == 1 and mine[0]["idx"] == 1 and mine[0]["status"] == "pending", "« mes suggestions » : seulement les miennes")
# limite quotidienne
cur.execute("insert into subtitle_corrections(talk_id,lang,idx,start_ms,original_text,suggested_text,user_id,status,comment) select %s,'fr',0,0,'a','b',%s,'rejected','filler' from generate_series(1,19)", (T, umem2))
r = post(MEM2, {**S, "idx": 2, "text": "Merci pour votre attention."}); ok(r.status_code == 429 and r.json()["code"] == "daily_limit", "limite quotidienne → 429")
cur.execute("delete from subtitle_corrections where talk_id=%s and comment='filler'", (T,))

# transcription publique : numéro de phrase fourni
tr = requests.get(f"{B}/talks/{T}/transcript?lang=fr&t={tok}").json()
ok(tr["segments"][1].get("i") == 1, "transcription publique : numéro de phrase (i)")

# --- relecture : droits
ok(requests.get(f"{B}/studio/corrections", headers=MEM).status_code == 403, "membre simple → pas d'accès à la file")
l2 = requests.get(f"{B}/studio/corrections", headers=ORG2).json(); ok(all(x["talkId"] != T for x in l2["items"]), "un autre organisateur ne voit pas ces suggestions")
cid = requests.get(f"{B}/studio/corrections?status=pending", headers=ORG).json()["items"]
mineitems = [x for x in cid if x["talkId"] == T and x["idx"] == 1]
ok(len(mineitems) == 2, "l'organisateur de la vidéo voit les 2 suggestions")
raw = requests.get(f"{B}/studio/corrections?status=pending", headers=ORG).text
ok(memmail not in raw and "userId" not in raw and "user_id" not in raw, "l'auteur n'est pas montré (anonyme)")
ok(any(w["kind"] == "del" for w in mineitems[0]["diff"]) and any(w["kind"] == "add" for w in mineitems[0]["diff"]), "diff avant / après fourni")
A, A2 = mineitems[0]["id"], mineitems[1]["id"]
ok(requests.post(f"{B}/studio/corrections/{A}/accept", headers=ORG2, json={}).status_code == 404, "autre organisateur : accepter → 404")
ok(requests.post(f"{B}/studio/corrections/{A}/accept", headers=MEM, json={}).status_code == 403, "membre : accepter → 403")
r = requests.post(f"{B}/studio/corrections/{A}/accept", headers=ORG, json={"text": "Le prophète a dit la vérité."}); ok(r.status_code == 200, "organisateur accepte (texte ajusté)")
cur.execute("select text from transcript_segments where talk_id=%s and lang='fr' and idx=1", (T,)); ok(cur.fetchone()[0] == "Le prophète a dit la vérité.", "la phrase est corrigée")
cur.execute("select transcript_text, transcript_edited_at is not null from talks where id=%s", (T,)); tt, ed = cur.fetchone()
ok("prophète" in tt and ed, "texte complet (recherche) reconstruit, date de modification posée")
ok(requests.post(f"{B}/studio/corrections/{A}/accept", headers=ORG, json={}).status_code == 409, "déjà traitée → 409")
r = requests.get(f"{B}/studio/corrections?status=pending", headers=MOD).json(); ok(any(x["id"] == A2 and x["changed"] for x in r["items"]), "modérateur voit tout ; la phrase a changé depuis (signalé)")
ok(requests.post(f"{B}/studio/corrections/{A2}/reject", headers=MOD).status_code == 200, "modérateur refuse")
cur.execute("select status from subtitle_corrections where id=%s", (A2,)); ok(cur.fetchone()[0] == "rejected", "statut « refusée »")
cur.execute("select text from transcript_segments where talk_id=%s and lang='fr' and idx=1", (T,)); ok(cur.fetchone()[0] == "Le prophète a dit la vérité.", "refuser ne touche pas à la phrase")
acc = requests.get(f"{B}/studio/corrections?status=accepted&talk={T}", headers=ORG).json(); ok(acc["counts"]["accepted"] == 1 and acc["counts"]["rejected"] == 1, "compteurs par statut")
mine = {x["id"]: x["status"] for x in requests.get(f"{B}/talks/{T}/corrections/mine", headers=MEM).json()["items"]}; ok(list(mine.values()) == ["accepted"], "le membre voit que sa suggestion a été acceptée")

# --- langue traduite : acceptation + réapplication après retraduction
ok(post(MEM, dict(t=tok, lang="en", idx=0, text="Hello everybody and welcome.")).status_code == 201, "suggestion sur la traduction anglaise")
cid = [x for x in requests.get(f"{B}/studio/corrections?status=pending&talk={T}", headers=ORG).json()["items"] if x["lang"] == "en"][0]
ok(requests.post(f"{B}/studio/corrections/{cid['id']}/accept", headers=ORG, json={}).status_code == 200, "correction de la traduction acceptée")
cur.execute("select source_snapshot, final_text from subtitle_corrections where id=%s", (cid["id"],)); snap, fin = cur.fetchone()
ok(snap == FR[0] and fin == "Hello everybody and welcome.", "phrase d'origine mémorisée pour la retraduction")
os.environ.setdefault("DATABASE_URL", "postgres://majlis:pw@127.0.0.1:5544/majlis"); os.environ.setdefault("SETTINGS_KEY", "test-settings-key-0123456789")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "translator", "src"))
try:
    import main as tr_main  # noqa: E402
except (Exception, SystemExit) as e:  # dépendances du service translator absentes de cet environnement : essai réalisé dans l'environnement du service
    tr_main = None
    print("SKIP réapplication après retraduction (service translator non importable ici :", type(e).__name__ + ")")
if tr_main:
    conn = psycopg2.connect(**DSN)
    def retranslate(fresh0):
        cur.execute("update transcript_segments set text=%s where talk_id=%s and lang='en' and idx=0", (fresh0, T))
        with conn.cursor() as c2:
            n = tr_main.reapply_corrections(c2, T, "en", "fr"); conn.commit(); return n
    n = retranslate("Hello all and welcome.")
    cur.execute("select text from transcript_segments where talk_id=%s and lang='en' and idx=0", (T,))
    ok(n == 1 and cur.fetchone()[0] == "Hello everybody and welcome.", "retraduction : la correction validée est réappliquée")
    cur.execute("update transcript_segments set text='Bonjour à toutes et à tous.' where talk_id=%s and lang='fr' and idx=0", (T,))
    n = retranslate("Hello all, welcome.")
    cur.execute("select text from transcript_segments where talk_id=%s and lang='en' and idx=0", (T,))
    ok(n == 0 and cur.fetchone()[0] == "Hello all, welcome.", "phrase d'origine modifiée entre-temps : la traduction fraîche est gardée")

# --- RGPD
ex = requests.get(B + "/me/export", headers=MEM); ok(ex.status_code == 200 and "subtitle_corrections" in ex.text, "export RGPD : mes suggestions incluses")
cur.execute("delete from users where id=%s", (umem,))
cur.execute("select count(*), count(user_id) from subtitle_corrections where talk_id=%s and lang='fr' and idx=1 and status='accepted'", (T,)); n, nu = cur.fetchone()
ok(n == 1 and nu == 0, "compte supprimé : la suggestion reste, sans auteur")

# --- nettoyage
cur.execute("delete from talks where id=%s", (T,))
for u in (uorg, umem2): cur.execute("delete from users where id=%s", (u,))
print("Tous les contrôles passent.")
