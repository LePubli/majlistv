"""Import d'une chaîne dans Audyn : détail des vidéos demandé depuis le Studio avant l'import (migration 116 de l'API).

Le Studio marque des vidéos de la liste « wanted » dans import_jobs.details ; ce fil les lit une par une avec yt-dlp (sans
télécharger) et écrit leur détail : description, chaîne, date, durée, chapitres, langues audio proposées, miniature.
Chaque écriture fusionne une seule clé (details || {id: ...}) : aucune course avec le Studio qui en demande d'autres."""
import json
import external
import importer

BATCH = 3


def pick(q):
    """Une liste qui attend des détails, et jusqu'à BATCH vidéos à lire (dans l'ordre de la liste)."""
    rows = q("""SELECT id, entries, details FROM import_jobs
                WHERE purpose = 'audyn' AND jsonb_path_exists(details, '$.* ? (@.status == "wanted")')
                ORDER BY updated_at LIMIT 1""", fetch=True)
    if not rows:
        return None, []
    job = rows[0]
    details = job["details"] or {}
    wanted = [e for e in (job["entries"] or []) if (details.get(str(e.get("id"))) or {}).get("status") == "wanted"]
    return job["id"], wanted[:BATCH]


def _date(d):
    d = str(d or "")
    return f"{d[0:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 and d.isdigit() else None


def detail_of(entry, opts, fetch=None):
    url = external.video_url(entry["source"], entry["id"])
    o = dict(opts, skip_download=True, **external.metadata_language_options("fr"))
    info = (fetch or external.fetch_info)(url, o) or {}
    chapters = [{"title": str(c.get("title") or "")[:200], "start": int(c.get("start_time") or 0)}
                for c in (info.get("chapters") or [])[:100]]
    return {
        "status": "done",
        "title": str(info.get("title") or entry.get("title") or "")[:300],
        "description": external.clean_description(info.get("description") or "")[:5000],
        "uploader": str(info.get("uploader") or info.get("channel") or info.get("creator") or "")[:200],
        "date": _date(info.get("upload_date")),
        "duration": int(info["duration"]) if info.get("duration") else None,
        "chapters": chapters,
        "audioLangs": importer.audio_languages(info),
        "thumb": external.best_thumbnail(info),
    }


def save(q, jid, vid, detail):
    q("UPDATE import_jobs SET details = details || %s::jsonb WHERE id = %s", (json.dumps({str(vid): detail}), jid))


def run_once(q, opts, log, fetch=None):
    """Un passage : renvoie le nombre de vidéos lues (0 = rien à faire)."""
    jid, todo = pick(q)
    for e in todo:
        try:
            save(q, jid, e["id"], detail_of(e, opts, fetch))
        except Exception as err:  # noqa: BLE001 — affiché dans le Studio, l'utilisateur peut redemander
            log(f"[import {jid}] détail de {e['id']} : {str(err)[:200]}")
            save(q, jid, e["id"], {"status": "failed", "error": str(err)[:300]})
    return len(todo)
