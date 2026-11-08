-- Amélioration 5.3 (étape 2) : lien de suivi secret par publicité, pour le rapport de l'annonceur (sans compte).
-- NULL = lien désactivé (aucun rapport accessible).
ALTER TABLE ads ADD COLUMN IF NOT EXISTS report_token text;
CREATE UNIQUE INDEX IF NOT EXISTS ads_report_token_uq ON ads(report_token) WHERE report_token IS NOT NULL;
