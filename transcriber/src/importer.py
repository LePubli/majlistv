"""Étape Import : copier chez nous une vidéo qui vit ailleurs (YouTube, Vimeo, archive.org, tout autre site ou lien direct).

Ce module contient la logique « pure » (testable sans base ni stockage) :
  - assert_public_url : refuse tout ce qui n'est pas un site public (réseau interne, localhost, métadonnées du cloud…) ;
  - fetch : télécharge la meilleure vidéo qui ne dépasse pas la qualité et la taille permises, avec progression et annulation ;
  - check_video : vérifie avec ffprobe que le fichier est bien une vidéo lisible ;
  - upload : envoie le fichier dans Garage (envoi par morceaux), avec progression et annulation.
La boucle qui prend les demandes dans la base est dans main.py (media_import_loop). La conversion HLS est faite ensuite par le worker.
"""
import ipaddress
import json
import mimetypes
import os
import re
import socket
import subprocess
from urllib.parse import urljoin, urlsplit

import external

NO_TRACK = {"fr": "Cette vidéo ne propose pas de piste audio en français sur sa plateforme d'origine : rien n'a été changé."}
DIRECT_EXT = re.compile(r"\.(mp4|m4v|mov|webm|mkv|ogv|avi|ts)$", re.I)
MAX_REDIRECTS = 5


class Canceled(Exception):
    """La demande a été annulée (depuis Studio → Activité) ou la conférence a été supprimée."""


class Stopped(Canceled):
    """Le service s'arrête (redéploiement) : la demande repart du début au prochain démarrage."""


class TooBig(external.Blocked):
    """La vidéo dépasse la taille maximale permise (Admin → Paramètres)."""


# --- Contrôle des adresses (anti-SSRF) ---------------------------------------------------------------------------------------------
def assert_public_url(url, resolver=socket.getaddrinfo):
    """Lève Blocked si l'adresse n'est pas un site public. Toutes les adresses IP du nom doivent être publiques."""
    try:
        parts = urlsplit(str(url).strip())
    except ValueError as err:
        raise external.Blocked("Adresse invalide.") from err
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise external.Blocked("Seules les adresses http et https sont acceptées.")
    if parts.username or parts.password:
        raise external.Blocked("L'adresse ne doit pas contenir d'identifiant ni de mot de passe.")
    host = parts.hostname
    try:
        found = resolver(host, parts.port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError as err:
        raise external.Blocked(f"Le site « {host} » est introuvable.") from err
    if not found:
        raise external.Blocked(f"Le site « {host} » est introuvable.")
    for item in found:
        ip = ipaddress.ip_address(item[4][0].split("%")[0])
        if getattr(ip, "ipv4_mapped", None):
            ip = ip.ipv4_mapped
        if not ip.is_global:
            raise external.Blocked("Cette adresse n'est pas un site public : import refusé.")
    return str(url).strip()


def looks_direct(url):
    """Le chemin de l'adresse se termine par une extension de fichier vidéo : lien direct vers un fichier."""
    return bool(DIRECT_EXT.search(urlsplit(url).path))


# --- Téléchargement -----------------------------------------------------------------------------------------------------------------
def _largest(work, prefix="media"):
    files = [os.path.join(work, f) for f in os.listdir(work) if f.startswith(prefix + ".") and not f.endswith((".part", ".ytdl", ".txt", ".temp"))]
    return max(files, key=os.path.getsize) if files else None


def format_selector(max_height, audio_lang=None):
    """Meilleure vidéo sous la hauteur permise + meilleur son. Avec `audio_lang` ('fr'), la piste audio de cette langue passe
    d'abord quand la plateforme en propose une (YouTube : pistes doublées) ; sinon la voix d'origine, comme sans l'option."""
    h = int(max_height)
    base = f"bv*[height<={h}]+ba/b[height<={h}]/bv*+ba/b"
    if not audio_lang:
        return base
    lang = re.sub(r"[^a-z]", "", str(audio_lang).lower())[:3]
    # « bv » (vidéo SANS son) et non « bv* » : un format déjà mixé porte la voix d'origine, et yt-dlp n'y ajouterait pas l'autre piste.
    return f"bv[height<={h}]+ba[language^={lang}]/bv+ba[language^={lang}]/{base}" if lang else base


def audio_track_used(info, audio_lang):
    """Langue de la piste audio retenue par yt-dlp si c'est bien celle demandée ('fr'), sinon None (voix d'origine)."""
    if not audio_lang or not isinstance(info, dict):
        return None
    for f in info.get("requested_formats") or [info]:
        if (f.get("acodec") or "none") != "none" and str(f.get("language") or "").lower().split("-")[0] == audio_lang:
            return audio_lang
    return None


def audio_languages(info):
    """Langues des pistes audio proposées par la plateforme, sans doublon (pour le journal)."""
    seen = []
    for f in (info or {}).get("formats") or []:
        lang = str(f.get("language") or "").lower().split("-")[0]
        if lang and (f.get("acodec") or "none") != "none" and lang not in seen:
            seen.append(lang)
    return seen


def download_direct(url, work, max_bytes, on_progress, check=assert_public_url, session=None):
    """Fichier servi tel quel (archive.org, lien .mp4…). Les redirections sont suivies à la main : chaque étape doit rester publique."""
    import requests

    http = session or requests
    current = url
    resp = None
    for _ in range(MAX_REDIRECTS + 1):
        check(current)
        resp = http.get(current, stream=True, allow_redirects=False, timeout=(15, 60), headers={"User-Agent": "MejlissTV/1.0"})
        if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("location"):
            current = urljoin(current, resp.headers["location"])
            resp.close()
            continue
        break
    else:
        raise external.Blocked("Trop de redirections.")
    if resp.status_code != 200:
        status = resp.status_code
        resp.close()
        raise external.Blocked(f"Le site a répondu {status} : fichier introuvable ou accès refusé.")
    ctype = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype.startswith("text/") or ctype in ("application/json", "application/xml"):
        resp.close()
        raise external.Blocked("Cette adresse est une page web, pas un fichier vidéo.")
    total = int(resp.headers.get("content-length") or 0)
    if total and total > max_bytes:
        resp.close()
        raise TooBig(f"La vidéo pèse {round(total / 1024 ** 3, 1)} Go : plus que la limite de {round(max_bytes / 1024 ** 3)} Go.")
    ext = os.path.splitext(urlsplit(current).path)[1].lower()
    path = os.path.join(work, "media" + (ext if DIRECT_EXT.search(ext or "") else ".mp4"))
    done = 0
    with open(path, "wb") as out:
        for chunk in resp.iter_content(1024 * 1024):
            if not chunk:
                continue
            out.write(chunk)
            done += len(chunk)
            if done > max_bytes:
                resp.close()
                raise TooBig(f"La vidéo dépasse la limite de {round(max_bytes / 1024 ** 3)} Go : import arrêté.")
            on_progress(done, total)
    resp.close()
    return path


def download_ytdlp(url, work, opts, max_bytes, max_height, on_progress, check=assert_public_url, audio_lang=None, require_audio=False, report=None, fmt=None):
    """YouTube, Vimeo et tout site connu de yt-dlp (page contenant une vidéo, lien direct, flux HLS…).
    audio_lang : piste audio voulue ('fr') ; require_audio : échec si la plateforme ne l'a pas (vidéo déjà importée : on ne la
    remplace pas pour rien) ; report : dictionnaire rempli avec « audio_used », « audio_langs », « title », « thumb » et « duration » ;
    fmt : sélecteur yt-dlp imposé (Audyn : le son seul)."""
    from yt_dlp import YoutubeDL

    state = {"error": None}

    def hook(d):
        if d.get("status") == "downloading":
            done = int(d.get("downloaded_bytes") or 0)
            total = int(d.get("total_bytes") or d.get("total_bytes_estimate") or 0)
            if done > max_bytes:
                state["error"] = TooBig(f"La vidéo dépasse la limite de {round(max_bytes / 1024 ** 3)} Go : import arrêté.")
                raise state["error"]
            try:
                on_progress(done, total)
            except Canceled as err:
                state["error"] = err
                raise

    o = dict(opts, format=fmt or format_selector(max_height, audio_lang), merge_output_format="mp4", noplaylist=True, progress_hooks=[hook],
             outtmpl=os.path.join(work, "media.%(ext)s"), max_filesize=max_bytes)
    try:
        with YoutubeDL(o) as ydl:
            info = ydl.extract_info(url, download=False)
            if info.get("_type") == "playlist":
                entries = [e for e in (info.get("entries") or []) if e]
                if len(entries) != 1:
                    raise external.Blocked("Cette adresse contient plusieurs vidéos : indiquez l'adresse d'une seule vidéo.")
                info = entries[0]
            # Chaque adresse que yt-dlp va télécharger doit rester publique (la page peut pointer ailleurs).
            urls = [info.get("webpage_url"), info.get("url")] + [f.get("url") for f in (info.get("requested_formats") or [])]
            for u in urls:
                if u and str(u).startswith(("http://", "https://")):
                    check(u)
            used = audio_track_used(info, audio_lang)
            if report is not None:
                report["audio_used"] = used
                report["audio_langs"] = audio_languages(info)
                report["title"] = str(info.get("title") or "")[:200]
                report["thumb"] = external.best_thumbnail(info)
                report["duration"] = info.get("duration")
                report["chapters"] = info.get("chapters") or []  # repères placés par l'auteur (YouTube…)
                report["description"] = external.clean_description(str(info.get("description") or ""))[:5000]
                report["uploader"] = str(info.get("channel") or info.get("uploader") or "")[:200]
            if require_audio and audio_lang and not used:
                raise external.Blocked(NO_TRACK.get(audio_lang, "Cette vidéo ne propose pas la piste audio demandée sur sa plateforme d'origine."))
            ydl.process_ie_result(info, download=True)
    except (Canceled, external.Blocked):
        raise
    except Exception as err:  # noqa: BLE001
        if state["error"]:
            raise state["error"] from err
        raise external.readable_error(err) from err
    path = _largest(work)
    if not path:
        raise RuntimeError("Fichier vidéo introuvable après le téléchargement")
    return path


def archive_ident(url):
    """Identifiant d'un élément archive.org : /details/<id>, /download/<id>/<fichier> ou /embed/<id>."""
    parts = [p for p in urlsplit(url).path.split("/") if p]
    if len(parts) < 2 or parts[0] not in ("details", "download", "embed") or not external.ARCHIVE_ID.match(parts[1]):
        raise external.Blocked("Adresse archive.org non reconnue.")
    return parts[1]


def fetch(job, work, opts, max_bytes, max_height, on_progress, check=assert_public_url, report=None):
    """Télécharge la vidéo de la demande `job` (origin, source_url, archive_file, audio_lang, reimport) dans `work` et renvoie le chemin
    du fichier. `report` (dictionnaire) reçoit « audio_used » : la piste audio demandée a-t-elle été trouvée."""
    origin, url = job["origin"], job["source_url"]
    audio_lang, require = job.get("audio_lang") or None, bool(job.get("reimport"))
    check(url)
    if require and (origin == "archive" or (origin == "web" and looks_direct(url))):
        raise external.Blocked("Cette vidéo vient d'un fichier direct : il n'a qu'une seule piste audio.")
    if origin == "archive":
        ident = archive_ident(url)
        item = external.archive_item(ident, job.get("archive_file"))
        return download_direct(external.archive_file_url(ident, item["file"]), work, max_bytes, on_progress, check=check)
    if origin == "web" and looks_direct(url):
        try:
            return download_direct(url, work, max_bytes, on_progress, check=check)
        except external.Blocked as err:
            if "page web" not in str(err):
                raise
    return download_ytdlp(url, work, opts, max_bytes, max_height, on_progress, check=check, audio_lang=audio_lang, require_audio=require, report=report)


# --- Contrôle du fichier -----------------------------------------------------------------------------------------------------------
def check_video(path):
    """Renvoie { duration, height } ou lève Blocked si le fichier n'est pas une vidéo lisible."""
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height:format=duration",
                              "-of", "json", path], capture_output=True, text=True, timeout=120)
        data = json.loads(out.stdout or "{}")
    except (OSError, ValueError, subprocess.TimeoutExpired) as err:
        raise external.Blocked("Le fichier téléchargé n'est pas une vidéo lisible.") from err
    streams = data.get("streams") or []
    duration = float((data.get("format") or {}).get("duration") or 0)
    if not streams or duration <= 0:
        raise external.Blocked("Le fichier téléchargé n'est pas une vidéo lisible.")
    return {"duration": duration, "height": int(streams[0].get("height") or 0)}


# --- Envoi dans Garage -------------------------------------------------------------------------------------------------------------
def content_type(path):
    return mimetypes.guess_type(path)[0] or "video/mp4"


def upload(s3, bucket, path, key, on_progress):
    """Envoi par morceaux de 64 Mo ; on_progress(envoyé, total) peut lever Canceled pour interrompre l'envoi."""
    from boto3.s3.transfer import TransferConfig

    total = os.path.getsize(path)
    sent = {"n": 0}

    def cb(n):
        sent["n"] += n
        on_progress(sent["n"], total)

    cfg = TransferConfig(multipart_threshold=64 * 1024 * 1024, multipart_chunksize=64 * 1024 * 1024, max_concurrency=2)
    s3.upload_file(path, bucket, key, Config=cfg, ExtraArgs={"ContentType": content_type(path)}, Callback=cb)
    return total
