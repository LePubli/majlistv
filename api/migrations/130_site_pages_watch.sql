-- Éditeur visuel, étape 6b : la fiche vidéo peut être recomposée en blocs (page « watch », adresse interne /_watch).
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_kind_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_kind_check CHECK (kind IN ('custom', 'slot', 'home', 'catalogue', 'watch', 'layout'));
