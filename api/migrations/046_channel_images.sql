-- Étape E2 : image de profil (avatar) et bannière d'une chaîne. Clés de stockage ; vide = lettre initiale / aucune bannière.
ALTER TABLE speakers ADD COLUMN avatar_key text, ADD COLUMN banner_key text;
