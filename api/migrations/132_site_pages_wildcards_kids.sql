-- Éditeur visuel, lot A (suite) : l'espace Kids est ouvert ; ses zones « toutes les pages de ce genre » ont deux niveaux (/kids/histoires/*).
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_path_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_path_check CHECK (path ~ '^/[a-z0-9_/-]{0,98}$' OR path ~ '^/[a-z0-9_-]{1,40}(/[a-z0-9_-]{1,40})?/\*$');
