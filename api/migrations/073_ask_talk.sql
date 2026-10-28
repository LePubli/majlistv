-- Étape 41 : « Pose une question sur cette conférence » (assistant IA limité à la transcription).
-- Une ligne par question traitée : sert au plafond du jour (par membre et global), au suivi du coût (jetons) et, à l'étape 41B,
-- à l'historique et à la modération. Question et réponse sont gardées ask_keep_days jours (nettoyage automatique), puis supprimées.
CREATE TABLE IF NOT EXISTS ask_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  question    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('answered', 'not_in_talk', 'religious_ruling', 'off_topic')),
  answer      text NOT NULL DEFAULT '',
  sources     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ startMs, text }] : passages de la transcription cités
  lang        text NOT NULL DEFAULT 'fr',
  model       text NOT NULL DEFAULT '',
  tokens_in   int NOT NULL DEFAULT 0,
  tokens_out  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_log_user_day_idx ON ask_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ask_log_day_idx ON ask_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ask_log_talk_idx ON ask_log(talk_id, created_at DESC);
