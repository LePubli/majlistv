-- Étape 41B : signalement d'une réponse de l'assistant par le membre, et traitement par l'équipe.
ALTER TABLE ask_log ADD COLUMN IF NOT EXISTS reported_at   timestamptz;
ALTER TABLE ask_log ADD COLUMN IF NOT EXISTS report_reason text NOT NULL DEFAULT '';
ALTER TABLE ask_log ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;
ALTER TABLE ask_log ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ask_log_reported_idx ON ask_log(reported_at DESC) WHERE reported_at IS NOT NULL AND reviewed_at IS NULL;
