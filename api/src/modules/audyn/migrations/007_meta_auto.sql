-- Audyn — titre, auteur et description « repris de la vidéo » (13/11).
-- meta_auto = vrai : ces informations viennent de la vidéo (import d'une chaîne) et peuvent être relues (en français) depuis la
-- vidéo ; toute modification à la main (titre, auteur, description) le remet à faux : on n'y touche plus.
-- Nouveau type de demande « meta » : relire titre, auteur et description de la vidéo, sans retélécharger le son
-- (bouton « Reprendre titre et description de la vidéo » du Studio).
ALTER TABLE audyn_items ADD COLUMN IF NOT EXISTS meta_auto boolean NOT NULL DEFAULT false;
-- Contenus créés par l'import d'une chaîne (titres de la liste, en anglais avant le 13/11).
UPDATE audyn_items SET meta_auto = true WHERE id IN (SELECT item_id FROM audyn_imports WHERE fill_meta);
ALTER TABLE audyn_imports DROP CONSTRAINT IF EXISTS audyn_imports_kind_check;
ALTER TABLE audyn_imports ADD CONSTRAINT audyn_imports_kind_check CHECK (kind IN ('audio', 'cover', 'meta'));
