-- Publicité : ciblage par pays (fuseau horaire du téléphone) et par appareil, durée de visionnage, répartitions, conversions.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS devices text[] NOT NULL DEFAULT '{}';
ALTER TABLE ad_stats ADD COLUMN IF NOT EXISTS watch_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE ad_stats ADD COLUMN IF NOT EXISTS watch_n int NOT NULL DEFAULT 0;
ALTER TABLE ad_stats ADD COLUMN IF NOT EXISTS completed int NOT NULL DEFAULT 0;

-- Répartition par pays ou par appareil (value = code pays « FR » / appareil « android », « ios », « tv », « web », ou '' si inconnu).
CREATE TABLE IF NOT EXISTS ad_stats_dim (
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('country', 'device')),
  value text NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  skips int NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day, kind, value)
);

-- Rattachement d'un compte à la publicité qui l'a amené (clic vers notre site puis inscription).
CREATE TABLE IF NOT EXISTS ad_attributions (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  subscribed_at timestamptz
);
CREATE TABLE IF NOT EXISTS ad_conversions (
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('signup', 'subscription')),
  n int NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day, kind)
);
