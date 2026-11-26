"""Shorts autonomes — copie chez nous d'un short YouTube importé (étape A).

L'API crée la ligne dans public_shorts (talk_id vide, copy_status « pending », video_key shorts/<id>.mp4). Ici :
  1. téléchargement (yt-dlp, meilleure vidéo ≤ 1080p avec son, MP4) ; un « short » de plus de 3 min est refusé ;
  2. contrôle du fichier (ffprobe) puis envoi dans Garage (shorts/<id>.mp4) ;
  3. affiche : une image tirée de la vidéo (shorts/<id>.jpg) ;
  4. copy_status « done » : le short devient visible (s'il est publié). Les erreurs sont notées sur le short (copy_error).
Un redéploiement qui interrompt un téléchargement le remet en file (requeue). Trois essais, espacés ; un blocage YouTube ou un fichier
refusé ne se réessaie pas.
"""
import os
import shutil
import subprocess

import psycopg2.extras

import external
import importer

MAX_ATTEMPTS = 3
MAX_BYTES = 300 * 1024 ** 2
MAX_SECONDS = 185


def claim(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            f"""UPDATE public_shorts SET copy_status = 'downloading', copy_attempts = copy_attempts + 1, copy_error = NULL, updated_at = now()
               WHERE id = (SELECT id FROM public_shorts
                           WHERE copy_status = 'pending' AND talk_id IS NULL AND copy_attempts < {MAX_ATTEMPTS}
                             AND updated_at < now() - make_interval(secs => 30 * copy_attempts)
                           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING id, source_url, video_key, copy_attempts"""
        )
        return cur.fetchone()


def requeue_interrupted(conn):
    with conn.cursor() as cur:
        cur.execute("UPDATE public_shorts SET copy_status = 'pending', updated_at = now() WHERE copy_status = 'downloading'")


def make_poster(path, out, at):
    """Une image JPEG tirée de la vidéo (vers 1 s, ou au début si le short est très court). Renvoie True si le fichier existe."""
    try:
        subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-ss", str(at), "-i", path, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", out],
                       capture_output=True, timeout=60, check=True)
    except (OSError, subprocess.SubprocessError):
        return False
    return os.path.exists(out) and os.path.getsize(out) > 100


def run(job, ctx):
    """Une copie. Renvoie « ok », « failed » ou « blocked » (YouTube bloque le serveur : la file se met en pause)."""
    sid = str(job["id"])
    work = os.path.join(ctx.work_dir, "short-" + sid)
    poster_key = f"shorts/{sid}.jpg"

    def q(sql, params=None):
        with ctx.conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount

    def progress(done, total):
        if ctx.stopping():
            raise importer.Stopped()

    try:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        if shutil.disk_usage(work).free < 1024 ** 3:
            raise RuntimeError("Plus assez de place disque sur le serveur de conversion (moins de 1 Go libre)")
        ctx.log(f"[short {sid}] copie de {job['source_url']}")
        path = importer.download_ytdlp(job["source_url"], work, ctx.options(work), MAX_BYTES, 1080, progress)
        info = importer.check_video(path)
        if info["duration"] > MAX_SECONDS:
            raise external.Blocked(f"Cette vidéo dure {round(info['duration'])} s : ce n'est pas un short (3 minutes au plus).")
        size = os.path.getsize(path)
        importer.upload(ctx.s3, ctx.bucket, path, job["video_key"], progress)
        poster = os.path.join(work, "poster.jpg")
        has_poster = make_poster(path, poster, 1 if info["duration"] > 2 else 0)
        if has_poster:
            ctx.s3.upload_file(poster, ctx.bucket, poster_key, ExtraArgs={"ContentType": "image/jpeg"})
        ok = q("UPDATE public_shorts SET copy_status = 'done', copy_error = NULL, duration_s = %s, bytes = %s, poster_key = %s, updated_at = now() "
               "WHERE id = %s AND copy_status = 'downloading'", (round(info["duration"], 2), size, poster_key if has_poster else None, sid))
        if not ok:  # supprimé pendant la copie
            for key in (job["video_key"], poster_key):
                try:
                    ctx.s3.delete_object(Bucket=ctx.bucket, Key=key)
                except Exception:  # noqa: BLE001
                    pass
        ctx.log(f"[short {sid}] copié : {round(size / 1024 ** 2, 1)} Mo, {round(info['duration'])} s")
        return "ok"
    except importer.Stopped:
        q("UPDATE public_shorts SET copy_status = 'pending', copy_attempts = GREATEST(copy_attempts - 1, 0), updated_at = now() WHERE id = %s AND copy_status = 'downloading'", (sid,))
        return "failed"
    except Exception as err:  # noqa: BLE001
        blocked = isinstance(err, external.Blocked)
        final = job["copy_attempts"] >= MAX_ATTEMPTS or blocked
        message = str(err)[:600]
        ctx.log(f"[short {sid}] échec ({job['copy_attempts']}/{MAX_ATTEMPTS}) : {message}")
        try:
            ctx.s3.delete_object(Bucket=ctx.bucket, Key=job["video_key"])
        except Exception:  # noqa: BLE001
            pass
        q("UPDATE public_shorts SET copy_status = %s, copy_error = %s, updated_at = now() WHERE id = %s AND copy_status = 'downloading'",
          ("failed" if final else "pending", message, sid))
        return "blocked" if external.is_bot_block(err) else "failed"
    finally:
        shutil.rmtree(work, ignore_errors=True)
