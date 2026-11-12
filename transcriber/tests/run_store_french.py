"""Import — voix française : outil de test du transcripteur (même code que le service), sans Whisper.
  1. une vidéo qui attend sa transcription française (« pending », audio_track = 'fr') n'est pas marquée « prête » par un résultat
     dans une autre langue (transcription d'origine encore en cours au moment de l'import) ; un résultat français, si ;
  2. une vidéo ordinaire n'est pas concernée ;
  3. la langue est imposée à Whisper pour la piste française, même en détection automatique.
Variables : DATABASE_URL, SETTINGS_KEY. Sortie : une ligne JSON."""
import json, os, sys, types
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.setdefault("S3_ENDPOINT", "http://127.0.0.1:5599"); os.environ.setdefault("S3_REGION", "us-east-1"); os.environ.setdefault("S3_ACCESS_KEY", "test"); os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "majlis-videos"); os.environ.setdefault("WORK_DIR", "/tmp/claude-0/work"); os.environ.setdefault("YTDLP_AUTO_UPDATE", "0"); os.environ.setdefault("MODELS_DIR", "/tmp/claude-0/models")
os.makedirs(os.environ["WORK_DIR"], exist_ok=True)
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=object)
import main  # noqa: E402

main.log = lambda *a: print(*a, file=sys.stderr)
q = main.query
admin = q("select id from users where role = 'admin' limit 1", fetch=True)[0]["id"]
def talk(track, status):
    return str(q("""insert into talks(title, speaker, language, access, source, video_ref, video_status, organizer_id, rights_confirmed, transcript_status, audio_track)
                    values ('Store fr', 'S', 'fr', 'free', 'upload', 'talks/x-' || gen_random_uuid(), 'ready', %s, true, %s, %s) returning id""", (admin, status, track), fetch=True)[0]["id"])
st = lambda t: q("select transcript_status, transcript_language from talks where id = %s", (t,), fetch=True)[0]
cues = [(0, 1000, "Hello."), (1000, 2000, "World.")]
out = {}
a = talk("fr", "pending")
main.store(a, cues, "en", "subtitles"); out["kept_pending"] = st(a)["transcript_status"] == "pending" and st(a)["transcript_language"] is None
main.store(a, [(0, 1000, "Bonjour.")], "fr", "whisper"); out["french_ready"] = (st(a)["transcript_status"], st(a)["transcript_language"]) == ("ready", "fr")
b = talk(None, "pending"); main.store(b, cues, "en", "subtitles"); out["normal_ready"] = (st(b)["transcript_status"], st(b)["transcript_language"]) == ("ready", "en")
q("delete from talks where id in (%s, %s)", (a, b))

# Langue imposée : on remplace le modèle par un faux qui note la langue reçue.
seen = {}
class Fake:
    def transcribe(self, wav, language=None, **k):
        seen["language"] = language
        return iter([]), types.SimpleNamespace(language=language or "en", duration=1.0)
main.get_model = lambda: Fake(); main.audio_duration = lambda w: 1.0; main.LANG_MODE = "auto"; main.WORDS = False
main.transcribe_wav("t", "x.wav", "fr", force=True); out["forced"] = seen["language"]
main.transcribe_wav("t", "x.wav", "fr"); out["auto"] = seen["language"]
print(json.dumps(out))
