-- 27/11 : public (adultes / enfants / les deux), catégories (principale + supplémentaires, manuelles ou automatiques par l'IA) d'une série.
-- Ces réglages sont appliqués aux épisodes (leur public et leurs catégories) : une série n'a pas de public propre, elle suit ses vidéos.
ALTER TABLE series
  ADD COLUMN IF NOT EXISTS audience         text    NOT NULL DEFAULT 'adult',
  ADD COLUMN IF NOT EXISTS kids_bands       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_mode    text    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS settings_applied boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE series ADD CONSTRAINT series_audience_chk CHECK (audience IN ('adult', 'kids', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE series ADD CONSTRAINT series_category_mode_chk CHECK (category_mode IN ('manual', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS series_categories (
  series_id   uuid    NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (series_id, category_id)
);
