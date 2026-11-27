-- 27/11 : image de couverture de la série (bandeau large), case « Aussi une collection » et lien collection → série.
-- La collection liée est créée / tenue à jour par la série (collectionSync.js) ; elle disparaît avec la série.
ALTER TABLE series
  ADD COLUMN IF NOT EXISTS cover_key     text,
  ADD COLUMN IF NOT EXISTS as_collection boolean NOT NULL DEFAULT false;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES series(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS collections_series_uq ON collections(series_id) WHERE series_id IS NOT NULL;
