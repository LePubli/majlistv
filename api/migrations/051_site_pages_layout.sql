-- Étape I4 : « En-tête, menus et pied de page » devient une page de réglages (kind = 'layout', adresse interne /_layout).
-- Même mécanique que les pages en blocs : brouillon, publication, historique, mise hors ligne.
-- Tant qu'elle n'est pas publiée (ou si elle est supprimée / hors ligne), le site garde ses menus d'origine.
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_kind_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_kind_check CHECK (kind IN ('custom', 'slot', 'home', 'layout'));
