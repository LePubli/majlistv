-- Registre n°28 et n°31 : « Préciser la place des mots » (E5c) et « Le cadre suit le visage » (E5d) apparaissent dans
-- Studio → Activité (files « align » et « face »), avec pause, priorité et annulation.
-- Annuler : une demande en attente passe à 'canceled' tout de suite ; une demande en cours reçoit cancel_requested,
-- que le service de transcription lit pendant le calcul (il s'arrête et note 'canceled').
ALTER TABLE word_align_jobs ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
ALTER TABLE word_align_jobs DROP CONSTRAINT IF EXISTS word_align_jobs_status_check;
ALTER TABLE word_align_jobs ADD CONSTRAINT word_align_jobs_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed', 'canceled'));
ALTER TABLE face_track_jobs ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
ALTER TABLE face_track_jobs DROP CONSTRAINT IF EXISTS face_track_jobs_status_check;
ALTER TABLE face_track_jobs ADD CONSTRAINT face_track_jobs_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed', 'canceled'));

ALTER TABLE activity_controls DROP CONSTRAINT IF EXISTS activity_controls_queue_check;
ALTER TABLE activity_controls ADD CONSTRAINT activity_controls_queue_check
  CHECK (queue IN ('video', 'transcript', 'translation', 'dubbing', 'archive', 'editor', 'render', 'replace', 'align', 'face', 'speakers'));
