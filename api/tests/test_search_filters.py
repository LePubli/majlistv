"""Phase 5 (20/11) : filtres du Catalogue et de la recherche (langue, audio, sous-titres, durée, niveau, progression, ressources),
choix proposés (/talks/filters), chiffres (/talks/facets), pagination, validation. Prérequis : API (3055), PG de test (5544).
Meilisearch n'est pas lancé en test : on teste le chemin SQL (le chemin Meilisearch applique les mêmes conditions SQL après sa recherche)."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:8]; talks, users = [], []


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
email = f"flt.{tag}@test.local"
requests.post(B + "/auth/register", json={"email": email, "password": "MotDePasse-123"})
U = {"Authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": email, "password": "MotDePasse-123"}).json()["token"]}
cur.execute("select id from users where email=%s", (email,)); uid = cur.fetchone()[0]; users.append(uid)


def mk(label, lang="fr", secs=300, level=None):
    cur.execute("""insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,level,transcript_language)
                   values(%s,'Cheikh','youtube','abc',%s,'published','ready','free',%s,%s,%s,%s) returning id""", (f"Flt{label} {tag}", aid, secs, lang, level, lang))
    t = str(cur.fetchone()[0]); talks.append(t); return t


a = mk("A", "fr", 300, "beginner")      # courte, française, débutant
b = mk("B", "en", 1200, "advanced")     # moyenne, anglaise
c = mk("C", "fr", 2400)                 # longue, française
Q = lambda **kw: {t["id"] for t in requests.get(B + "/talks", headers=U, params={"q": tag, "limit": 50, **kw}).json()}
S = lambda **kw: requests.get(B + "/search", headers=U, params={"q": tag, **kw}).json()
ok(Q() == {a, b, c}, "sans filtre : les 3 vidéos")

# langue, durée, niveau
ok(Q(lang="en") == {b} and Q(lang="fr") == {a, c}, "filtre langue")
ok(Q(duration="short") == {a} and Q(duration="medium") == {b} and Q(duration="long") == {c}, "filtre durée : < 10 min, 10-30 min, > 30 min")
ok(Q(level="advanced") == {b}, "filtre niveau (déjà là)")
ok(Q(lang="fr", duration="long") == {c}, "filtres combinés")
cur.execute("update talks set duration_seconds = 600 where id=%s", (a,))
ok(Q(duration="medium") == {a, b} and Q(duration="short") == set(), "10 min pile = moyenne")
cur.execute("update talks set duration_seconds = 300 where id=%s", (a,))

# audio : la langue d'origine, plus le français si un doublage existe
ok(Q(audio="fr") == {a, c} and Q(audio="en") == {b}, "filtre audio = langue d'origine")
cur.execute("select to_regclass('public.dub_tracks') is not null"); has_dub = cur.fetchone()[0]
if has_dub:
    cur.execute("insert into dub_tracks(talk_id, voice_key) values (%s, 'k/test.mp3')", (b,))
    ok(Q(audio="fr") == {a, b, c}, "audio français : la vidéo anglaise doublée apparaît")
    ok(Q(lang="fr") == {a, c}, "…mais sa langue d'origine reste l'anglais")
    cur.execute("delete from dub_tracks where talk_id=%s", (b,))
else:
    print("INFO module doublage absent : test du doublage ignoré")

# sous-titres : transcription d'origine ou traduction prête
ok(Q(subs="fr") == {a, c} and Q(subs="ar") == set(), "filtre sous-titres = langue de transcription")
cur.execute("insert into transcript_translations(talk_id, lang, status) values (%s,'ar','ready'), (%s,'ar','pending')", (b, a))
ok(Q(subs="ar") == {b}, "sous-titres arabes : seulement la traduction prête")
cur.execute("delete from transcript_translations where talk_id in (%s,%s)", (a, b))

# ressources : quiz validé ou livre publié lié
ok(Q(resources="any") == set(), "ressources : aucune au départ")
cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,status) values (%s,'fr','Q ?','[\"a\",\"b\",\"c\"]',0,'approved'), (%s,'fr','Q ?','[\"a\",\"b\",\"c\"]',0,'draft')", (a, c))
ok(Q(resources="quiz") == {a} and Q(resources="any") == {a}, "ressources : quiz validé seulement (le brouillon ne compte pas)")
cur.execute("select to_regclass('public.books') is not null"); has_books = cur.fetchone()[0]
if has_books:
    cur.execute("insert into books(title, published) values (%s, true) returning id", (f"Livre {tag}",)); bid = cur.fetchone()[0]
    cur.execute("insert into book_talks(book_id, talk_id) values (%s,%s)", (bid, b))
    ok(Q(resources="book") == {b} and Q(resources="any") == {a, b}, "ressources : livre publié lié")
    cur.execute("update books set published=false where id=%s", (bid,))
    ok(Q(resources="book") == set(), "livre non publié : ignoré")
    cur.execute("delete from books where id=%s", (bid,))

# progression (connecté)
cur.execute("insert into watch_progress(user_id,talk_id,position_ms,duration_ms,completed) values (%s,%s,60000,300000,false),(%s,%s,300000,300000,true)", (uid, a, uid, b))
ok(Q(progress="started") == {a} and Q(progress="done") == {b} and Q(progress="todo") == {c}, "progression : en cours / terminée / pas commencée")
anon = {t["id"] for t in requests.get(B + "/talks", params={"q": tag, "progress": "done", "limit": 50}).json()}
ok(anon == {a, b, c}, "progression sans connexion : ignorée (pas d'erreur)")

# recherche : mêmes filtres + total + pagination
r = S(lang="fr")
ok({h["id"] for h in r["hits"]} == {a, c} and r["total"] == 2, "recherche : filtre langue et total exact")
ok({h["id"] for h in S(duration="long")["hits"]} == {c} and S(duration="long")["total"] == 1, "recherche : filtre durée")
ok({h["id"] for h in S(level="beginner", progress="started")["hits"]} == {a}, "recherche : niveau + progression")
r1 = S(lang="fr", limit=1); r2 = S(lang="fr", limit=1, offset=1)
ok(r1["total"] == 2 and len(r1["hits"]) == 1 and len(r2["hits"]) == 1 and r1["hits"][0]["id"] != r2["hits"][0]["id"], "recherche : pagination avec filtres")

# chiffres (facets) et choix proposés
f = requests.get(B + "/talks/facets", headers=U, params={"q": tag, "lang": "fr"}).json()
ok(f["total"] == 2, "chiffres du Catalogue : tiennent compte des filtres")
o = requests.get(B + "/talks/filters").json()
ok({"fr", "en"} <= set(o["languages"]) and "fr" in o["audio"] and "fr" in o["subtitles"], "choix proposés : langues réellement présentes")

# validation
for bad in ({"lang": "FRANCAIS"}, {"duration": "enorme"}, {"progress": "x"}, {"resources": "zz"}, {"subs": "1"}):
    ok(requests.get(B + "/talks", params=bad).status_code == 400, f"valeur refusée {bad}")
ok(requests.get(B + "/search", params={"q": tag, "audio": "fr;drop"}).status_code == 400, "recherche : valeur dangereuse refusée")
cleanup()
print("TOUT EST OK")
