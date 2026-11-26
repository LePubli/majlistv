-- Application automatique : une proposition peut être appliquée sans clic (confiance élevée, réglage activé par l'administrateur).
-- On garde la trace : `auto` = appliquée par le service ; elle reste visible et annulable dans le Studio.
ALTER TABLE talk_category_suggestions ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tcs_auto ON talk_category_suggestions(reviewed_at DESC) WHERE auto;
