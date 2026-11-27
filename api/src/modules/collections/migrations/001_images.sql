-- 27/11 : images propres aux collections (affiche pour les vignettes, couverture pour l'en-tête de la page).
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS poster_key text,
  ADD COLUMN IF NOT EXISTS cover_key  text;
