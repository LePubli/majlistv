-- Étape 23b : veille des chaînes et comptes YouTube / Dailymotion / Vimeo (réservée à l'administrateur).
-- Le transcripteur vérifie chaque source à intervalle régulier ; les nouvelles vidéos arrivent dans une liste
-- à traiter (Ajouter / Ignorer). Rien n'est ajouté au catalogue sans une action de l'administrateur.

CREATE TABLE watch_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url             text NOT NULL,                       -- chaîne, compte, playlist ou album
  platform        text NOT NULL CHECK (platform IN ('youtube', 'dailymotion', 'vimeo', 'other')),
  label           text NOT NULL DEFAULT '',            -- nom affiché (lu sur la plateforme si laissé vide)
  active          boolean NOT NULL DEFAULT true,
  baselined       boolean NOT NULL DEFAULT false,      -- première lecture faite : les vidéos existantes sont notées « déjà vues »
  check_requested boolean NOT NULL DEFAULT false,      -- « Vérifier maintenant »
  last_check_at   timestamptz,
  last_ok_at      timestamptz,
  last_error      text,
  last_count      int NOT NULL DEFAULT 0,              -- vidéos lues lors du dernier contrôle
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_watch_sources_url ON watch_sources(lower(url));

CREATE TABLE watch_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES watch_sources(id) ON DELETE CASCADE,
  platform    text NOT NULL,
  video_id    text NOT NULL,
  title       text NOT NULL DEFAULT '',
  duration    int,
  thumb       text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('seen', 'new', 'ignored', 'added')),
  talk_id     uuid REFERENCES talks(id) ON DELETE SET NULL,
  found_at    timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz,
  UNIQUE (source_id, video_id)
);
CREATE INDEX idx_watch_items_new ON watch_items(found_at DESC) WHERE status = 'new';
