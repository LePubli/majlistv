-- Listes de vidéos (chaîne, playlist) lues par le transcripteur : à quoi elles servent.
--   videos : import de vidéos dans le catalogue (Studio → Contenus → Importer une liste), comme avant
--   audyn  : import du son de chaque vidéo dans Audyn (un contenu audio par vidéo) — ces listes n'apparaissent pas dans l'import de vidéos
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'videos' CHECK (purpose IN ('videos', 'audyn'));
