"""Étape E5c — « Préciser la place des mots » côté service de transcription :
  - calcul d'alignement (fonctions pures) : mots retrouvés (sans accents ni ponctuation, arabe sans voyelles), mots non entendus répartis entre
    leurs voisins, phrase non retrouvée laissée telle quelle, ordre croissant ;
  - tâche complète avec un faux Whisper et la vraie base de test : le TEXTE ne change pas, les mots prennent le moment entendu,
    une phrase non retrouvée garde sa place d'avant, la demande passe à « done » avec ses chiffres, échec propre (vidéo externe).
Prérequis : PostgreSQL de test (5544) avec les migrations de l'API (058), ffmpeg.
Lancement depuis la racine du dépôt : python3 transcriber/tests/test_align.py"""
import os, shutil, subprocess, sys, types, uuid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:1", "S3_REGION": "us-east-1", "S3_ACCESS_KEY": "x",
                   "S3_SECRET_KEY": "x", "WORK_DIR": "/tmp/claude-0/work", "SETTINGS_KEY": "a" * 64, "MODELS_DIR": "/tmp/claude-0/models", "YTDLP_AUTO_UPDATE": "0"})
os.makedirs("/tmp/claude-0/work", exist_ok=True)
W = lambda s, e, w: types.SimpleNamespace(start=s, end=e, word=w)
calls = []

class FakeModel:
    def __init__(self, *a, **k): pass
    def transcribe(self, wav, language=None, **k):
        calls.append((language, k))
        segs = [types.SimpleNamespace(start=0.0, end=1.5, text="x", words=[W(0.10, 0.40, " Bonjour"), W(0.50, 0.60, " a"), W(0.65, 1.40, " tous.")]),
                types.SimpleNamespace(start=1.5, end=3.0, text="x", words=[W(1.60, 1.90, " la"), W(1.95, 2.90, " patience.")])]
        return iter(segs), types.SimpleNamespace(language=language or "fr")
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeModel)
sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=None))
sys.modules.setdefault("yt_dlp.version", types.SimpleNamespace(__version__="fake"))
import align  # noqa: E402
import main  # noqa: E402

fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

# --- Fonctions pures
ok(align.norm("Éhé !") == "ehe" and align.norm("الصَّبْرُ") == align.norm("الصبر") and align.norm("…") == "", "norm : accents, majuscules, ponctuation, voyelles arabes")
heard = [(100, 400, "Bonjour"), (500, 600, "à"), (650, 900, "tous"), (1500, 1800, "la"), (1850, 2300, "patience"), (2350, 2400, "est"), (2450, 2500, "une"), (2550, 3000, "lumière")]
r = align.align_segment(0, 3200, "Bonjour à tous, euh la patience est une lumière.".split(), heard)
ok(r and [x[2] for x in r][2] == "tous," and r[0][:2] == (100, 400) and r[5][:2] == (1850, 2300), "mots retrouvés : moment de Whisper, mot du texte gardé (ponctuation comprise)")
ok(r[3][2] == "euh" and 900 <= r[3][0] and r[3][1] <= 1500 and r[3][0] < r[3][1], f"mot non entendu (« euh ») : placé entre ses voisins ({r[3][:2]})")
ok(all(r[i][0] <= r[i + 1][0] and r[i][0] <= r[i][1] for i in range(len(r) - 1)), "ordre croissant, fin ≥ début")
ok(align.align_segment(0, 3200, ["zzz", "yyy"], heard) is None and align.align_segment(0, 100, ["a"], []) is None, "phrase non retrouvée ou rien entendu : None")
ok(align.align_segment(0, 3200, "un deux trois quatre".split(), heard) is None, "moins de la moitié retrouvée : None")
done, total = align.align_all([(0, 0, 1500, "Bonjour à tous."), (1, 1500, 3000, "zzz yyy"), (2, 1500, 3000, "la patience")], heard)
ok(sorted(done) == [0, 2] and total == 3, "align_all : phrases 0 et 2 précisées, la 1 laissée")

# --- Tâche complète
cur = main.db().cursor()
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None
oid = one("select id from users where email='admin@test.local'")
src = "/tmp/claude-0/work/e5c-src.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=3", "-c:a", "aac", src], check=True)
main.s3.download_file = lambda bucket, key, dest: shutil.copy(src, dest)
tag = uuid.uuid4().hex[:6]; talks = []
def talk(source="upload"):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
                   values (%s,'d','X',%s,'talks/x.mp4',%s,'draft','ready','free',3,'fr','fr','ready') returning id""", (f"E5c {tag}", source, oid))
    t = str(cur.fetchone()[0]); talks.append(t); return t
def job(t, lang="fr"):
    cur.execute("insert into word_align_jobs(talk_id, lang, status) values (%s,%s,'processing')", (t, lang))
try:
    cur.connection.autocommit = True
    T = talk()
    segs = [(0, 0, 1500, "Bonjour à tous."), (1, 1500, 3000, "La patience."), (2, 3000, 4000, "Phrase corrigée à la main.")]
    for i, s, e, tx in segs: cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',%s,%s,%s,%s)", (T, i, s, e, tx))
    cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'en',0,0,1500,'Hello everyone.')", (T,))
    for k, w in enumerate("Phrase corrigée à la main.".split()):   # mots d'avant pour la phrase 2 (doivent rester)
        cur.execute("insert into transcript_words(talk_id, lang, seg_idx, idx, start_ms, end_ms, word) values (%s,'fr',2,%s,%s,%s,%s)", (T, k, 3000 + k * 200, 3000 + k * 200 + 150, w))
    text_before = one("select string_agg(text, '|' order by idx) from transcript_segments where talk_id=%s and lang='fr'", T)
    job(T)
    main.process_align({"talk_id": T, "lang": "fr"})
    ok(calls[-1][0] == "fr" and calls[-1][1].get("word_timestamps") is True, "Whisper écoute dans la langue parlée, mots horodatés demandés")
    cur.execute("select seg_idx, idx, start_ms, end_ms, word from transcript_words where talk_id=%s and lang='fr' order by seg_idx, idx", (T,)); ws = cur.fetchall()
    s0 = [w for w in ws if w[0] == 0]; s1 = [w for w in ws if w[0] == 1]; s2 = [w for w in ws if w[0] == 2]
    ok([w[4] for w in s0] == ["Bonjour", "à", "tous."] and (s0[0][2], s0[0][3]) == (100, 400) and (s0[2][2], s0[2][3]) == (650, 1400), f"phrase 0 : mots du texte, moments entendus ({[w[2:4] for w in s0]})")
    ok([w[4] for w in s1] == ["La", "patience."] and s1[0][2] == 1600 and s1[1][3] == 2900, "phrase 1 : « La » retrouvée malgré la majuscule")
    ok(len(s2) == 5 and s2[0][2] == 3000 and s2[4][4] == "main.", "phrase 2 (non retrouvée) : ses mots d'avant sont conservés")
    ok(one("select string_agg(text, '|' order by idx) from transcript_segments where talk_id=%s and lang='fr'", T) == text_before, "le texte n'a pas changé")
    ok(one("select count(*) from transcript_segments where talk_id=%s and lang='en'", T) == 1 and one("select count(*) from transcript_words where talk_id=%s and lang='en'", T) == 0, "la traduction n'a pas été touchée")
    cur.execute("select status, progress, aligned, total, error from word_align_jobs where talk_id=%s", (T,)); st = cur.fetchone()
    ok(st == ("done", 100, 2, 3, None), f"demande terminée : {st}")
    ok(not os.path.exists("/tmp/claude-0/work/align-" + T), "dossier de travail nettoyé")
    # vidéo externe : échec propre, rien n'est effacé
    T2 = talk("youtube"); cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',0,0,1500,'Bonjour.')", (T2,)); job(T2)
    main.process_align({"talk_id": T2, "lang": "fr"})
    cur.execute("select status, error from word_align_jobs where talk_id=%s", (T2,)); st = cur.fetchone()
    ok(st[0] == "failed" and "envoyées sur le site" in st[1], f"vidéo externe : échec clair ({st[1]})")
    # file : claim_align
    T3 = talk(); cur.execute("insert into word_align_jobs(talk_id, lang, status) values (%s,'fr','pending')", (T3,))
    c = main.claim_align()
    ok(c and str(c["talk_id"]) == T3 and one("select status from word_align_jobs where talk_id=%s", T3) == "processing" and main.claim_align() is None, "claim_align : prend la demande en attente, une seule fois")
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
