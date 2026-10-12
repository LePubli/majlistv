-- Étape 6 : favoris et reprise de lecture.
CREATE TABLE favorites (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, talk_id)
);
CREATE INDEX idx_favorites_user ON favorites(user_id, created_at DESC);

-- Dernière position de lecture par utilisateur et conférence (vidéos envoyées uniquement).
CREATE TABLE watch_progress (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  position_ms integer NOT NULL CHECK (position_ms >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  completed   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, talk_id)
);
CREATE INDEX idx_progress_user ON watch_progress(user_id, updated_at DESC);
