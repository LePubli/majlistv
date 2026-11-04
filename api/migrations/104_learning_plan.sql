-- Planning de révisions (palier Apprentissage), étape 1 : séances choisies par le membre et jours de repos.
-- Les révisions automatiques (quiz espacés, cartes mémoire) ne sont PAS stockées : elles se calculent à partir de revision_items
-- et memory_card_progress. Seules les séances ajoutées à la main et les jours de repos déclarés vivent ici.
CREATE TABLE IF NOT EXISTS learning_plan_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('video', 'quiz', 'custom')),
  talk_id    uuid REFERENCES talks(id) ON DELETE CASCADE,
  note       text NOT NULL DEFAULT '' CHECK (char_length(note) <= 120),
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'custom' OR talk_id IS NOT NULL),
  CHECK (kind <> 'custom' OR char_length(note) > 0)
);
CREATE INDEX IF NOT EXISTS learning_plan_items_user_day ON learning_plan_items(user_id, day);

CREATE TABLE IF NOT EXISTS learning_rest_days (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  PRIMARY KEY (user_id, day)
);
