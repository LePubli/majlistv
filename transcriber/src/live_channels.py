"""Chaînes TV en direct 24 h/24 (module « Événements en direct », migration 003 du module, fonction « livetv »).

L'administrateur enregistre le lien d'une chaîne YouTube (ou d'un direct). Ce fil retrouve le direct en cours avec yt-dlp, sans
rien télécharger : chaîne → <chaîne>/live → identifiant de la vidéo en direct ; lien d'une vidéo → cette vidéo.
Relu toutes les 15 minutes (l'identifiant d'un direct 24 h/24 change de temps en temps), tout de suite après un ajout ou
« Vérifier maintenant » (checked_at vide). En cas d'échec, l'identifiant connu est gardé (le lecteur continue de fonctionner)."""
import re

import external

RECHECK_MINUTES = 15
YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def pick(q, limit=3):
    return q(f"""SELECT id, source_url FROM live_channels
                 WHERE checked_at IS NULL OR checked_at < now() - interval '{RECHECK_MINUTES} minutes'
                 ORDER BY checked_at NULLS FIRST, id LIMIT %s""", (limit,), fetch=True)


def live_url(source_url):
    """Adresse à lire : la vidéo elle-même, ou la page « /live » de la chaîne (le direct en cours)."""
    return source_url if "/watch?v=" in source_url else source_url.rstrip("/") + "/live"


def resolve(source_url, opts, fetch=None):
    """→ (identifiant, en direct ?, titre). Lève une erreur si la chaîne n'a pas de direct en cours."""
    info = (fetch or external.fetch_info)(live_url(source_url), dict(opts, skip_download=True)) or {}
    vid = str(info.get("id") or "")
    if not YT_ID.match(vid):
        raise RuntimeError("Aucun direct trouvé sur cette chaîne pour l'instant.")
    live = bool(info.get("is_live")) or info.get("live_status") == "is_live"
    return vid, live, str(info.get("title") or "")[:300]


def run_once(q, opts, log, fetch=None):
    rows = pick(q)
    for r in rows:
        try:
            vid, live, title = resolve(r["source_url"], opts, fetch)
            q("UPDATE live_channels SET video_id = %s, live = %s, title = %s, checked_at = now(), error = NULL WHERE id = %s", (vid, live, title, r["id"]))
            log(f"[direct {r['id']}] {'en direct' if live else 'pas en direct'} : {vid} {title[:60]}")
        except Exception as err:  # noqa: BLE001 — identifiant connu gardé ; nouvel essai au prochain passage
            msg = str(external.readable_error(err))[:300]
            q("UPDATE live_channels SET live = false, checked_at = now(), error = %s WHERE id = %s", (msg, r["id"]))
            log(f"[direct {r['id']}] {msg}")
    return len(rows)
