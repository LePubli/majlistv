"""35 : pages conférence référençables — transcription complète (conférence gratuite seulement), intervenant, sitemap avec miniature.
Prérequis : API de test (3055), PG de test (5544)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


cur.execute("select id from users where email = 'admin@test.local'"); aid = cur.fetchone()[0]


def talk(title, access, thumb=None):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,external_thumb) values (%s,'d',%s,'youtube',%s,%s,'published','ready',%s,1800,'fr',%s) returning id",
                (title, f"Cheikh Seo {tag}", "v" + uuid.uuid4().hex[:9], aid, access, thumb))
    return cur.fetchone()[0]


def segs(tid, lang, rows):
    for i, (st, tx) in enumerate(rows):
        cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,%s,%s,%s,%s,%s)", (tid, lang, i, st, st + 3000, tx))


free = talk(f"Gratuite {tag}", "free", "https://img.test/p.jpg")
prem = talk(f"Premium {tag}", "premium")
rows = [(0, "Bonjour à tous."), (3000, "Bienvenue dans cette conférence."), (30000, "Deuxième partie après une pause."), (33000, "Fin.")]
segs(free, "fr", rows); segs(free, "en", [(0, "Hello everyone.")]); segs(prem, "fr", rows)

j = requests.get(f"{B}/seo/talks/{free}").json()
ok(len(j["transcript"]) == 2 and j["transcript"][0]["ms"] == 0 and j["transcript"][1]["ms"] == 30000, "gratuite : transcription en 2 paragraphes horodatés")
ok("Bienvenue" in j["transcript"][0]["text"] and "Hello" not in str(j["transcript"]), "langue d'origine uniquement (pas de mélange avec la traduction)")
ok(j["speakerSlug"] and j["speakerSlug"].startswith("cheikh-seo"), "identifiant de la page de l'intervenant")
p = requests.get(f"{B}/seo/talks/{prem}").json()
ok(p["transcript"] == [] and p["excerpt"] == "" and p["chapters"] == [], "premium : aucune transcription dans le HTML public")
cur.execute("update talks set publication = 'draft' where id = %s", (free,))
ok(requests.get(f"{B}/seo/talks/{free}").status_code == 404, "brouillon : introuvable")
cur.execute("update talks set publication = 'published' where id = %s", (free,))

sm = requests.get(f"{B}/seo/sitemap").json()
e = next((t for t in sm["talks"] if t["id"] == free), None); q = next((t for t in sm["talks"] if t["id"] == prem), None)
ok(e and e["hasPoster"] is True and q and q["hasPoster"] is False, "sitemap : miniature indiquée seulement quand elle existe")
print("\nTous les contrôles de l'étape 35 sont passés")
