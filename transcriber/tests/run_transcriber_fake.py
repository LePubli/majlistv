"""Lance le vrai transcripteur avec un faux yt-dlp et un faux Whisper (aucun accès réseau)."""
import json, os, subprocess, sys, types
sys.path.insert(0, "/home/claude/majlis-tv/transcriber/src")
os.environ.update({"DATABASE_URL": "postgres://majlis:pw@127.0.0.1:5544/majlis", "S3_ENDPOINT": "http://127.0.0.1:1", "S3_ACCESS_KEY": "x",
                   "S3_SECRET_KEY": "x", "WORK_DIR": "/tmp/claude-0/work", "POLL_SECONDS": "1", "PORT": "3089", "YTDLP_AUTO_UPDATE": "0",
                   "SETTINGS_KEY": "test-settings-key-0123456789", "MODELS_DIR": "/tmp/claude-0/models"})
os.makedirs("/tmp/claude-0/work", exist_ok=True)

SUB_FR = json.dumps({"events": [{"tStartMs": 0, "dDurationMs": 4000, "segs": [{"utf8": "Bonjour et bienvenue."}]},
                                {"tStartMs": 65000, "dDurationMs": 5000, "segs": [{"utf8": "La patience est une lumière."}]}]})
AUTO_FR = json.dumps({"events": [{"tStartMs": 0, "dDurationMs": 900, "segs": [{"utf8": "voici"}]}, {"tStartMs": 900, "dDurationMs": 900, "segs": [{"utf8": "les sous-titres"}]},
                                 {"tStartMs": 1800, "dDurationMs": 900, "segs": [{"utf8": "automatiques"}]}]})
VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello Vimeo world.\n\n00:00:03.000 --> 00:00:06.000\nSecond line.\n"
TEXTS = {"mem://subs-fr": SUB_FR, "mem://auto-fr": AUTO_FR, "mem://vimeo-en": VTT}

def info_for(url):
    vid = url.rsplit("=", 1)[-1].rsplit("/", 1)[-1]
    base = {"id": vid, "title": "Titre plateforme " + vid, "duration": 3725, "description": "Description venue de la plateforme",
            "thumbnails": [{"url": f"https://img.test/{vid}.jpg", "width": 1280}], "extractor_key": "Youtube"}
    if vid.startswith("subs"):
        return dict(base, subtitles={"fr": [{"ext": "json3", "url": "mem://subs-fr"}]})
    if vid.startswith("audio"):
        return dict(base)
    if vid.startswith("blocked"):
        raise Exception("ERROR: [youtube] blocked: Sign in to confirm you're not a bot")
    if vid.startswith("auto"):
        return dict(base, automatic_captions={"fr-orig": [{"ext": "json3", "url": "mem://auto-fr"}]})
    if vid.isdigit():
        return dict(base, extractor_key="Vimeo", subtitles={"en": [{"ext": "vtt", "url": "mem://vimeo-en"}]})
    raise Exception("Video unavailable")

class FakeYDL:
    def __init__(self, opts): self.opts = opts
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def urlopen(self, url):
        return types.SimpleNamespace(read=lambda: TEXTS[url].encode())
    def extract_info(self, url, download=False):
        if "playlist" in url:
            return {"_type": "playlist", "title": "Cycle de conférences", "entries": [
                {"ie_key": "Youtube", "id": "subsPLAY001", "title": "Épisode 1", "duration": 1800, "thumbnails": [{"url": "https://img.test/p1.jpg"}]},
                {"ie_key": "Youtube", "id": "audioPLAY02", "title": "Épisode 2", "duration": 2400},
                {"ie_key": "Youtube", "id": "subsAAAAAAA", "title": "Déjà là"}]}
        info = info_for(url)
        if download:
            if info["id"].startswith("auto"):
                raise Exception("ERROR: [youtube] auto: Sign in to confirm you're not a bot")
            path = os.path.join(self.opts["paths"]["home"], info["id"] + ".m4a")
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=3", path], check=True)
            info["ext"] = "m4a"
        return info
    def prepare_filename(self, info):
        return os.path.join(self.opts["paths"]["home"], info["id"] + ".m4a")

sys.modules["yt_dlp"] = types.SimpleNamespace(YoutubeDL=FakeYDL)
sys.modules["yt_dlp.version"] = types.SimpleNamespace(__version__="fake")

class FakeModel:
    def __init__(self, *a, **k): pass
    def transcribe(self, wav, language=None, **k):
        segs = [types.SimpleNamespace(start=0.0, end=1.5, text=" Texte reconnu par Whisper."), types.SimpleNamespace(start=1.5, end=3.0, text=" Deuxième phrase.")]
        return iter(segs), types.SimpleNamespace(language=language or "fr")
sys.modules["faster_whisper"] = types.SimpleNamespace(WhisperModel=FakeModel)

import main  # noqa: E402
main.main()
