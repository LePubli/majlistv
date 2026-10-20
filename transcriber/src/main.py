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
import psycopg2.errors
import psycopg2.extras
from botocore.config import Config

from settings import Settings
import external
import align


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


# Étape S3 (Studio → Activité) : pause générale et plage horaire des tâches lourdes, pause et priorité par conférence
# (fonctions SQL de la migration 055 de l'API). Si elles n'existent pas encore, on garde la file d'origine.
CONTROLS = {"on": True}


def claim():
    cond = "AND activity_allows('transcript') AND NOT activity_paused('transcript', id::text)" if CONTROLS["on"] else ""
    order = "activity_priority('transcript', id::text) DESC, created_at" if CONTROLS["on"] else "created_at"
    try:
        rows = query(
            f"""UPDATE talks SET transcript_status = 'processing', transcript_progress = 0, transcript_error = NULL,
                      transcript_attempts = transcript_attempts + 1
               WHERE id = (SELECT id FROM talks
                           WHERE transcript_status = 'pending'
                             AND ((source = 'upload' AND video_status = 'ready') OR (source IN ('youtube', 'vimeo', 'archive') AND rights_confirmed))
                             {cond}
                           ORDER BY {order} LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING id, source, video_ref, language, description, duration_seconds, external_thumb, external_file, transcript_attempts""",
            fetch=True,
        )
    except psycopg2.errors.UndefinedFunction:
        if not CONTROLS["on"]:
            raise
        CONTROLS["on"] = False
        log("Pause et priorité indisponibles (migration 055 de l'API absente) : file simple")
        return claim()
    return rows[0] if rows else None


def claim_align():
    """Étape E5c : prochaine demande « Préciser la place des mots » (table créée par la migration 058 de l'API)."""
    cond = "AND activity_allows('transcript')" if CONTROLS["on"] else ""
    try:
        rows = query(
            f"""UPDATE word_align_jobs SET status = 'processing', progress = 0, error = NULL, attempts = attempts + 1, updated_at = now()
               WHERE talk_id = (SELECT talk_id FROM word_align_jobs WHERE status = 'pending' {cond}
                                ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING talk_id, lang""",
            fetch=True,
        )
    except psycopg2.errors.UndefinedTable:
        return None
    except psycopg2.errors.UndefinedFunction:
        CONTROLS["on"] = False
        return claim_align()
    return rows[0] if rows else None


def claim_track():
    """Étape E5d : prochaine demande « Le cadre suit le visage » (table créée par la migration 059 de l'API)."""
    try:
        rows = query(
            """UPDATE face_track_jobs SET status = 'processing', progress = 0, error = NULL, attempts = attempts + 1, updated_at = now()
               WHERE project_id = (SELECT project_id FROM face_track_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING project_id, talk_id, from_s, to_s""",
            fetch=True,
        )
    except psycopg2.errors.UndefinedTable:
        return None
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
    global MODEL_NAME, THREADS, BEAM, LANG_MODE, WORDS
    settings.refresh()
    MODEL_NAME = settings.get("whisper_model", "WHISPER_MODEL", "small")
    THREADS = max(1, settings.get_int("whisper_threads", "WHISPER_THREADS", 4))
    BEAM = max(1, settings.get_int("whisper_beam", "WHISPER_BEAM", 3))
    LANG_MODE = settings.get("whisper_language_mode", "WHISPER_LANGUAGE_MODE", "declared")
    # Étape E5a (montage par le texte) : horodatage de chaque mot (environ 10 à 20 % de calcul en plus).
    WORDS = settings.get_bool("whisper_word_timestamps", "WHISPER_WORD_TIMESTAMPS", True)


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
        wav, language=language, beam_size=BEAM, vad_filter=True, condition_on_previous_text=False, word_timestamps=WORDS,
    )
    rows, last, last_write = [], 0, 0.0
    for seg in segments:
        if stopping:
            raise Stop()
        text = seg.text.strip()
        if text:
            words = [(int(w.start * 1000), int(w.end * 1000), w.word.strip()) for w in (getattr(seg, "words", None) or []) if w.word.strip()]
            rows.append((int(seg.start * 1000), int(seg.end * 1000), text, words))
        pct = min(99, int(seg.end / duration * 100)) if duration else 0
        if pct > last and time.time() - last_write > 4:
            last, last_write = pct, time.time()
            query("UPDATE talks SET transcript_progress = %s WHERE id = %s", (pct, talk_id))
    elapsed = time.time() - started
    speed = duration / elapsed if elapsed else 0
    log(f"[{talk_id}] Whisper : {len(rows)} segments, langue {info.language}, {elapsed:.0f} s ({speed:.1f}x temps réel)")
    return rows, info.language


def store(talk_id, cues, lang, method):
    """Enregistre les segments [(début_ms, fin_ms, texte[, mots])] et passe la transcription à « prête ».
    Étape E5a : les mots horodatés [(début_ms, fin_ms, mot)] de Whisper vont dans transcript_words (montage par le texte)."""
    global last_ok
    rows = [(talk_id, lang, i, c[0], c[1], c[2]) for i, c in enumerate(cues)]
    words = [(talk_id, lang, i, k, w[0], w[1], w[2]) for i, c in enumerate(cues) if len(c) > 3 for k, w in enumerate(c[3])]
    full_text = " ".join(r[5] for r in rows)
    try:
        with db().cursor() as cur:
            cur.execute("DELETE FROM transcript_segments WHERE talk_id = %s AND lang = %s", (talk_id, lang))
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO transcript_segments (talk_id, lang, idx, start_ms, end_ms, text) VALUES %s",
                rows, page_size=500,
            )
        store_words(talk_id, lang, words)
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


def store_words(talk_id, lang, words):
    """Mots horodatés (étape E5a). Table créée par l'API (migration 057) : sans elle, rien n'est perdu (le montage par le texte
    estime alors la place des mots dans chaque phrase)."""
    try:
        with db().cursor() as cur:
            cur.execute("DELETE FROM transcript_words WHERE talk_id = %s AND lang = %s", (talk_id, lang))
            if words:
                psycopg2.extras.execute_values(
                    cur, "INSERT INTO transcript_words (talk_id, lang, seg_idx, idx, start_ms, end_ms, word) VALUES %s", words, page_size=1000)
        if words:
            log(f"[{talk_id}] {len(words)} mots horodatés")
    except psycopg2.errors.UndefinedTable:
        log(f"[{talk_id}] mots horodatés non enregistrés (migration 057 de l'API absente)")


def process_align(job):
    """Étape E5c : réécoute l'audio d'une conférence déjà transcrite et donne à chaque mot du texte existant son moment exact.
    Le texte et les traductions ne changent pas ; les phrases qui ne se retrouvent pas dans l'audio gardent leur place d'avant."""
    talk_id, lang = str(job["talk_id"]), job["lang"]
    work = os.path.join(WORK_DIR, "align-" + talk_id)
    try:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        talk = query("SELECT source, video_ref FROM talks WHERE id = %s", (talk_id,), fetch=True)
        if not talk or talk[0]["source"] != "upload":
            raise RuntimeError("seules les vidéos envoyées sur le site peuvent être réécoutées")
        segs = query("SELECT idx, start_ms, end_ms, text FROM transcript_segments WHERE talk_id = %s AND lang = %s ORDER BY idx", (talk_id, lang), fetch=True)
        if not segs:
            raise RuntimeError("pas de texte à préciser")
        src, wav = os.path.join(work, "source"), os.path.join(work, "audio.wav")
        log(f"[{talk_id}] place des mots : téléchargement")
        s3.download_file(BUCKET, talk[0]["video_ref"], src)
        if not has_audio(src):
            raise RuntimeError("la vidéo n'a pas de piste audio")
        extract_audio(src, wav)
        os.remove(src)
        duration = audio_duration(wav)
        language = lang.split("-")[0].lower()
        model = get_model()
        log(f"[{talk_id}] place des mots : écoute de {duration:.0f} s (langue : {language})")
        segments, _info = model.transcribe(wav, language=language if language in WHISPER_LANGS else None, beam_size=BEAM,
                                           vad_filter=True, condition_on_previous_text=False, word_timestamps=True)
        heard, last, last_write = [], 0, 0.0
        for seg in segments:
            if stopping:
                raise Stop()
            for w in (getattr(seg, "words", None) or []):
                if w.word.strip():
                    heard.append((int(w.start * 1000), int(w.end * 1000), w.word.strip()))
            pct = min(95, int(seg.end / duration * 95)) if duration else 0
            if pct > last and time.time() - last_write > 4:
                last, last_write = pct, time.time()
                query("UPDATE word_align_jobs SET progress = %s, updated_at = now() WHERE talk_id = %s", (pct, talk_id))
        heard.sort(key=lambda h: h[0])
        done, total = align.align_all([(r["idx"], r["start_ms"], r["end_ms"], r["text"]) for r in segs], heard)
        old = {}
        for r in query("SELECT seg_idx, idx, start_ms, end_ms, word FROM transcript_words WHERE talk_id = %s AND lang = %s ORDER BY seg_idx, idx", (talk_id, lang), fetch=True):
            old.setdefault(r["seg_idx"], []).append((r["start_ms"], r["end_ms"], r["word"]))
        rows = []
        for r in segs:
            ws = done.get(r["idx"]) or old.get(r["idx"]) or []
            rows += [(talk_id, lang, r["idx"], k, w[0], w[1], w[2]) for k, w in enumerate(ws)]
        store_words(talk_id, lang, rows)
        query("UPDATE word_align_jobs SET status = 'done', progress = 100, aligned = %s, total = %s, error = NULL, updated_at = now() WHERE talk_id = %s",
              (len(done), total, talk_id))
        log(f"[{talk_id}] place des mots : {len(done)} phrases précisées sur {total}")
    except Stop:
        raise
    except Exception as err:  # noqa: BLE001
        log(f"[{talk_id}] place des mots : échec : {err}")
        query("UPDATE word_align_jobs SET status = 'failed', error = %s, updated_at = now() WHERE talk_id = %s", (str(err)[:500], talk_id))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def process_track(job):
    """Étape E5d : lit les images d'un extrait, repère les visages et calcule la trajectoire du cadre vertical (points clés).
    Seules les vidéos envoyées sur le site sont analysées (les vidéos YouTube / Vimeo ne sont pas chez nous)."""
    import faces  # OpenCV n'est chargé que pour ce travail : le reste du service n'en dépend pas
    import track
    pid, talk_id = str(job["project_id"]), str(job["talk_id"])
    start, end = float(job["from_s"]), float(job["to_s"])
    work = os.path.join(WORK_DIR, "track-" + pid)

    def fail(msg):
        query("UPDATE face_track_jobs SET status = 'failed', error = %s, updated_at = now() WHERE project_id = %s", (msg[:500], pid))
        log(f"[{pid}] suivi du visage : {msg}")

    try:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        talk = query("SELECT source, video_ref FROM talks WHERE id = %s", (talk_id,), fetch=True)
        if not talk or talk[0]["source"] != "upload":
            return fail("seules les vidéos envoyées sur le site peuvent être analysées")
        if not (0 <= start < end <= start + 600):
            return fail("passage invalide")
        url = s3.generate_presigned_url("get_object", Params={"Bucket": BUCKET, "Key": talk[0]["video_ref"]}, ExpiresIn=3600)
        log(f"[{pid}] suivi du visage : lecture des images ({end - start:.0f} s)")
        paths = faces.extract_frames(url, start, end - start, os.path.join(work, "img"))
        if len(paths) < 2:
            return fail("la vidéo n'a pas d'image à cet endroit")
        last = {"t": 0.0}

        def progress(p):
            if time.time() - last["t"] > 4:
                last["t"] = time.time()
                query("UPDATE face_track_jobs SET progress = %s, updated_at = now() WHERE project_id = %s", (min(95, p), pid))

        samples, w, h = faces.detect(paths, progress=progress, should_stop=lambda: stopping)
        res = track.build_track(samples, w, h, start)
        if not res:
            return fail("Aucun visage repéré dans ce passage : le cadre reste fixe.")
        query("""UPDATE face_track_jobs SET status = 'done', progress = 100, error = NULL, keys = %s, coverage = %s, faces = %s, samples = %s, updated_at = now()
                 WHERE project_id = %s""", (psycopg2.extras.Json(res["keys"]), res["coverage"], res["faces"], res["samples"], pid))
        log(f"[{pid}] suivi du visage : {len(res['keys'])} points clés, visage vu {res['coverage'] * 100:.0f} % du temps")
    except InterruptedError:
        raise Stop()
    except Stop:
        raise
    except Exception as err:  # noqa: BLE001
        fail(f"échec : {err}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


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
         external.clean_description(info.get("description") or "")[:5000], talk_id),
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


def process_archive(job, talk_id, work):
    """archive.org : ffmpeg lit seulement la piste audio depuis l'adresse du fichier, puis Whisper."""
    ident = job["video_ref"]
    name = job.get("external_file")
    if not name:
        log(f"[{talk_id}] lecture des informations archive.org {ident}")
        item = external.archive_item(ident)
        name = item["file"]
        query(
            """UPDATE talks SET external_file = %s, duration_seconds = COALESCE(duration_seconds, %s), external_thumb = COALESCE(external_thumb, %s),
                      description = CASE WHEN description = '' THEN %s ELSE description END WHERE id = %s""",
            (name, item["duration"], item["thumb"], item["description"], talk_id),
        )
    url = external.archive_file_url(ident, name)
    log(f"[{talk_id}] extraction de l'audio depuis archive.org ({name})")
    if not has_audio(url):
        query("UPDATE talks SET transcript_status = 'unavailable' WHERE id = %s", (talk_id,))
        log(f"[{talk_id}] aucune piste audio : transcription ignorée")
        return
    wav = os.path.join(work, "audio.wav")
    extract_audio(url, wav)
    declared = (job["language"] or "").split("-")[0].lower()
    rows, lang = transcribe_wav(talk_id, wav, declared)
    if not rows:
        return no_speech(talk_id)
    store(talk_id, rows, lang, "whisper")


def process(job):
    talk_id = str(job["id"])
    work = os.path.join(WORK_DIR, talk_id)
    try:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        if job["source"] == "upload":
            process_upload(job, talk_id, work)
        elif job["source"] == "archive":
            process_archive(job, talk_id, work)
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
    try:
        query("UPDATE word_align_jobs SET status = 'pending' WHERE status = 'processing'")  # reprend les demandes interrompues (E5c)
    except Exception:  # noqa: BLE001
        pass
    try:
        query("UPDATE face_track_jobs SET status = 'pending' WHERE status = 'processing'")  # reprend les analyses de visage interrompues (E5d)
    except Exception:  # noqa: BLE001
        pass
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
            try:
                job2 = claim_align()
            except Exception as err:  # noqa: BLE001
                log("Erreur base (place des mots) :", err)
                job2 = None
            if job2:
                current = None
                try:
                    process_align(job2)
                except Stop:
                    pass
                continue
            try:
                job3 = claim_track()
            except Exception as err:  # noqa: BLE001
                log("Erreur base (suivi du visage) :", err)
                job3 = None
            if job3:
                current = None
                try:
                    process_track(job3)
                except Stop:
                    pass
                continue
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
