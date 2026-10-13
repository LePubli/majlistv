-- Étape 17b : marque-pages et notes personnelles (privés, par utilisateur et par conférence).
-- Un marque-page est une note sans texte ; les deux sont rattachés à un instant de la vidéo.
CREATE TABLE talk_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  position_ms int  NOT NULL CHECK (position_ms >= 0),
  body        text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_talk_notes_user_talk ON talk_notes(user_id, talk_id, position_ms);
CREATE INDEX idx_talk_notes_user_recent ON talk_notes(user_id, updated_at DESC);
