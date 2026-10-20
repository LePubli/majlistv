-- Shorts publics (registre n°49) : affiche tirée de la vidéo du short (image à 1 s), à défaut la miniature de la conférence.
ALTER TABLE public_shorts ADD COLUMN IF NOT EXISTS poster_key text;
