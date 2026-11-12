-- Description des vidéos reprise de leur plateforme (YouTube, Vimeo, Dailymotion, archive.org, ou adresse d'origine d'une vidéo
-- importée chez nous) quand la conférence n'en a pas : le serveur de l'API ne peut pas toujours lire la page de la vidéo à
-- l'enregistrement, le transcripteur (yt-dlp) le peut. Il passe sur les conférences sans description, 3 essais au plus.
ALTER TABLE talks ADD COLUMN IF NOT EXISTS meta_tries smallint NOT NULL DEFAULT 0;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS meta_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_talks_meta_fill ON talks(created_at DESC) WHERE description = '' AND meta_tries < 3;
