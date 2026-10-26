-- Étape 24c : publicité plein écran au lancement de l'application.
-- Une publicité = un visuel (photo ou courte vidéo) + annonceur, titre, phrase, lien ; active ou non ; dates de début et de fin facultatives.
-- Plusieurs publicités peuvent être actives : l'application les fait tourner (une différente à chaque lancement).
CREATE TABLE ads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser  text NOT NULL,
  title       text NOT NULL,
  sentence    text NOT NULL DEFAULT '',
  cta_label   text NOT NULL DEFAULT 'En savoir plus',
  link_url    text NOT NULL,
  media_kind  text NOT NULL CHECK (media_kind IN ('image', 'video')),
  media_key   text NOT NULL,
  media_type  text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  starts_at   timestamptz,                                -- vide = tout de suite
  ends_at     timestamptz,                                -- vide = sans fin
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX idx_ads_live ON ads(active, starts_at, ends_at);

-- Compteurs par publicité et par jour (aucune donnée personnelle).
CREATE TABLE ad_stats (
  ad_id        uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day          date NOT NULL DEFAULT current_date,
  impressions  int NOT NULL DEFAULT 0,
  clicks       int NOT NULL DEFAULT 0,
  skips        int NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day)
);
