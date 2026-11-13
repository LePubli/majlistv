-- Chaînes TV en direct 24 h/24 (ex. La Mecque et Médine, chaînes officielles sur YouTube), affichées en tête de la page « En direct ».
-- L'administrateur colle le lien de la chaîne YouTube (ou d'un direct) ; le transcripteur retrouve régulièrement le direct en cours
-- (yt-dlp) et note son identifiant : le lecteur YouTube officiel est intégré sur le site et dans l'application.
CREATE TABLE IF NOT EXISTS live_channels (
  id          serial PRIMARY KEY,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  source_url  text NOT NULL CHECK (length(source_url) BETWEEN 10 AND 300),
  position    integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true,
  video_id    text CHECK (video_id IS NULL OR video_id ~ '^[A-Za-z0-9_-]{11}$'),
  live        boolean NOT NULL DEFAULT false,
  title       text NOT NULL DEFAULT '',
  checked_at  timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_channels_order_idx ON live_channels(position, id);
