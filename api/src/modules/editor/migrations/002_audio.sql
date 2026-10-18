-- Module « Éditeur de montage » — étape E2 : audio pro.
-- Musiques de fond importées (bibliothèque commune, importées par l'administrateur) et formes d'onde calculées par l'API
-- avec FFmpeg (voix d'origine, voix française, musiques), avec le niveau sonore mesuré (LUFS, EBU R128).
CREATE TABLE editor_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL DEFAULT 'music' CHECK (kind IN ('music')),
  title       text NOT NULL,
  license     text NOT NULL DEFAULT '',        -- source ou licence de la musique (texte libre)
  key         text NOT NULL UNIQUE,            -- fichier dans Garage : editor/music/<uuid>.<ext>
  mime        text NOT NULL,
  bytes       bigint NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Formes d'onde : une par voix d'origine (conférence), voix française (conférence) et musique.
CREATE TABLE editor_waveforms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('orig', 'dub', 'music')),
  talk_id     uuid REFERENCES talks(id) ON DELETE CASCADE,
  asset_id    uuid REFERENCES editor_assets(id) ON DELETE CASCADE,
  src         text NOT NULL,                   -- ce qui a été analysé (sert à savoir si c'est périmé : nouvelle piste française…)
  status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  step_ms     int NOT NULL DEFAULT 100,        -- un pic toutes les 100 ms
  peaks       bytea,                           -- 0-255 par pas (valeur absolue maximale)
  duration_s  numeric,
  lufs        numeric,                         -- niveau sonore intégré mesuré
  error       text,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'music') = (asset_id IS NOT NULL)),
  CHECK ((kind <> 'music') = (talk_id IS NOT NULL))
);
CREATE UNIQUE INDEX editor_waveforms_talk ON editor_waveforms(talk_id, kind) WHERE talk_id IS NOT NULL;
CREATE UNIQUE INDEX editor_waveforms_asset ON editor_waveforms(asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX editor_waveforms_queued ON editor_waveforms(created_at) WHERE status = 'queued';
