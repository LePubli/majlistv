-- Étape H : l'accueil des membres devient une page en blocs (kind = 'home', adresse interne /_home).
-- Tant qu'elle n'est pas publiée (ou si elle est supprimée / mise hors ligne), l'accueil d'origine s'affiche.
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_kind_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_kind_check CHECK (kind IN ('custom', 'slot', 'home'));
