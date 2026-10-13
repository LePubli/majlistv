-- Étape 24.3 : passer le quiz. Tentatives des abonnés / membres connectés et signalements de questions.
-- Un visiteur sans compte n'a pas de ligne ici : son résultat reste 7 jours dans son navigateur.

CREATE TABLE quiz_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  score      int  NOT NULL,                       -- bonnes réponses
  total      int  NOT NULL,                       -- questions du quiz au moment de la tentative
  percent    int  NOT NULL,
  passed     boolean NOT NULL,
  answers    jsonb NOT NULL DEFAULT '[]',         -- [{ "questionId": "…", "index": 2, "correct": true }]
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id, talk_id, created_at DESC);

-- « Signaler cette question » : relu par l'organisateur dans le Studio.
CREATE TABLE quiz_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_quiz_reports_open ON quiz_reports(question_id) WHERE resolved_at IS NULL;
-- Un membre ne signale une question qu'une fois tant qu'elle n'a pas été traitée.
CREATE UNIQUE INDEX uq_quiz_reports_open ON quiz_reports(question_id, user_id) WHERE resolved_at IS NULL AND user_id IS NOT NULL;
