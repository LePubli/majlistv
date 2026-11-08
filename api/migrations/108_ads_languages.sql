-- Amélioration 5.3 (étape 1) : ciblage des publicités par langue de l'application, et chiffres par langue.
-- ads.languages : liste de langues (fr, en, ar) ; vide = montrée dans toutes les langues.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';

-- Répartition par langue (en plus des compteurs par jour existants, qui restent les totaux).
-- lang vide = application qui n'envoie pas sa langue (version ancienne). Aucune donnée personnelle.
CREATE TABLE IF NOT EXISTS ad_stats_lang (
  ad_id        uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day          date NOT NULL DEFAULT current_date,
  lang         text NOT NULL DEFAULT '' CHECK (lang IN ('', 'fr', 'en', 'ar')),
  impressions  int NOT NULL DEFAULT 0,
  clicks       int NOT NULL DEFAULT 0,
  skips        int NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day, lang)
);
