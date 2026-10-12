"""Service de transcription Mejliss TV.

Prend les conférences dont la transcription est en attente (transcript_status = 'pending') :
- vidéo envoyée (prête) : extrait l'audio du fichier et le transcrit avec faster-whisper (CPU) ;
- vidéo YouTube / Vimeo (autorisation de l'auteur déclarée) : sous-titres de l'auteur s'ils existent,
  sinon piste audio téléchargée avec yt-dlp puis Whisper, et en dernier recours sous-titres automatiques.
Enregistre les segments horodatés dans transcript_segments. Traite aussi les imports de playlists et de chaînes.
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
from http.server import BaseHTTPRequestHandler, HTTPServer

import boto3
import psycopg2
import psycopg2.extras
from botocore.config import Config

from settings import Settings
import external


def env(key, default=None, required=False):
    value = os.environ.get(key, default)
    if required and not value:
        print(f"Variable manquante : {key}", flush=True)
        sys.exit(1)
    return value


DATABASE_URL = env("DATABASE_URL", required=True)
BUCKET = env("S3_BUCKET", "majlis-videos")
# Réglages modifiables depuis le back-office (Admin → Paramètres → Transcription), relus avant chaque conférence.
MODEL_NAME = "small"  # small | medium | large-v3-turbo | large-v3
THREADS = 4  # laisse des cœurs au reste du serveur
BEAM = 3
LANG_MODE = "declared"  # declared = langue de la conférence ; auto = détection
POLL = int(env("POLL_SECONDS", "10"))
WORK_DIR = env("WORK_DIR", "/work")
MAX_ATTEMPTS = 3

# Langues supportées par Whisper (repli sur la détection automatique pour les autres).
WHISPER_LANGS = {
    "af", "ar", "az", "be", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "fa", "fi",
    "fr", "gl", "he", "hi", "hr", "hu", "hy", "id", "is", "it", "ja", "ka", "kk", "ko", "lt", "lv", "mk", "ml",
    "mr", "ms", "ne", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sr", "sv", "sw", "ta", "th", "tr", "uk",
    "ur", "uz", "vi", "zh",
}

stopping = False
current = None  # id de la conférence en cours
last_ok = None
_model = None
_model_key = None
settings = None


def log(*args):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *args, flush=True)


# --- Base de données ---------------------------------------------------------------------------
_conn = None


def conn_params(url):
    """Décompose DATABASE_URL comme le fait l'API (dernier « @ » = séparateur), au lieu de laisser libpq
    l'interpréter : un mot de passe contenant « @ » ou des caractères encodés (%40) fonctionne ainsi dans les deux."""
    u = urlsplit(url)
    return {
        "host": u.hostname, "port": u.port or 5432, "dbname": unquote(u.path.lstrip("/")),
        "user": unquote(u.username or ""), "password": unquote(u.password or ""), "client_encoding": "UTF8",
    }


def db():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(**conn_params(DATABASE_URL))
        _conn.autocommit = True
    return _conn


def query(sql, params=None, fetch=False):
    for attempt in (1, 2):
        try:
            with db().cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return cur.fetchall() if fetch else cur.rowcount
        except psycopg2.OperationalError:
            global _conn
            _conn = None
            if attempt == 2:
                raise


settings = Settings(query, lambda *a: log(*a))
MODEL_NAME, THREADS, BEAM, LANG_MODE = "small", 4, 3, "declared"  # remplacés par apply_settings() au démarrage


def claim():
    rows = query(
        """UPDATE talks SET transcript_status = 'processing', transcript_progress = 0, transcript_error = NULL,
                  transcript_attempts = transcript_attempts + 1
           WHERE id = (SELECT id FROM talks
                       WHERE transcript_status = 'pending'
                         AND ((source = 'upload' AND video_status = 'ready') OR (source IN ('youtube', 'vimeo') AND rights_confirmed))
                       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id, source, video_ref, language, description, duration_seconds, external_thumb, transcript_attempts""",
        fetch=True,
    )
    return rows[0] if rows else None


# --- Stockage ----------------------------------------------------------------------------------
s3 = boto3.client(
    "s3",
    endpoint_url=env("S3_ENDPOINT", required=True),
    region_name=env("S3_REGION", "garage"),
    aws_access_key_id=env("S3_ACCESS_KEY", required=True),
    aws_secret_access_key=env("S3_SECRET_KEY", required=True),
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
        request_checksum_calculation="when_required",  # compatibilité avec Garage
        response_checksum_validation="when_required",
    ),
)


# --- Audio et modèle ---------------------------------------------------------------------------
def has_audio(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return bool(out.strip())


def extract_audio(src, wav):
    subprocess.run(
        ["nice", "-n", "10", "ffmpeg", "-y", "-nostdin", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "pcm_s16le", wav],
        check=True, capture_output=True, text=True,
    )


def audio_duration(wav):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip() or 0)


def apply_settings():
    """Relit les paramètres (base de données puis variables d'environnement)."""
    global MODEL_NAME, THREADS, BEAM, LANG_MODE
    settings.refresh()
    MODEL_NAME = settings.get("whisper_model", "WHISPER_MODEL", "small")
    THREADS = max(1, settings.get_int("whisper_threads", "WHISPER_THREADS", 4))
    BEAM = max(1, settings.get_int("whisper_beam", "WHISPER_BEAM", 3))
    LANG_MODE = settings.get("whisper_language_mode", "WHISPER_LANGUAGE_MODE", "declared")


def get_model():
    global _model, _model_key
    if _model is None or _model_key != (MODEL_NAME, THREADS):  # modèle ou nombre de cœurs changé dans le back-office
        _model = None
        from faster_whisper import WhisperModel

        root = env("MODELS_DIR", "/models")
        if not os.access(root, os.W_OK):
            log(f"{root} non accessible en écriture : le modèle sera retéléchargé à chaque redémarrage")
            root = "/tmp/models"
        log(f"Chargement du modèle Whisper « {MODEL_NAME} » (premier lancement : téléchargement)")
        _model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=THREADS, download_root=root)
        _model_key = (MODEL_NAME, THREADS)
        log("Modèle prêt.")
    return _model


# --- Traitement --------------------------------------------------------------------------------
class Stop(Exception):
    pass


def transcribe_wav(talk_id, wav, declared):
    """Transcrit un fichier audio (WAV 16 kHz) avec Whisper. Renvoie (segments, langue) ; segments vides = pas de parole."""
    duration = audio_duration(wav)
    language = declared if LANG_MODE == "declared" and declared in WHISPER_LANGS else None
    model = get_model()
    log(f"[{talk_id}] transcription de {duration:.0f} s (langue : {language or 'détection auto'})")
    started = time.time()
    segments, info = model.transcribe(
        wav, language=language, beam_size=BEAM, vad_filter=True, condition_on_previous_text=False,
    )
    rows, last, last_write = [], 0, 0.0
    for seg in segments:
        if stopping:
            raise Stop()
        text = seg.text.strip()
        if text:
            rows.append((int(seg.start * 1000), int(seg.end * 1000), text))
        pct = min(99, int(seg.end / duration * 100)) if duration else 0
        if pct > last and time.time() - last_write > 4:
            last, last_write = pct, time.time()
            query("UPDATE talks SET transcript_progress = %s WHERE id = %s", (pct, talk_id))
    elapsed = time.time() - started
    speed = duration / elapsed if elapsed else 0
    log(f"[{talk_id}] Whisper : {len(rows)} segments, langue {info.language}, {elapsed:.0f} s ({speed:.1f}x temps réel)")
    return rows, info.language


def store(talk_id, cues, lang, method):
    """Enregistre les segments [(début_ms, fin_ms, texte)] et passe la transcription à « prête »."""
    global last_ok
    rows = [(talk_id, lang, i, start, end, text) for i, (start, end, text) in enumerate(cues)]
    full_text = " ".join(r[5] for r in rows)
    try:
        with db().cursor() as cur:
            cur.execute("DELETE FROM transcript_segments WHERE talk_id = %s AND lang = %s", (talk_id, lang))
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO transcript_segments (talk_id, lang, idx, start_ms, end_ms, text) VALUES %s",
                rows, page_size=500,
            )
    except psycopg2.errors.ForeignKeyViolation:
        log(f"[{talk_id}] conférence supprimée entre-temps, abandon")
        return
    query(
        """UPDATE talks SET transcript_status = 'ready', transcript_progress = 100, transcript_error = NULL,
                  transcript_language = %s, transcript_text = %s, transcript_method = %s WHERE id = %s""",
        (lang, full_text, method, talk_id),
    )
    log(f"[{talk_id}] terminé : {len(rows)} segments, langue {lang}, méthode {method}")
    last_ok = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def no_speech(talk_id):
    # Vidéo sans parole (musique, silence, image fixe) : ce n'est pas une panne, inutile de réessayer.
    query("UPDATE talks SET transcript_status = 'unavailable', transcript_progress = 0, transcript_error = NULL WHERE id = %s", (talk_id,))
    log(f"[{talk_id}] aucune parole détectée : transcription non disponible pour cette vidéo")


def process_upload(job, talk_id, work):
    src = os.path.join(work, "source")
    wav = os.path.join(work, "audio.wav")
    log(f"[{talk_id}] téléchargement")
    s3.download_file(BUCKET, job["video_ref"], src)
    if not has_audio(src):
        query("UPDATE talks SET transcript_status = 'unavailable' WHERE id = %s", (talk_id,))
        log(f"[{talk_id}] aucune piste audio : transcription ignorée")
        return
    extract_audio(src, wav)
    os.remove(src)
    declared = (job["language"] or "").split("-")[0].lower()
    rows, lang = transcribe_wav(talk_id, wav, declared)
    if not rows:
        return no_speech(talk_id)
    store(talk_id, rows, lang, "whisper")


def external_options(work, conf=None):
    conf = conf or settings
    return external.ydl_options(
        work, cookies=conf.get("ytdlp_cookies", "YTDLP_COOKIES", ""), proxy=conf.get("ytdlp_proxy", "YTDLP_PROXY", ""),
    )


def process_external(job, talk_id, work):
    """YouTube / Vimeo : sous-titres de l'auteur, sinon audio + Whisper, sinon sous-titres automatiques."""
    mode = settings.get("external_mode", "EXTERNAL_MODE", "subtitles_then_audio")
    allow_auto = settings.get_bool("external_auto_captions", "EXTERNAL_AUTO_CAPTIONS", True)
    opts = external_options(work)
    url = external.video_url(job["source"], job["video_ref"])
    declared = (job["language"] or "").split("-")[0].lower()

    log(f"[{talk_id}] lecture des informations {job['source']} {job['video_ref']}")
    info = external.fetch_info(url, opts)
    # Informations utiles au catalogue : durée, miniature, description si l'organisateur l'a laissée vide.
    query(
        """UPDATE talks SET duration_seconds = COALESCE(duration_seconds, %s), external_thumb = COALESCE(external_thumb, %s),
                  description = CASE WHEN description = '' THEN %s ELSE description END WHERE id = %s""",
        (int(info["duration"]) if info.get("duration") else None, external.best_thumbnail(info),
         (info.get("description") or "")[:5000], talk_id),
    )

    def from_subtitles(kind_wanted):
        pick = external.pick_subtitles(info, declared, allow_auto=kind_wanted == "auto_captions")
        if not pick or pick[0] != kind_wanted:
            return False
        kind, code, fmt = pick
        text = external.download_text(fmt["url"], opts)
        cues = external.parse_subtitles(text, fmt.get("ext"))
        if kind == "auto_captions":
            cues = external.merge_cues(cues)
        if not cues:
            return False
        lang = code.split("-")[0].lower()
        store(talk_id, cues, lang, kind)
        return True

    if mode != "audio_only" and from_subtitles("subtitles"):
        return
    audio_error = None
    if mode != "subtitles_only":
        try:
            log(f"[{talk_id}] téléchargement de la piste audio")
            src = external.download_audio(url, opts)
            if not has_audio(src):
                raise RuntimeError("Aucune piste audio dans la vidéo")
            wav = os.path.join(work, "audio.wav")
            extract_audio(src, wav)
            os.remove(src)
            rows, lang = transcribe_wav(talk_id, wav, declared)
            if not rows:
                return no_speech(talk_id)
            store(talk_id, rows, lang, "whisper")
            return
        except Stop:
            raise
        except Exception as err:  # noqa: BLE001
            audio_error = err
            log(f"[{talk_id}] audio indisponible : {err}")
    if allow_auto and from_subtitles("auto_captions"):
        return
    if audio_error:
        raise audio_error
    raise external.Blocked("Aucun sous-titre dans la langue de la conférence et téléchargement de l'audio désactivé "
                           "(Admin → Paramètres → Vidéos YouTube et Vimeo).")


def process(job):
    talk_id = str(job["id"])
    work = os.path.join(WORK_DIR, talk_id)
    try:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        if job["source"] == "upload":
            process_upload(job, talk_id, work)
        else:
            process_external(job, talk_id, work)
    except Stop:
        raise
    except Exception as err:  # noqa: BLE001
        attempts = job["transcript_attempts"]
        # Blocage ou vidéo privée : inutile de réessayer tout de suite (l'organisateur relance après correction).
        final = attempts >= MAX_ATTEMPTS or isinstance(err, external.Blocked)
        log(f"[{talk_id}] échec ({attempts}/{MAX_ATTEMPTS}) : {err}")
        stderr = getattr(err, "stderr", None)
        message = f"{err} {stderr or ''}".strip()[:1000]
        query("UPDATE talks SET transcript_status = %s, transcript_error = %s WHERE id = %s",
              ("failed" if final else "pending", message, talk_id))
    finally:
        shutil.rmtree(work, ignore_errors=True)


# --- Imports de playlists et de chaînes (fil séparé, sa propre connexion à la base) --------------
def import_loop():
    conn = None

    def local_query(sql, params=None, fetch=False):
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchall() if fetch else cur.rowcount

    # Réglages propres à ce fil : la boucle principale peut rester longtemps occupée par Whisper.
    conf = Settings(local_query, lambda *a: log(*a))
    while not stopping:
        try:
            if conn is None or conn.closed:
                conn = psycopg2.connect(**conn_params(DATABASE_URL))
                conn.autocommit = True
            conf.refresh()
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """UPDATE import_jobs SET attempts = attempts + 1, updated_at = now()
                       WHERE id = (SELECT id FROM import_jobs WHERE status = 'listing' AND attempts < 3
                                   AND updated_at < now() - make_interval(secs => 60 * attempts)
                                   ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                       RETURNING id, url, attempts"""
                )
                job = cur.fetchone()
            if not job:
                time.sleep(5)
                continue
            work = os.path.join(WORK_DIR, "import-" + str(job["id"]))
            os.makedirs(work, exist_ok=True)
            try:
                limit = max(1, conf.get_int("import_max_videos", "IMPORT_MAX_VIDEOS", 200))
                log(f"[import {job['id']}] lecture de la liste {job['url']}")
                title, entries = external.list_videos(job["url"], external_options(work, conf), limit)
                with conn.cursor() as cur:
                    for e in entries:
                        cur.execute("SELECT 1 FROM talks WHERE source = %s AND video_ref = %s LIMIT 1", (e["source"], e["id"]))
                        e["already"] = cur.fetchone() is not None
                    cur.execute("UPDATE import_jobs SET status = 'listed', title = %s, entries = %s, error = NULL, updated_at = now() WHERE id = %s",
                                (title[:300], json.dumps(entries), job["id"]))
                log(f"[import {job['id']}] {len(entries)} vidéo(s) trouvée(s)")
            except Exception as err:  # noqa: BLE001
                final = job["attempts"] >= 3 or isinstance(err, external.Blocked)
                log(f"[import {job['id']}] échec : {err}")
                with conn.cursor() as cur:
                    cur.execute("UPDATE import_jobs SET status = %s, error = %s, updated_at = now() WHERE id = %s",
                                ("failed" if final else "listing", str(err)[:1000], job["id"]))
            finally:
                shutil.rmtree(work, ignore_errors=True)
        except Exception as err:  # noqa: BLE001
            log("Imports : erreur base :", err)
            conn = None
            time.sleep(10)


def update_ytdlp():
    """yt-dlp doit suivre les changements de YouTube : mise à jour au démarrage (désactivable : YTDLP_AUTO_UPDATE=0)."""
    if env("YTDLP_AUTO_UPDATE", "1") != "1":
        return
    try:
        out = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "--quiet", "--disable-pip-version-check",
                              "-U", "yt-dlp[default]"], capture_output=True, text=True, timeout=180)
        if out.returncode != 0:
            log("Mise à jour de yt-dlp impossible (version de l'image conservée) :", out.stderr.strip()[-200:])
    except Exception as err:  # noqa: BLE001
        log("Mise à jour de yt-dlp impossible :", err)
    try:
        import importlib
        import site
        importlib.invalidate_caches()
        if site.ENABLE_USER_SITE and site.getusersitepackages() not in sys.path:
            sys.path.insert(0, site.getusersitepackages())
        from yt_dlp.version import __version__
        log(f"yt-dlp {__version__}")
    except Exception as err:  # noqa: BLE001
        log("yt-dlp introuvable :", err)


# --- Santé, arrêt propre, boucle principale ------------------------------------------------------
class Health(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = json.dumps({"status": "ok", "model": MODEL_NAME, "current": current, "lastOk": last_ok}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def on_signal(*_):
    global stopping
    stopping = True
    if current:
        try:
            query("UPDATE talks SET transcript_status = 'pending' WHERE id = %s AND transcript_status = 'processing'", (current,))
        except Exception:  # noqa: BLE001
            pass
    os._exit(0)


def main():
    global current
    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    server = HTTPServer(("0.0.0.0", int(env("PORT", "3000"))), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    while True:  # attend la migration 005 ; reprend les transcriptions interrompues
        try:
            query("UPDATE talks SET transcript_status = 'pending' WHERE transcript_status = 'processing'")
            break
        except Exception as err:  # noqa: BLE001
            log("Base pas prête (migration 005 appliquée ?) :", err)
            time.sleep(POLL)
    apply_settings()
    update_ytdlp()
    threading.Thread(target=import_loop, daemon=True).start()
    log(f"Transcripteur prêt (modèle {MODEL_NAME}, {THREADS} threads).")

    while not stopping:
        job = None
        try:
            apply_settings()
            job = claim()
        except Exception as err:  # noqa: BLE001
            log("Erreur base :", err)
        if not job:
            time.sleep(POLL)
            continue
        current = str(job["id"])
        try:
            process(job)
        except Stop:
            pass
        current = None


if __name__ == "__main__":
    main()
