-- Import d'une chaîne dans Audyn : détail de chaque vidéo consultable AVANT l'import (description, chaîne, date, chapitres,
-- langues audio). La liste (import_jobs.entries) ne contient que titre, durée et miniature ; le détail est lu à la demande par le
-- transcripteur (yt-dlp) : { "<id vidéo>": { "status": "wanted" | "done" | "failed", ... } }.
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
