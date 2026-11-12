-- Audyn — import d'une chaîne ou d'une playlist : un contenu audio par vidéo.
--   fill_meta  le contenu a été créé pour cette vidéo : auteur (nom de la chaîne) et description remplis avec ceux de la vidéo s'ils sont vides
--   publish    le contenu est publié dès que son son est prêt (sinon il reste en brouillon)
ALTER TABLE audyn_imports ADD COLUMN IF NOT EXISTS fill_meta boolean NOT NULL DEFAULT false;
ALTER TABLE audyn_imports ADD COLUMN IF NOT EXISTS publish boolean NOT NULL DEFAULT false;
