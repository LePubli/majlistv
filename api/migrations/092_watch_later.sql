-- Amélioration 2.5 — « À regarder plus tard » : liste personnelle, distincte des favoris et des listes de lecture.
-- Une conférence terminée (watch_progress.completed) en sort d'elle-même à la lecture suivante de la liste.
CREATE TABLE IF NOT EXISTS watch_later (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id  uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, talk_id)
);
CREATE INDEX IF NOT EXISTS idx_watch_later_user ON watch_later(user_id, added_at DESC);
