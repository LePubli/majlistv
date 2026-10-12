-- Étape 12.1 : accueil vitrine. Conférences « mises en avant » (bannière d'accueil), choisies par un administrateur.
ALTER TABLE talks ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS featured_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_talks_featured ON talks(featured_at DESC) WHERE featured;
