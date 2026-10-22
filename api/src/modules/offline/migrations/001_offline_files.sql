-- Étape 22b-6 : fichiers « hors connexion » préparés à la demande (MP4 vidéo ou M4A audio, copiés sans reconversion depuis le HLS).
CREATE TABLE IF NOT EXISTS offline_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  prefix      text NOT NULL,                      -- dossier de la version HLS source (remplacement de vidéo : nouvelle version)
  kind        text NOT NULL CHECK (kind IN ('audio', 'video')),
  height      int  NOT NULL DEFAULT 0,            -- 0 pour l'audio
  status      text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'ready', 'failed')),
  object_key  text,
  size        bigint,
  sha256      text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talk_id, prefix, kind, height)
);
CREATE INDEX IF NOT EXISTS offline_files_talk ON offline_files (talk_id);
