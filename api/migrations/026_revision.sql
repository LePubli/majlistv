-- Étape 24.5 : révision espacée, bibliothèque de rappels, e-mail quotidien (palier « Apprentissage »).

-- Une ligne par membre et par conférence quiz-ée. Calendrier J+1 / J+3 / J+7 / J+21 compté depuis la date d'ancrage
-- (première tentative, ou dernier échec). stage = prochaine révision (0 : J+1, 1 : J+3, 2 : J+7, 3 : J+21, 4 : acquis).
CREATE TABLE revision_items (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  stage      integer NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 4),
  anchor_on  date NOT NULL,
  due_on     date,                         -- NULL quand la conférence est acquise (stage 4)
  last_percent integer,
  reviews    integer NOT NULL DEFAULT 0,   -- révisions réussies à l'échéance
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, talk_id)
);
CREATE INDEX idx_revision_due ON revision_items(due_on) WHERE due_on IS NOT NULL;

-- Bibliothèque de rappels : courts passages affichés en « rappel du jour ».
-- Jamais générés par une IA : extraits MOT POUR MOT de la transcription de la plateforme, repris des citations déjà vérifiées d'un quiz,
-- ou saisis à la main avec leur source. Rien n'est publié sans validation humaine.
CREATE TABLE reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  lang        text NOT NULL DEFAULT 'fr',
  text        text NOT NULL CHECK (length(text) BETWEEN 5 AND 800),
  start_ms    integer,
  origin      text NOT NULL CHECK (origin IN ('transcript', 'quiz', 'manual')),
  attribution text NOT NULL DEFAULT '',    -- source validée (obligatoire pour une saisie manuelle)
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
CREATE INDEX idx_reminders_talk ON reminders(talk_id, status);

-- Préférences d'apprentissage : e-mail quotidien (activé par défaut) et dernier envoi.
CREATE TABLE learning_prefs (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_email     boolean NOT NULL DEFAULT true,
  last_emailed_on date
);
