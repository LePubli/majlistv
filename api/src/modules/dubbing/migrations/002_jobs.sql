-- Module « Doublage français », étape D1a : file d'attente du service de doublage, état du moteur, piste française en service.

-- Une demande de doublage : « preview » = 60 secondes à écouter, « full » = toute la conférence.
CREATE TABLE dub_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id      uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('preview', 'full')),
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  cancel_requested boolean NOT NULL DEFAULT false,
  params       jsonb NOT NULL,            -- réglages effectifs + voix figés au moment de la demande
  phase        text NOT NULL DEFAULT '',  -- download | voice | convert | mix | upload
  progress     int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts     int NOT NULL DEFAULT 0,
  error        text,
  result       jsonb,                     -- clés des fichiers, durées, vitesse mesurée, état de chaque phrase
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dub_jobs_queue ON dub_jobs(status, kind, created_at);
CREATE INDEX dub_jobs_talk ON dub_jobs(talk_id, created_at DESC);
-- Une seule demande en attente ou en cours par conférence et par type.
CREATE UNIQUE INDEX dub_jobs_one_active ON dub_jobs(talk_id, kind) WHERE status IN ('queued', 'running');

-- Signe de vie du service de doublage (une ligne), mis à jour toutes les 30 s.
CREATE TABLE dub_engine (
  id          int PRIMARY KEY CHECK (id = 1),
  last_seen   timestamptz NOT NULL,
  version     text NOT NULL DEFAULT '',
  info        jsonb NOT NULL DEFAULT '{}'
);

-- Piste française en service pour chaque conférence (dernier doublage complet réussi).
CREATE TABLE dub_tracks (
  talk_id     uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES dub_jobs(id) ON DELETE SET NULL,
  mix_key     text,                       -- voix française + voix d'origine baissée (vidéos envoyées)
  voice_key   text NOT NULL,              -- voix française seule (toutes les vidéos, dont YouTube / Vimeo / archive.org)
  duration_s  numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);
