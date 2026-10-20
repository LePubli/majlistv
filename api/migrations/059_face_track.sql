-- Étape E5d : « le cadre suit le visage » (extraits 9:16). Une demande d'analyse par extrait : le service de transcription lit
-- les images du passage, repère les visages et enregistre la trajectoire du cadre (points clés « keys » : t en secondes de la vidéo
-- d'origine, x = position du cadre de 0 à 100). project_id = l'extrait (editor_projects.id) ; pas de clé étrangère car ce module est facultatif.
CREATE TABLE IF NOT EXISTS face_track_jobs (
  project_id   uuid PRIMARY KEY,
  talk_id      uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  from_s       numeric NOT NULL,
  to_s         numeric NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  progress     int  NOT NULL DEFAULT 0,
  attempts     int  NOT NULL DEFAULT 0,
  error        text,
  keys         jsonb,
  coverage     numeric,
  faces        int,
  samples      int,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS face_track_jobs_pending ON face_track_jobs (created_at) WHERE status = 'pending';
