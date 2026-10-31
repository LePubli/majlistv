-- Étape 45 : saisons religieuses (Ramadan, Hajj, Mawlid, Achoura). Une ligne par saison ; les dates viennent du calendrier hégirien (api/src/hijri.js).
CREATE TABLE IF NOT EXISTS season_pages (
  id                text PRIMARY KEY,                              -- ramadan | hajj | mawlid | ashura
  enabled           boolean NOT NULL DEFAULT false,                -- désactivée tant que tu ne l'as pas réglée
  collection_id     uuid REFERENCES collections(id) ON DELETE SET NULL,
  lead_days         int CHECK (lead_days IS NULL OR lead_days BETWEEN 0 AND 60),  -- NULL = valeur par défaut de la saison
  title_fr text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', title_ar text NOT NULL DEFAULT '',  -- vide = texte par défaut
  text_fr  text NOT NULL DEFAULT '', text_en  text NOT NULL DEFAULT '', text_ar  text NOT NULL DEFAULT '',
  notify            boolean NOT NULL DEFAULT true,                 -- notification à l'ouverture de la période (une fois par année hégirienne)
  last_notified_year int,                                          -- année hégirienne de la dernière notification
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO season_pages(id) VALUES ('ramadan'), ('hajj'), ('mawlid'), ('ashura') ON CONFLICT DO NOTHING;
