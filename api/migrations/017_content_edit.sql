-- Étape 10.5 : correction manuelle de la transcription, du résumé et des chapitres.
--   talks.transcript_edited_at : date de la dernière correction de transcription (déclenche la réindexation de la recherche).
--   talk_insights.edited       : le résumé de cette langue a été modifié à la main.
ALTER TABLE talks ADD COLUMN IF NOT EXISTS transcript_edited_at timestamptz;
ALTER TABLE talk_insights ADD COLUMN IF NOT EXISTS edited boolean NOT NULL DEFAULT false;
