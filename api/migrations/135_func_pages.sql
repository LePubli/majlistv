-- Éditeur visuel, lot C : pages « fonction » découpées en sections (tarifs, compte, bibliothèque…), adresse interne /_func/<page>.
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_kind_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_kind_check CHECK (kind IN ('custom', 'slot', 'home', 'catalogue', 'watch', 'layout', 'global', 'func'));
