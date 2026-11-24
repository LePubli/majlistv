-- Éditeur visuel, étape 4b : le Catalogue du thème Premium peut être recomposé en blocs (page « catalogue », adresse interne /_catalogue).
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_kind_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_kind_check CHECK (kind IN ('custom', 'slot', 'home', 'catalogue', 'layout'));

-- Zones « toutes les pages de ce genre » : /conferences/*, /series/*, /catalogue/* (le joker n'est permis qu'à la fin, derrière un genre connu).
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_path_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_path_check CHECK (path ~ '^/[a-z0-9_/-]{0,98}$' OR path IN ('/conferences/*', '/series/*', '/catalogue/*'));
