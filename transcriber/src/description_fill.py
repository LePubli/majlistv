"""Description des conférences reprise de la vidéo d'origine (migration 115 de l'API).

Le serveur de l'API lit mal les pages YouTube (consentement, blocage) : à l'enregistrement d'un lien, la description reste souvent
vide. Ce fil du transcripteur passe sur les conférences SANS description et la lit avec yt-dlp (comme pour les sous-titres) :
  - vidéos lues depuis leur plateforme (YouTube, Vimeo, Dailymotion, archive.org) : adresse de la vidéo ;
  - vidéos importées chez nous : adresse d'origine de leur dernier import réussi.
Jamais d'écrasement (seulement si la description est toujours vide). 3 essais au plus, espacés de 6 heures, quelques vidéos par
minute pour ne pas solliciter les plateformes. La recherche se met à jour seule (signature du contenu)."""
import external

BATCH = 3
SOURCES = ("youtube", "vimeo", "dailymotion", "archive")


def pick(q, limit=BATCH):
    """Réserve quelques conférences à compléter (essai compté tout de suite : une vidéo qui plante le lecteur n'est pas reprise en boucle)."""
    return q(
        """UPDATE talks SET meta_tries = meta_tries + 1, meta_checked_at = now()
           WHERE id IN (SELECT t.id FROM talks t
                        WHERE t.description = '' AND t.meta_tries < 3
                          AND (t.meta_checked_at IS NULL OR t.meta_checked_at < now() - interval '6 hours')
                          AND (t.source IN ('youtube', 'vimeo', 'dailymotion', 'archive')
                               OR EXISTS (SELECT 1 FROM media_imports m WHERE m.talk_id = t.id AND m.status = 'done'))
                        ORDER BY t.created_at DESC LIMIT %s FOR UPDATE SKIP LOCKED)
           RETURNING id, source, video_ref, language,
                     (SELECT m.source_url FROM media_imports m WHERE m.talk_id = talks.id AND m.status = 'done'
                       ORDER BY m.created_at DESC LIMIT 1) AS import_url""",
        (limit,), fetch=True)


def url_of(row):
    if row["source"] in SOURCES and row.get("video_ref"):
        return external.video_url(row["source"], row["video_ref"])
    return row.get("import_url") or None


def fill_one(q, row, opts, fetch=None):
    """Lit la vidéo et remplit la description si elle est toujours vide. Renvoie le nombre de caractères écrits (0 si rien)."""
    url = url_of(row)
    if not url:
        return 0
    opts = dict(opts, **external.metadata_language_options(row.get("language")))
    info = (fetch or external.fetch_info)(url, opts) or {}
    desc = external.clean_description(info.get("description") or "")[:5000]
    if not desc:
        return 0
    n = q("UPDATE talks SET description = %s WHERE id = %s AND description = ''", (desc, row["id"]))
    return len(desc) if n else 0


def run_once(q, opts, log, fetch=None, limit=BATCH):
    """Un passage : renvoie le nombre de conférences traitées (0 = plus rien à faire pour l'instant)."""
    rows = pick(q, limit)
    for row in rows:
        try:
            n = fill_one(q, row, opts, fetch)
            log(f"[description {row['id']}] {'reprise de la vidéo (' + str(n) + ' caractères)' if n else 'aucune description sur la vidéo'}")
        except Exception as err:  # noqa: BLE001 — essai compté, nouvel essai dans 6 heures (3 au plus)
            log(f"[description {row['id']}] lecture impossible : {str(err)[:300]}")
    return len(rows)
