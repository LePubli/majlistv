"""Étape E5a — mots horodatés (montage par le texte), avec un faux Whisper et la vraie base de test :
  - réglage « Horodater chaque mot » activé : Whisper reçoit word_timestamps=True, les mots vont dans transcript_words ;
  - réglage désactivé : rien n'est demandé à Whisper, les anciens mots sont effacés ;
  - sous-titres de l'auteur (sans mots) : les anciens mots sont effacés aussi.
Prérequis : PostgreSQL de test (5544) avec les migrations de l'API (lancer l'API une fois), ffmpeg.
Lancement depuis la racine du dépôt : python3 transcriber/tests/test_words.py"""
import os, subprocess, sys, types, uuid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:1", "S3_REGION": "us-east-1", "S3_ACCESS_KEY": "x",
                   "S3_SECRET_KEY": "x", "WORK_DIR": "/tmp/claude-0/work", "SETTINGS_KEY": "a" * 64, "MODELS_DIR": "/tmp/claude-0/models", "YTDLP_AUTO_UPDATE": "0"})
os.makedirs("/tmp/claude-0/work", exist_ok=True)
calls = []
W = lambda s, e, w: types.SimpleNamespace(start=s, end=e, word=w)

class FakeModel:
    def __init__(self, *a, **k): pass
    def transcribe(self, wav, language=None, **k):
        calls.append(k)
        words = k.get("word_timestamps")
        segs = [types.SimpleNamespace(start=0.0, end=1.5, text=" Bonjour à tous.", words=[W(0.0, 0.4, " Bonjour"), W(0.5, 0.7, " à"), W(0.8, 1.4, " tous.")] if words else None),
                types.SimpleNamespace(start=1.5, end=3.0, text=" Euh… la patience.", words=[W(1.6, 1.9, " Euh…"), W(2.1, 2.3, " la"), W(2.4, 2.9, " patience.")] if words else None)]
        return iter(segs), types.SimpleNamespace(language=language or "fr")
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeModel)
sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=None))
sys.modules.setdefault("yt_dlp.version", types.SimpleNamespace(__version__="fake"))
import main  # noqa: E402

fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
cur = main.db().cursor()
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None
def setting(v):
    if v is None: cur.execute("DELETE FROM app_settings WHERE key = 'whisper_word_timestamps'")
    else: cur.execute("INSERT INTO app_settings(key, value) VALUES ('whisper_word_timestamps', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (v,))
    main.settings.refresh(force=True); main.apply_settings()

wav = "/tmp/claude-0/work/e5a.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=3", "-ar", "16000", "-ac", "1", wav], check=True)
oid = one("select id from users where email='admin@test.local'")
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds)
               values (%s,'d','X','upload','talks/x.mp4',%s,'draft','ready','free',3) returning id""", (f"E5a mots {uuid.uuid4().hex[:6]}", oid))
T = str(cur.fetchone()[0])
before = one("select value from app_settings where key='whisper_word_timestamps'")
try:
    setting(None)
    rows, lang = main.transcribe_wav(T, wav, "fr")
    ok(calls[-1].get("word_timestamps") is True, "réglage par défaut : Whisper horodate les mots")
    main.store(T, rows, lang, "whisper")
    cur.execute("select seg_idx, idx, start_ms, end_ms, word from transcript_words where talk_id=%s order by seg_idx, idx", (T,))
    w = cur.fetchall()
    ok(len(w) == 6 and w[0] == (0, 0, 0, 400, "Bonjour") and w[3] == (1, 0, 1600, 1900, "Euh…"), f"mots enregistrés, rangés par phrase, sans espaces ({w[:4]})")
    ok(one("select count(*) from transcript_segments where talk_id=%s", T) == 2 and one("select transcript_status from talks where id=%s", T) == "ready", "phrases enregistrées, transcription prête")

    setting("false")
    rows, lang = main.transcribe_wav(T, wav, "fr")
    ok(calls[-1].get("word_timestamps") is False, "réglage désactivé : pas d'horodatage demandé")
    main.store(T, rows, lang, "whisper")
    ok(one("select count(*) from transcript_words where talk_id=%s", T) == 0, "réglage désactivé : anciens mots effacés")

    setting("true")
    main.store(T, main.transcribe_wav(T, wav, "fr")[0], "fr", "whisper")
    ok(one("select count(*) from transcript_words where talk_id=%s", T) == 6, "réactivé : mots de retour")
    main.store(T, [(0, 2000, "Sous-titres de l'auteur."), (2000, 3000, "Fin.")], "fr", "subtitles")
    ok(one("select count(*) from transcript_words where talk_id=%s", T) == 0, "sous-titres de l'auteur (sans mots) : anciens mots effacés")
finally:
    cur.execute("delete from talks where id=%s", (T,))
    if before is None: cur.execute("delete from app_settings where key='whisper_word_timestamps'")
    else: cur.execute("update app_settings set value=%s where key='whisper_word_timestamps'", (before,))

print(f"\nÉCHECS : {len(fails)}" if fails else "\nTout est bon")
sys.exit(1 if fails else 0)
