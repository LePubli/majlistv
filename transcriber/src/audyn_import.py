"""Audyn — import du son d'une vidéo comme chapitre (YouTube, archive.org, Vimeo, Dailymotion, autre site, lien direct).

Une demande (table audyn_imports, ouverte par l'API : POST /studio/audyn/:id/link-imports) est traitée ici :
  1. playlist YouTube / Vimeo, ou élément archive.org à plusieurs fichiers audio : découpée en demandes « filles », une par vidéo /
     fichier, dans l'ordre (50 au plus) ; la demande « mère » est close avec le nombre de demandes ajoutées ;
  2. sinon : téléchargement du SON SEUL (yt-dlp « meilleur son », voix française d'abord si demandée ; archive.org : le fichier audio,
     sinon la vidéo ; lien direct : le fichier), conversion en MP3 128 kb/s (lisible partout, aperçu gratuit coupé sans problème),
     envoi dans le stockage, chapitre ajouté à la fin du contenu, attestation notée dans le journal des droits ;
  2 bis. chapitres de la vidéo (repères placés par l'auteur sur YouTube) : si la demande le veut (split) et qu'il y en a au moins 2,
     le son est découpé en un MP3 par chapitre, chacun devient un chapitre Audyn (titre de l'auteur ; dans une playlist,
     « titre de la vidéo — titre du chapitre »). Repères de moins de 3 s : rattachés au précédent.
     « Redécouper » (replace_chapter) : un chapitre Audyn déjà importé est remplacé, à sa place, par les morceaux ; si la vidéo
     n'a pas de chapitres, la demande s'arrête AVANT de télécharger et rien ne change.
  3. couverture : l'image de la vidéo, mise au carré SANS rien couper (image entière centrée sur un fond flou de la même image).
     « auto » : seulement si le contenu n'a pas de couverture ; « replace » : remplace l'ancienne (bouton du Studio).
Toutes les adresses suivies passent par le contrôle anti-SSRF (importer.assert_public_url). Les erreurs sont notées sur la demande.
"""
import os
import re
import shutil
import subprocess
import time
import uuid
from urllib.parse import parse_qs, urlsplit

import psycopg2.extras

import external
import importer

MAX_ATTEMPTS = 3
BLOCK_PAUSE = 15 * 60        # YouTube bloque le serveur : file Audyn en pause 15 min (cf. run)
LIST_LIMIT = 50              # playlist ou élément archive.org : 50 chapitres au plus par demande
BITRATE = "128k"             # MP3 : parole et musique d'accompagnement, ~58 Mo par heure
COVER_SIZE = 1000            # couverture carrée 1000 × 1000
IMAGE_MAX = 15 * 1024 ** 2   # image de la vidéo : 15 Mo au plus
AUDIO_EXT = re.compile(r"\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)$", re.I)
EXT_ORDER = ["mp3", "m4a", "aac", "ogg", "oga", "opus", "flac", "wav"]
MIN_PART = 3.0               # secondes : un repère plus court est rattaché au chapitre précédent
FORMAT_ORDER = ["vbr mp3", "128kbps mp3", "64kbps mp3"]


class ItemGone(Exception):
    """Le contenu Audyn a été supprimé pendant le traitement."""


# --- Règles pures (testées sans réseau) --------------------------------------------------------------------------------------------
def audio_selector(audio_lang=None):
    """Sélecteur yt-dlp du son seul. Avec une langue ('fr') : la piste de cette langue d'abord (YouTube : pistes doublées), sinon le
    meilleur son, sinon le meilleur format complet (sites sans piste audio séparée : le son est extrait ensuite)."""
    lang = re.sub(r"[^a-z]", "", str(audio_lang or "").lower())[:3]
    return f"ba[language^={lang}]/ba/b" if lang else "ba/b"


def is_list_url(url):
    """Adresse d'une LISTE de vidéos (playlist ou chaîne YouTube, showcase / album / chaîne Vimeo), sans vidéo précise.
    Une vidéo ouverte depuis une playlist (watch?v=…&list=…) reste une seule vidéo."""
    u = urlsplit(str(url or "").strip())
    host = re.sub(r"^(www|m|music)\.", "", (u.hostname or "").lower())
    path = u.path or "/"
    q = parse_qs(u.query)
    if host == "youtube.com":
        if "v" in q:
            return False
        if path.rstrip("/") == "/playlist":
            return bool(q.get("list"))
        return bool(re.match(r"^/(@[^/]+|channel/[^/]+|c/[^/]+|user/[^/]+)(/(videos|streams|podcasts|featured))?/?$", path))
    if host == "vimeo.com":
        return bool(re.match(r"^/(showcase|album|channels)/[^/]+", path))
    return False


def entry_url(e):
    """Adresse d'une vidéo listée par external.list_videos ({source, id, …}), ou None."""
    src, vid = e.get("source"), str(e.get("id") or "")
    if src == "youtube":
        return f"https://www.youtube.com/watch?v={vid}"
    if src == "vimeo":
        return f"https://vimeo.com/{vid}"
    if src == "dailymotion":
        return f"https://www.dailymotion.com/video/{vid}"
    return None


def plan_parts(chapters, duration, min_len=MIN_PART):
    """Chapitres de la vidéo -> morceaux [{start, end, title}] couvrant le son du début à la fin, dans l'ordre.
    Fin manquante : début du suivant (ou fin du son) ; repère trop court : rattaché au précédent (le premier : au suivant).
    Moins de 2 morceaux : liste vide (pas de découpage)."""
    try:
        total = float(duration or 0)
    except (TypeError, ValueError):
        total = 0.0
    marks = []
    for c in chapters or []:
        try:
            start = max(0.0, float(c.get("start_time") or 0))
        except (TypeError, ValueError):
            continue
        if total and start >= total:
            continue
        marks.append({"start": start, "end": c.get("end_time"), "title": str(c.get("title") or "").strip()[:200]})
    marks.sort(key=lambda m: m["start"])
    dedup = []
    for m in marks:
        if dedup and abs(m["start"] - dedup[-1]["start"]) < 0.001:
            continue
        dedup.append(m)
    if not dedup:
        return []
    dedup[0]["start"] = 0.0  # le son avant le premier repère appartient au premier chapitre
    parts = []
    for i, m in enumerate(dedup):
        nxt = dedup[i + 1]["start"] if i + 1 < len(dedup) else (total or None)
        end = nxt if nxt is not None else m["end"]
        try:
            end = float(end)
        except (TypeError, ValueError):
            return []  # fin inconnue : on ne découpe pas au hasard
        if total:
            end = min(end, total)
        if end > m["start"]:
            parts.append({"start": m["start"], "end": end, "title": m["title"]})
    merged = []
    for p in parts:
        if merged and p["end"] - p["start"] < min_len:
            merged[-1]["end"] = p["end"]
        else:
            merged.append(dict(p))
    if len(merged) > 1 and merged[0]["end"] - merged[0]["start"] < min_len:
        first = merged.pop(0)
        merged[0]["start"] = first["start"]
    return merged if len(merged) >= 2 else []


def part_title(job, part, index):
    """Titre d'un morceau : celui de l'auteur ; dans une playlist, précédé du titre de la vidéo."""
    video = (job.get("title") or "").strip()
    own = (part.get("title") or "").strip() or f"Partie {index}"
    return (f"{video} — {own}" if video and job.get("parent_id") else own)[:200]


def _natural(name):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", name)]


def pick_archive_audio(files):
    """Fichiers audio d'un élément archive.org, une seule version de chaque piste, dans l'ordre des pistes.
    archive.org garde l'original et des copies converties (« derivative ») : on prend les originaux s'il y en a, dans le format le plus
    courant (MP3 d'abord) ; sinon les copies, dans un seul format (VBR MP3, puis 128 kb/s, puis 64 kb/s)."""
    audio = [f for f in files or [] if f.get("name") and AUDIO_EXT.search(f["name"])]
    if not audio:
        return []
    originals = [f for f in audio if f.get("source") == "original"]
    group = originals or audio
    exts = {}
    for f in group:
        exts.setdefault(f["name"].rsplit(".", 1)[-1].lower(), []).append(f)
    ext = next((e for e in EXT_ORDER if e in exts), None) or max(exts, key=lambda k: len(exts[k]))
    group = exts[ext]
    fmts = {}
    for f in group:
        fmts.setdefault(str(f.get("format") or "").lower(), []).append(f)
    if len(fmts) > 1:
        def rank(k):
            pref = FORMAT_ORDER.index(k) if k in FORMAT_ORDER else len(FORMAT_ORDER)
            return (-len(fmts[k]), pref)
        group = fmts[sorted(fmts, key=rank)[0]]
    return sorted(group, key=lambda f: _natural(f["name"]))


def file_title(f):
    t = str(f.get("title") or "").strip()
    if t:
        return t[:200]
    stem = os.path.splitext(os.path.basename(f.get("name") or ""))[0]
    return re.sub(r"[_]+", " ", stem).strip()[:200] or "Chapitre"


# --- Fichiers : son et image (ffmpeg) ----------------------------------------------------------------------------------------------
def probe(path):
    """{ audio: bool, duration: secondes } d'un fichier (ffprobe)."""
    import json

    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", path],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise external.Blocked("Fichier illisible : ce n'est ni un son ni une vidéo.")
    data = json.loads(out.stdout or "{}")
    try:
        duration = float((data.get("format") or {}).get("duration") or 0)
    except ValueError:
        duration = 0.0
    return {"audio": any(s.get("codec_type") == "audio" for s in data.get("streams") or []), "duration": duration}


def to_mp3(src, dst, start=None, end=None, checked=False):
    """Son seul en MP3 128 kb/s, 44,1 kHz, stéréo au plus (de `start` à `end` secondes si donnés). Renvoie la durée en secondes.
    Lève Blocked s'il n'y a pas de son (checked : déjà vérifié par l'appelant)."""
    if not checked and not probe(src)["audio"]:
        raise external.Blocked("Cette vidéo ne contient pas de son.")
    cut = (["-ss", f"{float(start):.3f}"] if start else []) + (["-to", f"{float(end):.3f}"] if end else [])
    cmd = ["ffmpeg", "-nostdin", "-y", "-v", "error", *cut, "-i", src, "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1",
           "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", "44100", "-ac", "2", "-id3v2_version", "3", dst]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=4 * 3600)
    if out.returncode != 0 or not os.path.exists(dst) or os.path.getsize(dst) == 0:
        raise RuntimeError("Conversion du son en MP3 impossible : " + (out.stderr or "").strip()[-300:])
    return probe(dst)["duration"]


def square_cover(src, dst, size=COVER_SIZE):
    """Image carrée sans rien couper : l'image entière, centrée, sur un fond fait de la même image agrandie et floutée."""
    s = int(size)
    graph = (f"[0:v]scale={s}:{s}:force_original_aspect_ratio=increase,crop={s}:{s},boxblur=luma_radius=40:luma_power=2,"
             f"eq=brightness=-0.06[bg];[0:v]scale={s}:{s}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];"
             f"[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuvj420p")
    out = subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", src, "-filter_complex", graph, "-frames:v", "1", "-q:v", "3", dst],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError("Image de la vidéo illisible : " + (out.stderr or "").strip()[-300:])
    return dst


# --- Téléchargement ----------------------------------------------------------------------------------------------------------------
def archive_audio(identifier):
    """Élément archive.org -> { title, files: [{name, title}] } : fichiers audio (une version par piste), sinon la meilleure vidéo."""
    if not external.ARCHIVE_ID.match(identifier or ""):
        raise external.Blocked("Identifiant archive.org invalide.")
    data = external._archive_get(f"/metadata/{identifier}")
    md = data.get("metadata") or {}
    if not md:
        raise external.Blocked("Élément introuvable sur archive.org.")
    if str(md.get("access-restricted-item")) == "true" or data.get("is_dark"):
        raise external.Blocked("Élément en accès restreint sur archive.org (prêt uniquement).")
    title = str(md.get("title") or "")[:200]
    desc = md.get("description") or ""
    desc = "\n".join(desc) if isinstance(desc, list) else str(desc)
    desc = external.clean_description(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>|</?p[^>]*>", "\n", desc, flags=re.I)))[:5000]
    creator = md.get("creator") or ""
    creator = (", ".join(creator) if isinstance(creator, list) else str(creator))[:200]
    files = pick_archive_audio(data.get("files"))
    if files:
        return {"title": title, "description": desc, "author": creator, "files": [{"name": f["name"], "title": file_title(f)} for f in files]}
    video = external.archive_item(identifier)  # pas de son seul : la vidéo, dont on gardera le son
    return {"title": title, "description": desc, "author": creator, "files": [{"name": video["file"], "title": title or file_title({"name": video["file"]})}]}


def fetch_audio(job, work, opts, max_bytes, on_progress, check, report):
    """Télécharge ce qu'il faut pour avoir le son de la demande. Renvoie le chemin du fichier (son ou vidéo)."""
    origin, url = job["origin"], job["source_url"]
    check(url)
    if origin == "archive":
        ident = importer.archive_ident(url)
        report.setdefault("thumb", f"{external.ARCHIVE_BASE}/services/img/{ident}")
        name = job.get("archive_file") or archive_audio(ident)["files"][0]["name"]
        return importer.download_direct(external.archive_file_url(ident, name), work, max_bytes, on_progress, check=check)
    if origin == "web" and (importer.looks_direct(url) or AUDIO_EXT.search(urlsplit(url).path or "")):
        try:
            return importer.download_direct(url, work, max_bytes, on_progress, check=check)
        except external.Blocked as err:
            if "page web" not in str(err):
                raise
    return importer.download_ytdlp(url, work, opts, max_bytes, 720, on_progress, check=check, audio_lang=job.get("audio_lang"),
                                   report=report, fmt=audio_selector(job.get("audio_lang")))


def video_chapters(job, opts):
    """Chapitres de la vidéo lus sur la plateforme, sans rien télécharger (« Redécouper » : vérifié avant le téléchargement)."""
    if job["origin"] == "archive" or (job["origin"] == "web" and (importer.looks_direct(job["source_url"]) or AUDIO_EXT.search(urlsplit(job["source_url"]).path or ""))):
        return [], 0
    info = external.fetch_info(job["source_url"], dict(opts, noplaylist=True))
    return info.get("chapters") or [], info.get("duration") or 0


def find_thumbnail(job, report, opts):
    """Adresse de l'image de la vidéo : celle lue pendant le téléchargement, sinon celle de la plateforme (sans télécharger la vidéo)."""
    if report.get("thumb"):
        return report["thumb"]
    url, origin = job["source_url"], job["origin"]
    if origin == "archive":
        return f"{external.ARCHIVE_BASE}/services/img/{importer.archive_ident(url)}"
    if origin == "web" and (importer.looks_direct(url) or AUDIO_EXT.search(urlsplit(url).path or "")):
        return None  # fichier brut : pas d'image
    info = external.fetch_info(url, dict(opts, noplaylist=True))
    if info.get("_type") == "playlist":
        entries = [e for e in info.get("entries") or [] if e]
        info = entries[0] if entries else {}
    return external.best_thumbnail(info)


# --- Base de données ---------------------------------------------------------------------------------------------------------------
class Ctx:
    """Tout ce dont une demande a besoin : connexion (autocommit), stockage, réglages, journal, contrôle des adresses."""

    def __init__(self, conn, s3, bucket, opts, conf, log, stopping, work_dir, check=importer.assert_public_url):
        self.conn, self.s3, self.bucket, self.opts, self.conf = conn, s3, bucket, opts, conf
        self.log, self.stopping, self.work_dir, self.check = log, stopping, work_dir, check

    def q(self, sql, params=None, fetch=False):
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchall() if fetch else cur.rowcount

    def tx(self, fn):
        """Exécute fn(cur) dans une transaction (la connexion repasse ensuite en autocommit)."""
        self.conn.autocommit = False
        try:
            with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                result = fn(cur)
            self.conn.commit()
            return result
        except Exception:
            self.conn.rollback()
            raise
        finally:
            self.conn.autocommit = True

    def drop(self, keys):
        for k in keys:
            try:
                self.s3.delete_object(Bucket=self.bucket, Key=k)
            except Exception:  # noqa: BLE001
                pass


def claim(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            f"""UPDATE audyn_imports SET status = 'downloading', progress = 0, error = NULL, attempts = attempts + 1, updated_at = now()
               WHERE id = (SELECT id FROM audyn_imports
                           WHERE status = 'pending' AND NOT cancel_requested AND attempts < {MAX_ATTEMPTS}
                             AND updated_at < now() - make_interval(secs => 30 * attempts)
                           ORDER BY created_at, seq LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING *"""
        )
        return cur.fetchone()


def requeue_interrupted(conn):
    """Au démarrage : une demande interrompue par un redéploiement repart du début."""
    with conn.cursor() as cur:
        cur.execute("UPDATE audyn_imports SET status = 'pending', progress = 0, updated_at = now() WHERE status = 'downloading'")


def expand(job, ctx, opts):
    """Playlist / élément archive.org à plusieurs fichiers : crée les demandes filles et clôt la demande. Renvoie leur nombre, ou None
    s'il n'y a qu'une vidéo (la demande continue alors elle-même ; archive.org : le fichier et son titre sont notés sur la demande)."""
    url, origin = job["source_url"], job["origin"]
    if origin == "archive" and not job.get("archive_file"):
        ident = importer.archive_ident(url)
        info = archive_audio(ident)
        files = info["files"]
        if len(files) == 1:
            job["archive_file"] = files[0]["name"]
            job["title"] = job.get("title") or info["title"] or files[0]["title"]
            ctx.q("UPDATE audyn_imports SET archive_file = %s, title = %s WHERE id = %s", (job["archive_file"], job["title"][:200], job["id"]))
            return None
        children = [{"url": url, "origin": "archive", "file": f["name"], "title": f["title"]} for f in files[:LIST_LIMIT]]
        label = info["title"]
    elif is_list_url(url):
        label, entries = external.list_videos(url, opts, LIST_LIMIT)
        children = [{"url": entry_url(e), "origin": e["source"], "file": None, "title": e.get("title") or ""} for e in entries if entry_url(e)]
        if not children:
            raise external.Blocked("Aucune vidéo trouvée à cette adresse.")
    else:
        return None

    def write(cur):
        cur.execute("SELECT 1 FROM audyn_imports WHERE id = %s AND status = 'downloading' AND NOT cancel_requested FOR UPDATE", (job["id"],))
        if not cur.fetchone():
            raise importer.Canceled()
        for i, c in enumerate(children):
            cur.execute(
                """INSERT INTO audyn_imports(item_id, parent_id, seq, kind, source_url, origin, archive_file, title, audio_lang, cover,
                                             requested_by, requested_by_name)
                   VALUES (%s, %s, %s, 'audio', %s, %s, %s, %s, %s, %s, %s, %s)""",
                (job["item_id"], job["id"], i + 1, c["url"], c["origin"], c["file"], (c["title"] or "")[:200], job.get("audio_lang"),
                 job["cover"] if i == 0 else "none", job.get("requested_by"), job.get("requested_by_name") or ""))
        cur.execute("""UPDATE audyn_imports SET status = 'done', progress = 100, added = %s, title = CASE WHEN title = '' THEN %s ELSE title END,
                              finished_at = now(), updated_at = now() WHERE id = %s""", (len(children), (label or "")[:200], job["id"]))

    ctx.tx(write)
    ctx.log(f"[audyn {job['id']}] {len(children)} demande(s) ajoutée(s) à la file ({origin})")
    return len(children)


def apply_cover(job, ctx, thumb, work):
    """Pose l'image de la vidéo comme couverture (selon job['cover']). Renvoie une remarque pour la demande, ou None."""
    if not thumb:
        return "Pas d'image pour cette vidéo : couverture inchangée."
    item = ctx.q("SELECT cover_key FROM audyn_items WHERE id = %s", (job["item_id"],), fetch=True)
    if not item:
        raise ItemGone()
    if job["cover"] == "auto" and item[0]["cover_key"]:
        return None  # le contenu a déjà une couverture : on n'y touche pas
    folder = os.path.join(work, "cover")
    os.makedirs(folder, exist_ok=True)
    src = importer.download_direct(thumb, folder, IMAGE_MAX, lambda d, t: None, check=ctx.check)
    jpg = square_cover(src, os.path.join(work, "cover.jpg"))
    key = f"audyn/{job['item_id']}/cover-{uuid.uuid4()}.jpg"
    importer.upload(ctx.s3, ctx.bucket, jpg, key, lambda d, t: None)
    if job["cover"] == "auto":
        done = ctx.q("UPDATE audyn_items SET cover_key = %s, updated_at = now() WHERE id = %s AND cover_key IS NULL RETURNING id", (key, job["item_id"]), fetch=True)
        if not done:
            ctx.drop([key])  # une couverture a été posée entre-temps
        return None

    def swap(cur):
        cur.execute("SELECT cover_key FROM audyn_items WHERE id = %s FOR UPDATE", (job["item_id"],))
        row = cur.fetchone()
        if not row:
            raise ItemGone()
        cur.execute("UPDATE audyn_items SET cover_key = %s, updated_at = now() WHERE id = %s", (key, job["item_id"]))
        return row["cover_key"]

    try:
        old = ctx.tx(swap)
    except ItemGone:
        ctx.drop([key])
        raise
    if old and old != key:
        ctx.drop([old])
    return None


class ChapterGone(Exception):
    """« Redécouper » : le chapitre à remplacer a été supprimé entre-temps."""


def video_meta(job, report):
    """Auteur (nom de la chaîne) et description de la vidéo, pour un contenu créé depuis une chaîne ou une playlist."""
    if job["origin"] == "archive":
        try:
            info = archive_audio(importer.archive_ident(job["source_url"]))
            return {"author": info.get("author") or "", "description": info.get("description") or ""}
        except Exception:  # noqa: BLE001 — les informations sont un plus : leur absence ne fait pas échouer la demande
            return {"author": "", "description": ""}
    return {"author": report.get("uploader") or "", "description": report.get("description") or ""}


def finish_item(job, ctx, report):
    """Auteur et description du contenu remplis avec ceux de la vidéo s'ils sont vides : contenu créé pour cette vidéo (import d'une
    chaîne), ou son ajouté depuis un seul lien (création depuis un lien, « Ajouter depuis un lien »). Pas pour « Redécouper » ni pour
    les vidéos d'une playlist ajoutée à un contenu (la description d'un épisode ne décrit pas le contenu). Publié si demandé."""
    if job.get("fill_meta") or (not job.get("parent_id") and not job.get("replace_chapter")):
        m = video_meta(job, report)
        ctx.q("""UPDATE audyn_items SET author = CASE WHEN author = '' THEN %s ELSE author END,
                                        description = CASE WHEN description = '' THEN %s ELSE description END, updated_at = now()
                 WHERE id = %s""", (re.sub(r"\s+", " ", m["author"]).strip()[:200], (m["description"] or "")[:4000], job["item_id"]))
    if job.get("publish"):
        ctx.q("""UPDATE audyn_items SET status = 'published', updated_at = now()
                 WHERE id = %s AND status = 'draft' AND title <> '' AND EXISTS (SELECT 1 FROM audyn_chapters c WHERE c.item_id = audyn_items.id)""", (job["item_id"],))


def add_chapters(job, ctx, files, audio_used):
    """Chapitres ajoutés (à la fin du contenu, ou à la place du chapitre à redécouper), attestations notées, demande close : tout ou
    rien. files = [{key, size, duration, title}]. Renvoie (premier chapitre, clé du fichier remplacé ou None)."""
    def write(cur):
        cur.execute("SELECT id, title FROM audyn_items WHERE id = %s FOR UPDATE", (job["item_id"],))
        item = cur.fetchone()
        if not item:
            raise ItemGone()
        cur.execute("SELECT 1 FROM audyn_imports WHERE id = %s AND status = 'downloading' AND NOT cancel_requested FOR UPDATE", (job["id"],))
        if not cur.fetchone():
            raise importer.Canceled()
        old_key = None
        if job.get("replace_chapter"):
            cur.execute("SELECT position, audio_key FROM audyn_chapters WHERE id = %s AND item_id = %s", (job["replace_chapter"], job["item_id"]))
            old = cur.fetchone()
            if not old:
                raise ChapterGone()
            pos, old_key = old["position"], old["audio_key"]
            cur.execute("DELETE FROM audyn_chapters WHERE id = %s", (job["replace_chapter"],))
            # Les chapitres suivants reculent pour faire la place (contrainte d'unicité différée : vérifiée à la fin).
            cur.execute("UPDATE audyn_chapters SET position = position + %s WHERE item_id = %s AND position > %s", (len(files) - 1, job["item_id"], pos))
        else:
            cur.execute("SELECT COALESCE(max(position), 0) + 1 AS p FROM audyn_chapters WHERE item_id = %s", (job["item_id"],))
            pos = cur.fetchone()["p"]
        ids = []
        for i, f in enumerate(files):
            cur.execute(
                """INSERT INTO audyn_chapters(item_id, position, title, audio_key, content_type, size, duration_seconds, source_url)
                   VALUES (%s, %s, %s, %s, 'audio/mpeg', %s, %s, %s) RETURNING id""",
                (job["item_id"], pos + i, f["title"], f["key"], f["size"], int(round(f["duration"] or 0)), job["source_url"]))
            ids.append(cur.fetchone()["id"])
            cur.execute(
                """INSERT INTO audyn_rights_log(item_id, item_title, chapter_id, filename, size, user_id, user_label, source_url)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (job["item_id"], item["title"], ids[-1], f["title"], f["size"], job.get("requested_by"), job.get("requested_by_name") or "", job["source_url"]))
        cur.execute("UPDATE audyn_items SET updated_at = now() WHERE id = %s", (job["item_id"],))
        title = job.get("title") or files[0]["title"]
        cur.execute("""UPDATE audyn_imports SET status = 'done', progress = 100, chapter_id = %s, audio_used = %s, title = %s, parts = %s,
                              finished_at = now(), updated_at = now() WHERE id = %s""", (ids[0], audio_used, title[:200], len(files), job["id"]))
        return ids[0], old_key

    return ctx.tx(write)


# --- Une demande -------------------------------------------------------------------------------------------------------------------
def run(job, ctx):
    """Traite une demande déjà prise (status 'downloading'). Ne lève jamais : le résultat est noté sur la demande."""
    jid = str(job["id"])
    work = os.path.join(ctx.work_dir, "audyn-" + jid)
    last = {"t": 0.0}
    uploaded = []
    max_bytes = max(1, ctx.conf.get_int("import_max_gb", "IMPORT_MAX_GB", 8)) * 1024 ** 3
    max_mb = max(5, ctx.conf.get_int("mod_audyn_max_mb", None, 500))

    def touch(base, span):
        def cb(done, total):
            if ctx.stopping():
                raise importer.Stopped()
            now = time.time()
            if now - last["t"] < 3:
                return
            last["t"] = now
            pct = base + (min(1.0, done / total) * span if total else 0)
            rows = ctx.q("UPDATE audyn_imports SET progress = %s, updated_at = now() WHERE id = %s AND status = 'downloading' RETURNING cancel_requested",
                         (int(min(99, pct)), job["id"]), fetch=True)
            if not rows or rows[0]["cancel_requested"]:
                raise importer.Canceled()
        return cb

    try:
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work)
        if shutil.disk_usage(work).free < 1024 ** 3:
            raise RuntimeError("Plus assez de place disque sur le serveur (moins de 1 Go libre)")
        opts = ctx.opts(work)
        # Titre, chapitres et description dans la langue du contenu (français d'origine) : sinon YouTube répond au serveur en anglais.
        with ctx.conn.cursor() as cur:
            cur.execute("SELECT language FROM audyn_items WHERE id = %s", (job["item_id"],))
            row = cur.fetchone()
        opts.update(external.metadata_language_options((row[0] if row else None) or "fr"))
        ctx.log(f"[audyn {jid}] {job['kind']} ({job['origin']}) : {job['source_url']}")
        if job["kind"] == "cover":
            thumb = find_thumbnail(job, {}, opts)
            if not thumb:
                raise external.Blocked("Pas d'image trouvée pour cette vidéo.")
            apply_cover(dict(job, cover="replace"), ctx, thumb, work)
            ctx.q("UPDATE audyn_imports SET status = 'done', progress = 100, finished_at = now(), updated_at = now() WHERE id = %s AND status = 'downloading'", (job["id"],))
            ctx.log(f"[audyn {jid}] couverture remplacée par l'image de la vidéo")
            return
        replacing = bool(job.get("replace_chapter"))
        if replacing:
            # « Redécouper » : on vérifie les chapitres AVANT de télécharger (une vidéo de 2 h pour rien, sinon).
            marks, total = video_chapters(job, opts)
            if not plan_parts(marks, total or 10 ** 7):
                raise external.Blocked("Cette vidéo n'a pas de chapitres sur sa plateforme : rien n'a été changé.")
        elif not job.get("parent_id") and expand(job, ctx, opts) is not None:
            return
        report = {}
        src = fetch_audio(job, work, opts, max_bytes, touch(0, 70), ctx.check, report)
        if job.get("audio_lang"):
            ctx.log(f"[audyn {jid}] piste audio demandée : {job['audio_lang']} ; proposées : {', '.join(report.get('audio_langs') or []) or 'une seule'} ; "
                    f"retenue : {report.get('audio_used') or 'voix d’origine'}")
        info = probe(src)
        if not info["audio"]:
            raise external.Blocked("Cette vidéo ne contient pas de son.")
        parts = plan_parts(report.get("chapters"), info["duration"] or report.get("duration")) if job.get("split", True) else []
        if replacing and not parts:
            raise external.Blocked("Cette vidéo n'a pas de chapitres sur sa plateforme : rien n'a été changé.")
        if not job.get("title") and report.get("title") and job.get("parent_id"):
            job["title"] = report["title"]
        if not parts:
            parts = [{"start": None, "end": None, "title": (job.get("title") or report.get("title") or "").strip()[:200] or "Chapitre"}]
            single = True
        else:
            single = False
            ctx.log(f"[audyn {jid}] {len(parts)} chapitres dans la vidéo : un fichier par chapitre")
        files = []
        bump = touch(70, 10)
        for i, p in enumerate(parts, start=1):
            mp3 = os.path.join(work, f"part-{i:03d}.mp3")
            duration = to_mp3(src, mp3, p["start"], p["end"], checked=True)
            size = os.path.getsize(mp3)
            if size > max_mb * 1024 ** 2:
                raise importer.TooBig(f"Le son pèse {round(size / 1024 ** 2)} Mo : plus que la limite de {max_mb} Mo d'un chapitre (Admin → Modules → Audyn).")
            title = p["title"] if single else part_title(job, p, i)
            files.append({"path": mp3, "size": size, "duration": duration, "title": title})
            bump(i, len(parts))
        os.remove(src)
        up = touch(80, 15)
        total_bytes = sum(f["size"] for f in files) or 1
        sent = 0
        for f in files:
            f["key"] = f"audyn/{job['item_id']}/{uuid.uuid4()}.mp3"
            importer.upload(ctx.s3, ctx.bucket, f["path"], f["key"], lambda d, t, base=sent: up(base + d, total_bytes))
            uploaded.append(f["key"])
            sent += f["size"]
        try:
            _, old_key = add_chapters(job, ctx, files, report.get("audio_used"))
        except ChapterGone:
            ctx.drop(uploaded)
            uploaded.clear()
            ctx.q("""UPDATE audyn_imports SET status = 'failed', progress = 0, error = %s, finished_at = now(), updated_at = now()
                     WHERE id = %s AND status = 'downloading'""", ("Le chapitre à redécouper a été supprimé entre-temps : rien n'a été ajouté.", job["id"]))
            return
        uploaded.clear()
        if old_key:
            ctx.drop([old_key])  # l'ancien long fichier, remplacé par les morceaux
        finish_item(job, ctx, report)
        ctx.log(f"[audyn {jid}] {len(files)} chapitre(s) {'à la place de l’ancien' if replacing else 'ajouté(s)'} : "
                f"{', '.join('« ' + f['title'] + ' »' for f in files[:5])}{'…' if len(files) > 5 else ''}")
        notes = []
        if single and job.get("split", True) and report.get("chapters") is not None and len(report.get("chapters") or []) < 2:
            notes.append("Pas de chapitres sur cette vidéo : un seul fichier.")
        if job["cover"] != "none" and not replacing:
            try:
                note = apply_cover(job, ctx, find_thumbnail(job, report, opts), work)
            except ItemGone:
                note = None
            except Exception as err:  # noqa: BLE001 — la couverture ne fait jamais échouer le chapitre
                note = f"Couverture non récupérée : {str(err)[:200]}"
            if note:
                notes.append(note)
                ctx.log(f"[audyn {jid}] {note}")
        if notes:
            ctx.q("UPDATE audyn_imports SET note = %s WHERE id = %s", (" ".join(notes)[:500], job["id"]))
    except importer.Stopped:
        ctx.drop(uploaded)
        ctx.q("UPDATE audyn_imports SET status = 'pending', progress = 0, attempts = GREATEST(attempts - 1, 0), updated_at = now() WHERE id = %s AND status = 'downloading'", (job["id"],))
    except importer.Canceled:
        ctx.drop(uploaded)
        ctx.q("UPDATE audyn_imports SET status = 'canceled', cancel_requested = false, finished_at = now(), updated_at = now() WHERE id = %s AND status = 'downloading'", (job["id"],))
        ctx.log(f"[audyn {jid}] annulée")
    except ItemGone:
        ctx.drop(uploaded)
        ctx.log(f"[audyn {jid}] contenu supprimé pendant le traitement : fichiers effacés")
    except Exception as err:  # noqa: BLE001
        ctx.drop(uploaded)
        if external.is_bot_block(err):
            # YouTube bloque le serveur (anti-robot) : la demande n'échoue PAS, elle attend (essai non compté) ; toute la file Audyn
            # se met en pause (BLOCK_PAUSE) au lieu d'épuiser les essais de chaque vidéo. Reprise seule (cookies ajoutés, blocage levé).
            ctx.log(f"[audyn {jid}] YouTube bloque le serveur : demande remise en attente, file Audyn en pause {BLOCK_PAUSE // 60} min")
            ctx.q("""UPDATE audyn_imports SET status = 'pending', progress = 0, attempts = GREATEST(attempts - 1, 0), error = %s, updated_at = now()
                     WHERE id = %s AND status = 'downloading'""", (external.BLOCKED_MSG, job["id"]))
            return "blocked"
        final = job["attempts"] >= MAX_ATTEMPTS or isinstance(err, external.Blocked)
        message = str(err)[:800]
        ctx.log(f"[audyn {jid}] échec ({job['attempts']}/{MAX_ATTEMPTS}) : {message}")
        ctx.q("""UPDATE audyn_imports SET status = %s, progress = 0, error = %s, finished_at = CASE WHEN %s THEN now() ELSE NULL END, updated_at = now()
                 WHERE id = %s AND status = 'downloading'""", ("failed" if final else "pending", message, final, job["id"]))
    finally:
        shutil.rmtree(work, ignore_errors=True)
