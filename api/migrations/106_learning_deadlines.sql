-- Planning, étape 2 : échéances choisies par le membre (examen, point d'étape…). Les séances de révision sont réparties automatiquement
-- jusqu'à la date, puis restent modifiables une à une (déplacer, cocher, supprimer).
CREATE TABLE IF NOT EXISTS learning_deadlines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  due_on     date NOT NULL,
  pace       text NOT NULL CHECK (pace IN ('light', 'normal', 'intense')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_deadlines_user ON learning_deadlines(user_id, due_on);
-- Les séances créées pour une échéance y sont rattachées ; si l'échéance est supprimée, les séances déjà faites restent (sans lien).
ALTER TABLE learning_plan_items ADD COLUMN IF NOT EXISTS deadline_id uuid REFERENCES learning_deadlines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS learning_plan_items_deadline ON learning_plan_items(deadline_id) WHERE deadline_id IS NOT NULL;
