-- Éditeur visuel, lot A : zones « toutes les pages de ce genre » pour toutes les familles de pages (/chaines/*, /books/*, /legal/*…).
-- La liste exacte des familles autorisées est tenue par l'API (SITE_PAGES) ; la base accepte la forme « /nom/* ».
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_path_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_path_check CHECK (path ~ '^/[a-z0-9_/-]{0,98}$' OR path ~ '^/[a-z0-9_-]{1,40}/\*$');
