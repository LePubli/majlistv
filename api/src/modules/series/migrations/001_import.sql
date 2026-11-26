-- Import d'une série complète depuis YouTube (étape B, 26/11) : la liste est lue par le transcripteur (table import_jobs, purpose 'series'),
-- puis la série, ses saisons et ses épisodes sont créés en une fois. Journal de l'import gardé avec la série (adresse, personne, déclaration des droits).
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_purpose_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_purpose_check CHECK (purpose IN ('videos', 'audyn', 'shorts', 'series'));
ALTER TABLE series
  ADD COLUMN IF NOT EXISTS import_url        text,
  ADD COLUMN IF NOT EXISTS imported_by_name  text,
  ADD COLUMN IF NOT EXISTS rights_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rights_text       text;
