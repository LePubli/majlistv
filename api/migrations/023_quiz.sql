-- Étape 24.2 : quiz de compréhension (données). Questions rattachées à un passage précis de la conférence,
-- relues et validées par un humain avant d'être proposées au public.

-- Quiz activé pour cette conférence : NULL = réglage du site (quiz_default_enabled), true / false = choix de l'organisateur.
ALTER TABLE talks ADD COLUMN quiz_enabled boolean;

CREATE TABLE quiz_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id        uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  lang           text NOT NULL,
  question       text NOT NULL,
  options        jsonb NOT NULL,                      -- ["…", "…", "…"] (3 ou 4 réponses possibles)
  correct_index  int  NOT NULL,
  explanation    text NOT NULL DEFAULT '',            -- pourquoi c'est la bonne réponse, d'après les paroles de l'intervenant
  evidence_ms    int,                                 -- minute où l'intervenant donne la réponse
  evidence_quote text NOT NULL DEFAULT '',            -- passage de la transcription qui justifie la réponse (mot pour mot)
  chapter_ms     int,                                 -- chapitre contenant ce passage
  chapter_title  text NOT NULL DEFAULT '',
  origin         text NOT NULL DEFAULT 'manual' CHECK (origin IN ('ai', 'manual')),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 3 AND 4),
  CHECK (correct_index >= 0 AND correct_index < jsonb_array_length(options))
);
CREATE INDEX idx_quiz_questions_talk ON quiz_questions(talk_id, status);
CREATE INDEX idx_quiz_questions_review ON quiz_questions(created_at) WHERE status = 'draft';

-- Demandes de génération (une par conférence) : reprises par le service translator.
CREATE TABLE quiz_jobs (
  talk_id    uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  lang       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  wanted     int  NOT NULL DEFAULT 8,
  produced   int  NOT NULL DEFAULT 0,                 -- propositions gardées
  dropped    int  NOT NULL DEFAULT 0,                 -- propositions écartées (passage cité introuvable, réponses invalides…)
  error      text,
  attempts   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quiz_jobs_queue ON quiz_jobs(created_at) WHERE status IN ('pending', 'processing');
