-- Module « Éditeur de montage » — étape E4b : remplacer la vidéo publiée par un rendu final, et revenir à la version d'avant.
--   kind = 'replace' : le rendu remplace la vidéo publiée ; kind = 'restore' : la version d'avant revient (target_id = remplacement annulé).
--   status : converting (le worker prépare la nouvelle version HLS) → converted → switched (bascule faite par l'API)
--            | waiting_original (restauration : l'original revient des archives) | failed | canceled | restored (remplacement annulé par une restauration)
--   follow (après la bascule) : transcript (nouvelle transcription en cours) → translations (traductions, résumés) → done.
CREATE TABLE IF NOT EXISTS editor_replacements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id          uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES editor_projects(id) ON DELETE SET NULL,
  render_id        uuid REFERENCES editor_renders(id) ON DELETE SET NULL,
  kind             text NOT NULL DEFAULT 'replace' CHECK (kind IN ('replace', 'restore')),
  target_id        uuid REFERENCES editor_replacements(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'converting' CHECK (status IN ('converting', 'converted', 'switched', 'waiting_original', 'failed', 'canceled', 'restored')),
  stage            text,                      -- download | convert | upload (pendant la préparation)
  progress         int NOT NULL DEFAULT 0,
  follow           text CHECK (follow IN ('transcript', 'translations', 'done')),
  keep_corrections boolean NOT NULL DEFAULT false,   -- « Conserver mes corrections » : rien n'est relancé, tout est recalé
  source_key       text NOT NULL,             -- fichier converti : copie du rendu (remplacement) ou original (restauration)
  new_prefix       text NOT NULL,             -- hls/<conférence>/r/<id>/
  old_prefix       text,                      -- dossier HLS servi avant la bascule
  old_video_ref    text,                      -- l'original (gardé N jours, puis archivé)
  new_video_ref    text,
  map              jsonb NOT NULL,            -- carte du temps (timemap.js) : ancienne vidéo → nouvelle
  info             jsonb,                     -- préparation : durée, hauteur, son, miniatures
  prev             jsonb,                     -- ce qu'il faut pour revenir en arrière (conférence, résumés, quiz, notes, doublage…)
  report           jsonb,                     -- ce qui a été fait à la bascule (phrases, quiz à revoir, notes déplacées…)
  original_state   text CHECK (original_state IN ('kept', 'archived', 'deleted', 'in_use')),
  original_bytes   bigint,
  keep_until       timestamptz,
  cleanup_after    timestamptz,
  cleaned          boolean NOT NULL DEFAULT false,
  error            text,
  attempts         int NOT NULL DEFAULT 0,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  switched_at      timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editor_replacements_talk ON editor_replacements(talk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS editor_replacements_queue ON editor_replacements(created_at) WHERE status IN ('converting', 'converted', 'waiting_original');
-- Une seule opération en cours par conférence.
CREATE UNIQUE INDEX IF NOT EXISTS editor_replacements_active ON editor_replacements(talk_id) WHERE status IN ('converting', 'converted', 'waiting_original');

-- Phrases (toutes langues) de la version d'avant, pour « Restaurer l'original ».
CREATE TABLE IF NOT EXISTS editor_replace_segments (
  replacement_id uuid NOT NULL REFERENCES editor_replacements(id) ON DELETE CASCADE,
  lang           text NOT NULL,
  idx            int NOT NULL,
  start_ms       int NOT NULL,
  end_ms         int NOT NULL,
  text           text NOT NULL,
  PRIMARY KEY (replacement_id, lang, idx)
);

-- Studio → Activité : la préparation d'une nouvelle version (file « replace ») se met en pause et passe en priorité comme les autres.
ALTER TABLE activity_controls DROP CONSTRAINT IF EXISTS activity_controls_queue_check;
ALTER TABLE activity_controls ADD CONSTRAINT activity_controls_queue_check
  CHECK (queue IN ('video', 'transcript', 'translation', 'dubbing', 'archive', 'editor', 'render', 'replace'));
