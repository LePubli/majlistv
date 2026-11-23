"""Confiance de Whisper (migration 128), avec un faux Whisper et la vraie base de test :
  - la confiance d'une phrase = exp(avg_logprob), bornée à 0..1, arrondie à 3 décimales ; None si le moteur ne la donne pas ;
  - store() l'enregistre dans transcript_segments.confidence ; les phrases sans confiance (sous-titres de plateforme, 3 éléments) : NULL ;
  - une nouvelle transcription remplace les anciennes phrases ET leur confiance.
Prérequis : PostgreSQL de test (5544) avec les migrations de l'API (lancer l'API une fois), ffmpeg.
Lancement depuis la racine du dépôt : python3 transcriber/tests/test_confidence.py"""
import math, os, subprocess, sys, types, uuid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:1", "S3_REGION": "us-east-1", "S3_ACCESS_KEY": "x",
                   "S3_SECRET_KEY": "x", "WORK_DIR": "/tmp/claude-0/work", "SETTINGS_KEY": "a" * 64, "MODELS_DIR": "/tmp/claude-0/models", "YTDLP_AUTO_UPDATE": "0"})
os.makedirs("/tmp/claude-0/work", exist_ok=True)
S = types.SimpleNamespace

class FakeModel:
    def __init__(self, *a, **k): pass
    def transcribe(self, wav, language=None, **k):
        segs = [S(start=0.0, end=1.5, text=" Bonjour à tous.", words=None, avg_logprob=-0.1),      # sûr : exp(-0,1) = 0,905
                S(start=1.5, end=3.0, text=" Euh… la patience.", words=None, avg_logprob=-1.2),    # hésitant : exp(-1,2) = 0,301
                S(start=3.0, end=4.0, text=" Sans note.", words=None)]                              # pas d'avg_logprob
        return iter(segs), S(language=language or "fr")
sys.modules["faster_whisper"] = S(WhisperModel=FakeModel)
sys.modules.setdefault("yt_dlp", S(YoutubeDL=None))
sys.modules.setdefault("yt_dlp.version", S(__version__="fake"))
import main  # noqa: E402

fails = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
cur = main.db().cursor()
main.settings.refresh(force=True); main.apply_settings()
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None

ok(main.confidence_of(S(avg_logprob=0.0)) == 1.0, "log-proba 0 → confiance 1")
ok(main.confidence_of(S(avg_logprob=0.5)) == 1.0, "valeur aberrante positive : bornée à 1")
ok(main.confidence_of(S(avg_logprob=-100.0)) == 0.0, "très mauvais : 0")
ok(main.confidence_of(S(avg_logprob=-1.0)) == round(math.exp(-1), 3), "exp(-1) arrondi à 3 décimales")
ok(main.confidence_of(S()) is None and main.confidence_of(S(avg_logprob=None)) is None, "pas de log-proba : None")

wav = "/tmp/claude-0/work/conf.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=4", "-ar", "16000", "-ac", "1", wav], check=True)
oid = one("select id from users where email='admin@test.local'")
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds)
               values (%s,'d','X','upload','talks/x.mp4',%s,'draft','ready','free',4) returning id""", (f"Confiance whisper {uuid.uuid4().hex[:6]}", oid))
T = str(cur.fetchone()[0])
try:
    rows, lang = main.transcribe_wav(T, wav, "fr")
    ok(len(rows) == 3 and rows[0][4] == 0.905 and rows[1][4] == 0.301 and rows[2][4] is None, f"transcribe_wav : confiance par phrase ({[r[4] for r in rows]})")
    main.store(T, rows, lang, "whisper")
    cur.execute("select idx, confidence from transcript_segments where talk_id=%s order by idx", (T,))
    got = cur.fetchall()
    ok([i for i, _ in got] == [0, 1, 2] and abs(got[0][1] - 0.905) < 1e-6 and abs(got[1][1] - 0.301) < 1e-6 and got[2][1] is None, f"enregistrée en base, NULL si inconnue ({got})")
    ok(one("select transcript_status from talks where id=%s", T) == "ready", "transcription prête")

    # Sous-titres de plateforme : 3 éléments seulement → confiance NULL, et les anciennes valeurs disparaissent.
    main.store(T, [(0, 1000, "Sous-titre de la plateforme"), (1000, 2000, "Deuxième")], "fr", "subtitles")
    cur.execute("select count(*), count(confidence) from transcript_segments where talk_id=%s", (T,))
    ok(cur.fetchone() == (2, 0), "sous-titres de plateforme : aucune confiance, anciennes phrases remplacées")
finally:
    cur.execute("delete from talks where id=%s", (T,))
print("test_confidence : " + ("TOUT OK" if not fails else f"{len(fails)} ÉCHEC(S)"))
sys.exit(1 if fails else 0)
