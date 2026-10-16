"""Service de doublage Mejliss TV (étape D1a).

Prend les demandes de la table dub_jobs (créées depuis Studio → Audio et doublage) :
- « preview » : écoute rapide (60 s par défaut), traitée dès que le service est libre ;
- « full »    : toute la conférence, seulement pendant la plage de nuit (réglable dans Admin → Modules → Doublage français).
Une seule demande à la fois. Pour chaque demande : phrases françaises (transcript_segments, lang = 'fr') → voix de base Piper
→ calage → conversion vers la voix cible par blocs (si une voix cible est choisie) → mélange avec la voix d'origine baissée
(vidéos envoyées) → fichiers AAC dans le stockage → résultat et état de chaque phrase dans la base.
Signe de vie toutes les 30 s (table dub_engine) : le Studio affiche « moteur prêt ».
"""
import os
import shutil
import signal
import sys
import tempfile
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import unquote, urlsplit
from zoneinfo import ZoneInfo

import boto3
import psycopg2
import psycopg2.extras
from botocore.config import Config

import pipeline as pl
from settings import Settings

VERSION = "0.2.0"
TZ = ZoneInfo("Europe/Paris")


def env(key, default=None, required=False):
    value = os.environ.get(key, default)
    if required and not value:
        print(f"Variable manquante : {key}", flush=True)
        sys.exit(1)
    return value


DATABASE_URL = env("DATABASE_URL", required=True)
BUCKET = env("S3_BUCKET", "majlis-videos")
POLL = int(env("POLL_SECONDS", "10"))
WORK_DIR = env("WORK_DIR", "/work")
ENGINE = env("DUB_ENGINE", "real")  # real | fake (tests : sans modèle) | piper (tests : vrai Piper, fausse conversion)
MAX_ATTEMPTS = 2
KEEP_PREVIEWS = 3  # écoutes rapides gardées par conférence (les plus anciennes sont effacées du stockage)

stopping = False
current = None
last_ok = None


def log(*args):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *args, flush=True)


# --- Base de données (même logique que le transcripteur) ---------------------------------------
def conn_params(url):
    u = urlsplit(url)
    return {"host": u.hostname, "port": u.port or 5432, "dbname": unquote(u.path.lstrip("/")),
            "user": unquote(u.username or ""), "password": unquote(u.password or ""), "client_encoding": "UTF8"}


_local = threading.local()


def db():
    c = getattr(_local, "conn", None)
    if c is None or c.closed:
        c = psycopg2.connect(**conn_params(DATABASE_URL))
        c.autocommit = True
        _local.conn = c
    return c


def query(sql, params=None, fetch=False):
    for attempt in (1, 2):
        try:
            with db().cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return cur.fetchall() if fetch else cur.rowcount
        except psycopg2.OperationalError:
            _local.conn = None
            if attempt == 2:
                raise


settings = Settings(query, lambda *a: log(*a))


def setting(key, default):
    return settings.get(f"mod_dubbing_{key}", None, default)


def setting_num(key, default):
    try:
        return float(setting(key, str(default)))
    except ValueError:
        return float(default)


# --- Stockage ----------------------------------------------------------------------------------
s3 = boto3.client(
    "s3", endpoint_url=env("S3_ENDPOINT", required=True), region_name=env("S3_REGION", "garage"),
    aws_access_key_id=env("S3_ACCESS_KEY", required=True), aws_secret_access_key=env("S3_SECRET_KEY", required=True),
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                  request_checksum_calculation="when_required", response_checksum_validation="when_required"),
)


def s3_delete(*keys):
    for k in keys:
        if k:
            try:
                s3.delete_object(Bucket=BUCKET, Key=k)
            except Exception as err:  # noqa: BLE001
                log(f"Suppression impossible de {k} : {err}")


# --- Moteurs (chargés à la demande, gardés en mémoire) -------------------------------------------
_base = None
_vc = None


def threads():
    return max(1, int(setting_num("threads", env("DUB_THREADS", "4"))))


def base_engine():
    global _base
    if _base is None:
        from engines import FakeBase, PiperBase
        _base = FakeBase() if ENGINE == "fake" else PiperBase(log)  # noqa: E501
    return _base


def vc_engine():
    global _vc
    if _vc is None:
        from engines import ChatterboxConverter, FakeVC
        _vc = FakeVC() if ENGINE in ("fake", "piper") else ChatterboxConverter(log, threads())
    return _vc


# --- Signe de vie et page de santé ---------------------------------------------------------------
def heartbeat():
    info = {"engine": ENGINE, "threads": threads(), "job": current, "queueMode": setting("queue_mode", "night"),
            "night": [int(setting_num("night_start", 1)), int(setting_num("night_end", 7))], "lastOk": last_ok,
            "piperVoices": sorted(getattr(_base, "voices", {}) or []), "vcLoaded": _vc is not None}
    query("""INSERT INTO dub_engine(id, last_seen, version, info) VALUES (1, now(), %s, %s)
             ON CONFLICT (id) DO UPDATE SET last_seen = now(), version = EXCLUDED.version, info = EXCLUDED.info""",
          (VERSION, psycopg2.extras.Json(info)))


def heartbeat_loop():
    while not stopping:
        try:
            settings.refresh()
            heartbeat()
        except Exception as err:  # noqa: BLE001
            log("Signe de vie impossible :", err)
        for _ in range(30):
            if stopping:
                return
            time.sleep(1)


class Health(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = ('{"status":"ok","job":"%s","lastOk":"%s"}' % (current or "", last_ok or "")).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


# --- File d'attente ------------------------------------------------------------------------------
def in_night(now=None):
    """Vrai si l'heure de Paris est dans la plage [début, fin) ; la plage peut passer minuit (ex. 22 → 6)."""
    if setting("queue_mode", "night") == "always":
        return True
    h = (now or datetime.now(TZ)).hour
    a, b = int(setting_num("night_start", 1)) % 24, int(setting_num("night_end", 7)) % 24
    if a == b:
        return True
    return a <= h < b if a < b else (h >= a or h < b)


def claim():
    rows = query(
        """UPDATE dub_jobs SET status = 'running', started_at = now(), attempts = attempts + 1, phase = 'download',
                  progress = 0, error = NULL, updated_at = now()
           WHERE id = (SELECT id FROM dub_jobs WHERE status = 'queued' AND NOT cancel_requested AND (kind = 'preview' OR %s)
                       ORDER BY (kind = 'preview') DESC, created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id, talk_id, kind, params, attempts""", (in_night(),), fetch=True)
    return rows[0] if rows else None


class Cancelled(Exception):
    pass


class Job:
    def __init__(self, row):
        self.id, self.talk = str(row["id"]), str(row["talk_id"])
        self.kind, self.p, self.attempts = row["kind"], row["params"], row["attempts"]
        self._checked = 0.0
        self._last_pct = -1
        self._last_write = 0.0

    def progress(self, phase, frac, lo, hi):
        pct = int(lo + (hi - lo) * max(0.0, min(1.0, frac)))
        if pct != self._last_pct and (time.time() - self._last_write > 3 or pct >= hi):
            self._last_pct, self._last_write = pct, time.time()
            query("UPDATE dub_jobs SET phase = %s, progress = %s, updated_at = now() WHERE id = %s", (phase, min(99, pct), self.id))

    def should_stop(self):
        if stopping:
            return True
        if time.time() - self._checked < 5:
            return False
        self._checked = time.time()
        r = query("SELECT cancel_requested FROM dub_jobs WHERE id = %s", (self.id,), fetch=True)
        if not r or r[0]["cancel_requested"]:
            raise Cancelled()
        return False


def load_cues(talk_id):
    rows = query("SELECT idx, start_ms, end_ms, text FROM transcript_segments WHERE talk_id = %s AND lang = 'fr' ORDER BY idx",
                 (talk_id,), fetch=True)
    return [{"idx": r["idx"], "start": r["start_ms"] / 1000, "end": r["end_ms"] / 1000, "text": r["text"] or ""} for r in rows]


def run(job, work):
    p = job.p
    talk = query("SELECT id, source, video_ref, duration_seconds FROM talks WHERE id = %s", (job.talk,), fetch=True)
    if not talk:
        raise RuntimeError("Conférence supprimée")
    talk = talk[0]
    cues_all = load_cues(job.talk)
    cues, window = pl.select_cues(cues_all, job.kind, float(p.get("previewSeconds") or 60))
    if not any(not pl.is_kept(c["text"]) for c in cues):
        raise RuntimeError("Aucune phrase française à doubler")
    offset = window[0] if window else 0.0

    # 1. Voix d'origine (vidéos envoyées seulement : YouTube / Vimeo / archive.org ne sont pas hébergées)
    orig = None
    if talk["source"] == "upload" and talk["video_ref"]:
        job.progress("download", 0, 0, 5)
        src = os.path.join(work, "source")
        s3.download_file(BUCKET, talk["video_ref"], src)
        orig = pl.load_audio(src, offset if window else None, (window[1] - window[0]) if window else None)
        os.remove(src)
    if window:
        total = window[1] - window[0]
    else:
        last = max(c["end"] for c in cues_all)
        total = max(last + 1.0, float(talk["duration_seconds"] or 0), len(orig) / pl.SR if orig is not None else 0)
    n = int(total * pl.SR) + pl.SR // 2

    # 2. Voix de base + calage. Les modèles sont chargés AVANT de mesurer : la vitesse enregistrée (reprise par l'estimation
    #    du Studio) ne compte que le calcul, pas le téléchargement ni le chargement des modèles.
    has_vc = bool(p.get("target"))
    base = base_engine()
    model, speaker = p["base"]["model"], p["base"].get("speaker")
    if hasattr(base, "voice"):
        base.voice(model)
    if has_vc:
        sample = os.path.join(work, "target" + os.path.splitext(p["target"]["sampleKey"])[1])
        s3.download_file(BUCKET, p["target"]["sampleKey"], sample)
        vc = vc_engine()
        vc.set_target(sample, int(p.get("vcSteps") or 3))
    t0 = time.time()
    synth = lambda text: base.synth(text, model, speaker, p)  # noqa: E731
    hi = 45 if has_vc else 90
    placed, report = pl.fit_cues(cues, synth, p, offset=offset, total=total,
                                 on_progress=lambda f: job.progress("voice", f, 5, hi), should_stop=job.should_stop)
    voice_s = time.time() - t0

    # 3. Conversion vers la voix cible, par blocs
    blocks = 0
    if has_vc:
        voice, blocks = pl.convert_blocks(placed, n, vc.convert, float(p.get("vcChunk") or 20),
                                          on_progress=lambda f: job.progress("convert", f, 45, 90), should_stop=job.should_stop)
    else:
        voice = pl.assemble(placed, n)
    voice = pl.normalize(voice)
    compute_s = time.time() - t0

    # 4. Mélange et envoi
    job.progress("mix", 0, 90, 95)
    folder = "previews" if job.kind == "preview" else "tracks"
    keys = {"voiceKey": f"dubbing/{folder}/{job.talk}/{job.id}-voice.m4a"}
    out_voice = os.path.join(work, "voice.m4a")
    pl.encode_m4a(voice, out_voice)
    s3.upload_file(out_voice, BUCKET, keys["voiceKey"], ExtraArgs={"ContentType": "audio/mp4"})
    if orig is not None:
        mixed = pl.mix(voice, orig, pl.duck_gain(n, cues, float(p.get("duck", 15)), offset))
        out_mix = os.path.join(work, "mix.m4a")
        pl.encode_m4a(mixed, out_mix)
        keys["mixKey"] = f"dubbing/{folder}/{job.talk}/{job.id}-mix.m4a"
        s3.upload_file(out_mix, BUCKET, keys["mixKey"], ExtraArgs={"ContentType": "audio/mp4"})
    job.progress("upload", 1, 95, 99)

    speech_s = sum(len(w) for _, w in placed) / pl.SR
    result = {
        **keys, "durationS": round(n / pl.SR, 2), "speechS": round(speech_s, 1), "computeS": round(compute_s, 1),
        "voiceS": round(voice_s, 1), "rtf": round(compute_s / speech_s, 2) if speech_s else None, "blocks": blocks,
        "window": [round(window[0], 2), round(window[1], 2)] if window else None, "segments": report, "summary": pl.summarize(report),
        "engine": ENGINE, "originalMixed": orig is not None,
    }
    return result


def finish_ok(job, result):
    global last_ok
    query("""UPDATE dub_jobs SET status = 'done', progress = 100, phase = '', result = %s, finished_at = now(), updated_at = now()
             WHERE id = %s""", (psycopg2.extras.Json(result), job.id))
    if job.kind == "full":
        old = query("SELECT mix_key, voice_key FROM dub_tracks WHERE talk_id = %s", (job.talk,), fetch=True)
        query("""INSERT INTO dub_tracks(talk_id, job_id, mix_key, voice_key, duration_s) VALUES (%s, %s, %s, %s, %s)
                 ON CONFLICT (talk_id) DO UPDATE SET job_id = EXCLUDED.job_id, mix_key = EXCLUDED.mix_key, voice_key = EXCLUDED.voice_key,
                   duration_s = EXCLUDED.duration_s, created_at = now()""",
              (job.talk, job.id, result.get("mixKey"), result["voiceKey"], result["durationS"]))
        if old:
            s3_delete(old[0]["mix_key"], old[0]["voice_key"])
    else:
        # Écoutes rapides : on garde les plus récentes, on efface les fichiers des autres.
        olds = query("""SELECT id, result FROM dub_jobs WHERE talk_id = %s AND kind = 'preview' AND status = 'done' AND result ? 'voiceKey'
                        ORDER BY finished_at DESC OFFSET %s""", (job.talk, KEEP_PREVIEWS), fetch=True)
        for o in olds:
            s3_delete(o["result"].get("mixKey"), o["result"].get("voiceKey"))
            query("UPDATE dub_jobs SET result = result - 'mixKey' - 'voiceKey' WHERE id = %s", (o["id"],))
    last_ok = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    log(f"[{job.talk}] {job.kind} terminé : {result['speechS']} s de voix en {result['computeS']} s (RTF {result['rtf']}), "
        f"{result['blocks']} blocs, {result['summary']['review']} phrase(s) à revoir")


def process(row):
    global current
    job = Job(row)
    current = job.id
    work = tempfile.mkdtemp(dir=WORK_DIR if os.path.isdir(WORK_DIR) else None)
    log(f"[{job.talk}] {job.kind} : début (tentative {job.attempts})")
    try:
        finish_ok(job, run(job, work))
    except Cancelled:
        query("UPDATE dub_jobs SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = %s", (job.id,))
        log(f"[{job.talk}] annulé")
    except InterruptedError:
        if stopping:  # arrêt du service : la demande repart dans la file, sans compter la tentative
            query("UPDATE dub_jobs SET status = 'queued', attempts = attempts - 1, phase = '', progress = 0, updated_at = now() WHERE id = %s", (job.id,))
        else:
            query("UPDATE dub_jobs SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = %s", (job.id,))
    except Exception as err:  # noqa: BLE001
        final = job.attempts >= MAX_ATTEMPTS
        msg = str(err)[:500] or err.__class__.__name__
        query("""UPDATE dub_jobs SET status = %s, error = %s, phase = '', updated_at = now(), finished_at = CASE WHEN %s THEN now() END
                 WHERE id = %s""", ("failed" if final else "queued", msg, final, job.id))
        log(f"[{job.talk}] échec{' définitif' if final else ' (nouvel essai plus tard)'} : {msg}")
    finally:
        current = None
        shutil.rmtree(work, ignore_errors=True)


def on_signal(*_):
    global stopping
    stopping = True
    log("Arrêt demandé : la demande en cours repartira dans la file")


def main():
    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    os.environ.setdefault("OMP_NUM_THREADS", str(threads()))
    server = HTTPServer(("0.0.0.0", int(env("PORT", "3000"))), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    # Un travail resté « en cours » après un arrêt brutal repart dans la file.
    n = query("UPDATE dub_jobs SET status = 'queued', phase = '', progress = 0, updated_at = now() WHERE status = 'running'")
    if n:
        log(f"{n} demande(s) interrompue(s) remise(s) dans la file")
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    log(f"Service de doublage {VERSION} prêt (moteur : {ENGINE}, {threads()} cœurs, file vérifiée toutes les {POLL} s)")
    while not stopping:
        try:
            settings.refresh()
            row = claim()
        except Exception as err:  # noqa: BLE001  (base indisponible, migration absente…)
            log("File d'attente indisponible :", err)
            row = None
        if row:
            process(row)
            continue
        for _ in range(POLL):
            if stopping:
                break
            time.sleep(1)
    server.shutdown()


if __name__ == "__main__":
    main()
