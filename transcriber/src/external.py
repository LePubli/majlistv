"""Vidéos YouTube / Vimeo : métadonnées, sous-titres, audio et listes (playlists, chaînes) avec yt-dlp.

Utilisé par le transcripteur. Aucune vidéo n'est conservée : seuls le texte (sous-titres) ou, à défaut,
la piste audio sont récupérés le temps de la transcription, puis supprimés.
"""
import html
import json
import os
import re

YOUTUBE_ID = re.compile(r"^[\w-]{11}$")


class Blocked(Exception):
    """La plateforme refuse l'accès depuis le serveur (anti-robot, vidéo privée…) : message lisible pour l'organisateur."""


def video_url(source, ref):
    return f"https://www.youtube.com/watch?v={ref}" if source == "youtube" else f"https://vimeo.com/{ref}"


def ydl_options(work_dir, cookies="", proxy="", extra=None):
    """Options communes. Les cookies (format Netscape) sont écrits dans un fichier temporaire du dossier de travail."""
    opts = {
        "quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
        "socket_timeout": 30, "retries": 3, "extractor_retries": 2, "sleep_interval_requests": 1,
        "outtmpl": os.path.join(work_dir, "%(id)s.%(ext)s"), "paths": {"home": work_dir, "temp": work_dir},
        "cachedir": False,
    }
    if cookies.strip():
        path = os.path.join(work_dir, "cookies.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(cookies.strip() + "\n")
        os.chmod(path, 0o600)
        opts["cookiefile"] = path
    if proxy.strip():
        opts["proxy"] = proxy.strip()
    if extra:
        opts.update(extra)
    return opts


def readable_error(err):
    """Traduit les erreurs yt-dlp les plus courantes en un message compréhensible."""
    msg = str(err)
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low or "http error 429" in low or "too many requests" in low:
        return Blocked("YouTube bloque l'accès depuis le serveur. Ajoutez des cookies ou un proxy dans "
                       "Admin → Paramètres → Vidéos YouTube et Vimeo, puis relancez.")
    if "private video" in low or "video unavailable" in low or "has been removed" in low or "404" in low:
        return Blocked("Vidéo privée, supprimée ou introuvable sur la plateforme.")
    if "members-only" in low or "join this channel" in low or "requires payment" in low:
        return Blocked("Vidéo réservée aux membres ou payante : elle ne peut pas être récupérée.")
    if "age" in low and "confirm your age" in low:
        return Blocked("Vidéo soumise à une vérification d'âge : ajoutez des cookies d'un compte Google.")
    return err


def fetch_info(url, opts):
    from yt_dlp import YoutubeDL  # import tardif : la mise à jour automatique de yt-dlp a lieu au démarrage

    try:
        with YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as err:  # noqa: BLE001
        raise readable_error(err) from err


def best_thumbnail(info):
    thumbs = [t for t in (info.get("thumbnails") or []) if t.get("url")]
    if not thumbs:
        return info.get("thumbnail")
    thumbs.sort(key=lambda t: (t.get("width") or 0) * (t.get("height") or 0) or t.get("preference") or 0)
    good = [t for t in thumbs if (t.get("width") or 0) <= 1280]
    return (good or thumbs)[-1]["url"]


# --- Sous-titres ---------------------------------------------------------------------------------
def _pick_format(formats):
    by_ext = {f.get("ext"): f for f in formats or [] if f.get("url")}
    for ext in ("json3", "vtt", "srv3"):
        if ext in by_ext:
            return by_ext[ext]
    return None


def pick_subtitles(info, lang, allow_auto):
    """Choisit les sous-titres : d'abord ceux de l'auteur dans la langue déclarée, puis (si autorisé) les automatiques.
    Renvoie (genre, code_langue, format) ou None. genre = 'subtitles' | 'auto_captions'."""
    lang = (lang or "").split("-")[0].lower()
    manual = {k: v for k, v in (info.get("subtitles") or {}).items() if k != "live_chat"}

    def match(tracks, keys):
        for k in keys:
            if k in tracks:
                fmt = _pick_format(tracks[k])
                if fmt:
                    return k, fmt
        return None

    if lang:
        found = match(manual, [lang] + sorted(k for k in manual if k.split("-")[0].lower() == lang))
        if found:
            return ("subtitles",) + found
    if allow_auto and lang:
        auto = info.get("automatic_captions") or {}
        # « xx-orig » = reconnaissance vocale dans la langue d'origine ; « xx » seul peut être une traduction automatique.
        found = match(auto, [f"{lang}-orig", lang])
        if found:
            return ("auto_captions",) + found
    return None


def download_text(url, opts):
    from yt_dlp import YoutubeDL

    try:
        with YoutubeDL(opts) as ydl:
            return ydl.urlopen(url).read().decode("utf-8", "replace")
    except Exception as err:  # noqa: BLE001
        raise readable_error(err) from err


_TAG = re.compile(r"<[^>]+>")


def _clean(text):
    text = html.unescape(_TAG.sub("", text or ""))
    text = text.replace("​", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip()


def _ts(value):
    """« 01:02:03.456 » ou « 02:03.456 » -> millisecondes."""
    parts = value.strip().replace(",", ".").split(":")
    secs = float(parts[-1])
    mins = int(parts[-2]) if len(parts) >= 2 else 0
    hours = int(parts[-3]) if len(parts) >= 3 else 0
    return int(round((hours * 3600 + mins * 60 + secs) * 1000))


def parse_vtt(text):
    """WebVTT -> [(début_ms, fin_ms, texte)]. Supprime les répétitions des sous-titres « défilants »."""
    cues = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n").replace("\r", "\n")):
        lines = [l for l in block.split("\n") if l.strip()]
        for i, line in enumerate(lines):
            if "-->" in line:
                start, _, rest = line.partition("-->")
                end = rest.strip().split(" ")[0]
                body = _clean(" ".join(lines[i + 1:]))
                if body:
                    cues.append((_ts(start), _ts(end), body))
                break
    out = []
    for start, end, body in cues:
        if out:
            prev = out[-1][2]
            if body == prev:
                out[-1] = (out[-1][0], max(out[-1][1], end), prev)
                continue
            if body.startswith(prev + " "):  # ligne précédente répétée en tête
                body = body[len(prev):].strip()
        if body:
            out.append((start, end, body))
    return out


def parse_json3(text):
    """Format json3 de YouTube -> [(début_ms, fin_ms, texte)]."""
    data = json.loads(text)
    out = []
    for ev in data.get("events") or []:
        segs = ev.get("segs")
        if not segs or "tStartMs" not in ev:
            continue
        body = _clean("".join(s.get("utf8", "") for s in segs))
        if not body:
            continue
        start = int(ev["tStartMs"])
        end = start + int(ev.get("dDurationMs") or 0)
        out.append((start, end, body))
    # Les sous-titres automatiques se chevauchent : chaque fin est ramenée au début du suivant.
    fixed = []
    for i, (start, end, body) in enumerate(out):
        nxt = out[i + 1][0] if i + 1 < len(out) else end
        fixed.append((start, max(start + 1, min(end, nxt) if nxt > start else end), body))
    return fixed


def merge_cues(cues, max_ms=8000, max_chars=160):
    """Regroupe des morceaux courts (sous-titres automatiques mot à mot) en phrases lisibles."""
    out = []
    for start, end, body in cues:
        if out:
            s0, e0, b0 = out[-1]
            ends_sentence = b0.endswith((".", "?", "!", "…", "؟", "。"))
            if not ends_sentence and end - s0 <= max_ms and len(b0) + len(body) + 1 <= max_chars:
                out[-1] = (s0, end, f"{b0} {body}")
                continue
        out.append((start, end, body))
    return out


def parse_subtitles(text, ext):
    if ext == "json3":
        return parse_json3(text)
    return parse_vtt(text)


# --- Audio --------------------------------------------------------------------------------------
def download_audio(url, opts):
    """Télécharge seulement la piste audio (meilleure qualité disponible). Renvoie le chemin du fichier."""
    from yt_dlp import YoutubeDL

    o = dict(opts, format="bestaudio[ext=m4a]/bestaudio/best[height<=360]/best", postprocessors=[])
    try:
        with YoutubeDL(o) as ydl:
            info = ydl.extract_info(url, download=True)
            path = ydl.prepare_filename(info)
    except Exception as err:  # noqa: BLE001
        raise readable_error(err) from err
    if not os.path.exists(path):
        candidates = [os.path.join(o["paths"]["home"], f) for f in os.listdir(o["paths"]["home"]) if f.startswith(str(info.get("id")))]
        candidates = [c for c in candidates if not c.endswith((".part", ".ytdl", ".txt"))]
        if not candidates:
            raise RuntimeError("Fichier audio introuvable après téléchargement")
        path = candidates[0]
    return path


# --- Playlists et chaînes ------------------------------------------------------------------------
CHANNEL_ROOT = re.compile(r"^https?://(www\.|m\.)?youtube\.com/(@[\w.-]+|channel/[\w-]+|c/[\w.-]+|user/[\w.-]+)/?$", re.I)


def normalize_list_url(url):
    """Une chaîne YouTube sans onglet -> son onglet « Vidéos » (sinon yt-dlp renvoie les onglets, pas les vidéos)."""
    url = url.strip()
    if CHANNEL_ROOT.match(url.split("?")[0]):
        return url.split("?")[0].rstrip("/") + "/videos"
    return url


def _entry(e):
    ie = (e.get("ie_key") or e.get("extractor_key") or e.get("extractor") or "").lower()
    vid = str(e.get("id") or "")
    if "youtube" in ie and YOUTUBE_ID.match(vid):
        source = "youtube"
    elif "vimeo" in ie and vid.isdigit():
        source = "vimeo"
    else:
        url = e.get("url") or e.get("webpage_url") or ""
        m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", url)
        if m:
            source, vid = "youtube", m.group(1)
        else:
            m = re.search(r"vimeo\.com/(?:.*/)?(\d+)", url)
            if not m:
                return None
            source, vid = "vimeo", m.group(1)
    duration = e.get("duration")
    return {
        "id": vid, "source": source, "title": (e.get("title") or "").strip()[:200] or vid,
        "duration": int(duration) if isinstance(duration, (int, float)) else None,
        "thumb": best_thumbnail(e) if e.get("thumbnails") or e.get("thumbnail") else None,
    }


def list_videos(url, opts, limit):
    """Liste les vidéos d'une playlist, d'une chaîne ou d'un album, sans rien télécharger.
    Renvoie (titre, [entrées])."""
    o = dict(opts, extract_flat="in_playlist", noplaylist=False, playlistend=limit, lazy_playlist=False)
    info = fetch_info(normalize_list_url(url), o)
    if info.get("_type") not in ("playlist", "multi_video"):
        one = _entry(info)
        return (info.get("title") or "", [one] if one else [])
    entries = []
    for e in info.get("entries") or []:
        if not e:
            continue
        if e.get("_type") == "playlist" or (e.get("ie_key") == "YoutubeTab" and not YOUTUBE_ID.match(str(e.get("id") or ""))):
            continue  # sous-onglet (Shorts, Directs…) : ignoré
        item = _entry(e)
        if item and all(x["id"] != item["id"] for x in entries):
            entries.append(item)
        if len(entries) >= limit:
            break
    title = info.get("title") or info.get("channel") or info.get("uploader") or ""
    return (re.sub(r"\s+-\s+Videos$", "", title), entries)
