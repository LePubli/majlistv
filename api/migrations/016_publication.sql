-- Étape 10.4 : brouillons, publication programmée et choix de la miniature.
--   publication = 'published' (défaut : comportement actuel), 'draft' (invisible du public) ou 'scheduled' (visible à partir de publish_at).
--   poster_candidates = 3 images tirées de la vidéo par le worker (vidéos envoyées), parmi lesquelles l'organisateur choisit.
ALTER TABLE talks
  ADD COLUMN IF NOT EXISTS publication text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS poster_candidates text[] NOT NULL DEFAULT '{}';
ALTER TABLE talks DROP CONSTRAINT IF EXISTS talks_publication_check;
ALTER TABLE talks ADD CONSTRAINT talks_publication_check
  CHECK (publication IN ('draft', 'scheduled', 'published') AND (publication <> 'scheduled' OR publish_at IS NOT NULL));
