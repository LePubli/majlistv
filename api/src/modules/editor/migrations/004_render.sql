-- Module « Éditeur de montage » — étape E4a : rendu de la vidéo montée.
-- Une demande de rendu garde le montage tel qu'il était (timeline), le plan préparé par l'API (plan.js) et le fichier produit par le worker.
CREATE TABLE IF NOT EXISTS editor_renders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
  talk_id          uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('preview', 'final')),   -- aperçu rapide (640x360) ou rendu final
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed', 'canceled')),
  stage            text,                                                  -- download | measure | encode | upload (pendant le calcul)
  progress         int NOT NULL DEFAULT 0,
  rev              int NOT NULL,                                          -- révision du montage rendue
  timeline         jsonb NOT NULL,                                        -- montage rendu (copie)
  plan             jsonb NOT NULL,                                        -- plan de rendu (plan.js) lu par le worker
  out_duration_s   numeric,                                               -- durée du fichier produit
  output_key       text,                                                  -- editor/renders/<projet>/<rendu>-<kind>.mp4
  bytes            bigint,
  report           jsonb,                                                 -- taille, cadence, temps de calcul, niveau mesuré…
  error            text,
  attempts         int NOT NULL DEFAULT 0,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editor_renders_project ON editor_renders(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS editor_renders_queue ON editor_renders(created_at) WHERE status IN ('queued', 'running');

-- Studio → Activité : pause et priorité possibles pour les analyses du son (file « editor », étape E2) et les rendus (« render »).
-- La contrainte d'origine (migration 055) ne connaissait pas ces files : mettre en pause une analyse du son échouait.
ALTER TABLE activity_controls DROP CONSTRAINT IF EXISTS activity_controls_queue_check;
ALTER TABLE activity_controls ADD CONSTRAINT activity_controls_queue_check
  CHECK (queue IN ('video', 'transcript', 'translation', 'dubbing', 'archive', 'editor', 'render'));
