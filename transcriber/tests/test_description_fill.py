"""Description des conférences reprise de la vidéo d'origine (description_fill.py, migration 115) — sans accès aux plateformes.
Prérequis : Postgres :5544 avec les migrations de l'API. Lancer : python3 transcriber/tests/test_description_fill.py"""
import os, sys, types, uuid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
import psycopg2, psycopg2.extras  # noqa: E402
import description_fill  # noqa: E402

def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True
def q(sql, params=None, fetch=False):
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall() if fetch else cur.rowcount
tag = uuid.uuid4().hex[:6]
q("UPDATE talks SET meta_tries = 3 WHERE description = ''")  # seules nos conférences de test sont candidates
org = q("SELECT id FROM users WHERE email = 'admin@test.local'", fetch=True)[0]["id"]
def talk(source, ref, desc="", lang="fr"):
    return q("""INSERT INTO talks(organizer_id, title, source, video_ref, description, language, video_status) VALUES (%s, %s, %s, %s, %s, %s, 'ready') RETURNING id""",
             (org, f"Test {tag} {ref}", source, ref, desc, lang), fetch=True)[0]["id"]
yt = talk("youtube", "abc" + tag)
up = talk("upload", "up1" + tag)
plain = talk("upload", "up2" + tag)  # envoi direct sans adresse d'origine : jamais candidat
filled = talk("youtube", "fil" + tag, desc="Déjà là")
q("""INSERT INTO media_imports(talk_id, source_url, origin, status, object_key, rights_confirmed_at, rights_text, requested_by_name)
     VALUES (%s, %s, 'web', 'done', %s, now(), 'test', 'test')""", (up, f"https://exemple.org/v-{tag}.mp4", f"imports/{tag}.mp4"))
seen = []
def fake(url, opts):
    seen.append((url, opts.get("extractor_args")))
    if "boom" in url: raise RuntimeError("bloqué")
    return {"description": "  Description de la vidéo\n\nhttps://lien  "} if "abc" in url or "exemple.org" in url else {"description": ""}
log = []
n = description_fill.run_once(q, {"quiet": True}, log.append, fetch=fake, limit=10)
ok(n == 2, f"2 conférences candidates (YouTube sans description, importée avec adresse d'origine) : {n}")
ok({u for u, _ in seen} == {f"https://www.youtube.com/watch?v=abc{tag}", f"https://exemple.org/v-{tag}.mp4"}, f"adresses lues : {seen}")
ok(any(a and a.get("youtube", {}).get("lang") == ["fr"] for _, a in seen), "description demandée dans la langue de la conférence")
desc = {r["id"]: r["description"] for r in q("SELECT id, description FROM talks WHERE id = ANY(%s::uuid[])", ([str(yt), str(up), str(plain), str(filled)],), fetch=True)}
ok(desc[yt].startswith("Description de la vidéo") and desc[up].startswith("Description de la vidéo"), "descriptions remplies")
ok(desc[plain] == "" and desc[filled] == "Déjà là", "envoi direct ignoré ; description existante jamais écrasée")
ok(description_fill.run_once(q, {}, log.append, fetch=fake) == 0, "rien de plus à faire")
# Échec de lecture : essai compté, repris 6 heures plus tard, 3 essais au plus
bad = talk("vimeo", "boom" + tag)
for i in range(3):
    q("UPDATE talks SET meta_checked_at = now() - interval '7 hours' WHERE id = %s AND meta_checked_at IS NOT NULL", (bad,))
    ok(description_fill.run_once(q, {}, log.append, fetch=fake) == 1, f"essai {i + 1} après un échec")
    ok(description_fill.run_once(q, {}, log.append, fetch=fake) == 0, "pas de nouvel essai avant 6 heures")
q("UPDATE talks SET meta_checked_at = now() - interval '7 hours' WHERE id = %s", (bad,))
ok(description_fill.run_once(q, {}, log.append, fetch=fake) == 0, "abandon après 3 essais")
ok(any("lecture impossible" in l for l in log), "échec noté dans le journal")
q("DELETE FROM media_imports WHERE talk_id = %s", (up,)); q("DELETE FROM talks WHERE title LIKE %s", (f"Test {tag}%",))
print("TOUT EST OK")
