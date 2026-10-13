-- Étape 16.2 : adresses lisibles. Le « slug » est généré par l'API (jamais modifié ensuite, pour que les liens ne cassent pas).
ALTER TABLE talks  ADD COLUMN slug text;
ALTER TABLE series ADD COLUMN slug text;
CREATE UNIQUE INDEX idx_talks_slug  ON talks(slug)  WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX idx_series_slug ON series(slug) WHERE slug IS NOT NULL;
