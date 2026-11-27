-- Images des catégories et sous-catégories envoyées depuis l'admin : clés du stockage (Garage/S3).
-- Les colonnes image / hero_image gardent l'adresse utilisée par le site (/api/catalogue/category-image/<id>/<image|hero>?v=…),
-- qui renvoie vers un lien temporaire : l'image reste affichable partout sans lien qui expire.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_key text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hero_image_key text;
