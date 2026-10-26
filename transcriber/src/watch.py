"""Étape 23b — Veille des chaînes : logique pure (testée hors ligne) + boucle de contrôle.

Le fil lit, à intervalle régulier, les sources suivies (chaîne, compte, playlist) avec yt-dlp (sans rien télécharger) et
range les vidéos trouvées dans watch_items. La première lecture d'une source sert de référence : ses vidéos sont notées
« seen » (déjà vues), seules les suivantes deviennent « new » (à traiter dans Admin → Veille).
"""


def plan_check(entries, known_ids, in_catalog, baselined):
    """Décide du statut de chaque vidéo lue.

    entries     : [{id, source, title, duration, thumb}] lues sur la plateforme
    known_ids   : identifiants déjà enregistrés pour cette source (quel que soit leur statut)
    in_catalog  : {(source, id)} déjà présents dans le catalogue
    baselined   : la première lecture a-t-elle déjà eu lieu ?
    Renvoie [(entrée, statut)] pour les seules vidéos à enregistrer (statut : 'seen' ou 'new').
    """
    out = []
    seen_now = set()
    for e in entries:
        vid = e.get("id")
        if not vid or vid in known_ids or vid in seen_now:
            continue
        seen_now.add(vid)
        if not baselined or (e.get("source"), vid) in in_catalog:
            out.append((e, "seen"))
        else:
            out.append((e, "new"))
    return out


def due_clause(hours):
    """Condition SQL des sources à relire (heures bornées de 1 à 48)."""
    h = max(1, min(48, int(hours)))
    return f"(check_requested OR last_check_at IS NULL OR last_check_at < now() - interval '{h} hours')"
