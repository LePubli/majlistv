"""Traite UNE demande « Préciser la place des mots » avec un faux Whisper (aucun accès réseau) : utilisé par les tests du navigateur.
Whisper « entend » chaque mot du texte 0,1 s après le début estimé de la phrase, un mot toutes les 0,3 s. Sortie : une ligne JSON."""
import json, os, shutil, subprocess, sys, types
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:1", "S3_REGION": "us-east-1", "S3_ACCESS_KEY": "x",
                   "S3_SECRET_KEY": "x", "WORK_DIR": "/tmp/claude-0/work", "SETTINGS_KEY": "a" * 64, "MODELS_DIR": "/tmp/claude-0/models", "YTDLP_AUTO_UPDATE": "0"})
os.makedirs("/tmp/claude-0/work", exist_ok=True)
W = lambda s, e, w: types.SimpleNamespace(start=s, end=e, word=w)
class FakeModel:
    talk = None
    def __init__(self, *a, **k): pass
    def transcribe(self, wav, language=None, **k):
        # Seulement le texte de la conférence traitée (les autres conférences de la base de test ne doivent pas brouiller l'écoute).
        cur = main.db().cursor(); cur.execute("select start_ms, text from transcript_segments where lang = %s and talk_id = %s order by idx", (language, FakeModel.talk))
        segs = []
        for s, text in cur.fetchall():
            segs.append(types.SimpleNamespace(start=s / 1000, end=s / 1000 + 1, words=[W(s / 1000 + 0.1 + 0.3 * k, s / 1000 + 0.35 + 0.3 * k, " " + w) for k, w in enumerate(text.split())]))
        return iter(segs), types.SimpleNamespace(language=language)
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeModel)
sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=None))
sys.modules.setdefault("yt_dlp.version", types.SimpleNamespace(__version__="fake"))
import main  # noqa: E402
src = "/tmp/claude-0/work/align-src.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=3", "-c:a", "aac", src], check=True)
main.s3.download_file = lambda bucket, key, dest: shutil.copy(src, dest)
job = main.claim_align()
if job:
    FakeModel.talk = str(job['talk_id'])
    main.process_align(job)
print(json.dumps({"claimed": bool(job)}))
