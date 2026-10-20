-- Module « Doublage français », étape D3c : plusieurs intervenants par conférence (une voix, une hauteur de voix chacun).

-- Demande « Détecter les intervenants » : une ligne par conférence, lue par le service de transcription (même principe que « place des mots »).
CREATE TABLE dub_speaker_jobs (
  talk_id          uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'canceled')),
  progress         int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  max_speakers     int NOT NULL DEFAULT 6 CHECK (max_speakers BETWEEN 2 AND 10),
  error            text,
  attempts         int NOT NULL DEFAULT 0,
  cancel_requested boolean NOT NULL DEFAULT false,
  found            int,                                  -- nombre d'intervenants trouvés
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Intervenants d'une conférence. n = numéro (1 = celui qui parle le plus). Les réglages de voix vides (NULL) = « comme les réglages de la conférence » ;
-- dès qu'une voix de base OU une voix cible est choisie, l'intervenant a sa propre voix (voir README, « Plusieurs intervenants »).
CREATE TABLE dub_speakers (
  talk_id       uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  n             int NOT NULL CHECK (n BETWEEN 1 AND 10),
  label         text NOT NULL DEFAULT '',
  seconds       numeric NOT NULL DEFAULT 0,             -- temps de parole (phrases à doubler comprises ou non : toutes les phrases françaises)
  phrases       int NOT NULL DEFAULT 0,
  f0            numeric,                                -- hauteur moyenne estimée (Hz), NULL si inconnue
  guess         text NOT NULL DEFAULT '' CHECK (guess IN ('', 'male', 'female', 'child')),   -- catégorie SUGGÉRÉE d'après la hauteur
  base_voice    uuid REFERENCES dub_voices(id) ON DELETE SET NULL,
  target_voice  uuid REFERENCES dub_voices(id) ON DELETE SET NULL,
  pitch         numeric CHECK (pitch IS NULL OR pitch BETWEEN -4 AND 4),   -- demi-tons ; NULL = réglage de la conférence
  detected_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talk_id, n)
);

-- Intervenant de chaque phrase française. manual = corrigé à la main (une nouvelle détection repart de zéro et efface tout).
CREATE TABLE dub_phrase_speakers (
  talk_id   uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  idx       int NOT NULL,
  speaker   int NOT NULL CHECK (speaker BETWEEN 1 AND 10),
  manual    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (talk_id, idx)
);

-- La file « speakers » apparaît dans Studio → Activité (pause, priorité, annulation).
ALTER TABLE activity_controls DROP CONSTRAINT IF EXISTS activity_controls_queue_check;
ALTER TABLE activity_controls ADD CONSTRAINT activity_controls_queue_check
  CHECK (queue IN ('video', 'transcript', 'translation', 'dubbing', 'archive', 'editor', 'render', 'replace', 'align', 'face', 'speakers'));
