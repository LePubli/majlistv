-- Audyn — découpage selon les chapitres de la vidéo (repères placés par l'auteur sur YouTube) : un fichier MP3 par chapitre.
--   split            true : découper si la vidéo a au moins 2 chapitres (sinon un seul fichier, comme avant)
--   replace_chapter  « Redécouper » : ce chapitre Audyn (un seul long fichier) est remplacé, à sa place, par les morceaux
--   parts            nombre de chapitres Audyn créés par la demande
ALTER TABLE audyn_imports ADD COLUMN IF NOT EXISTS split boolean NOT NULL DEFAULT true;
-- Sans clé étrangère : si le chapitre est supprimé entre-temps, la demande le voit (échec expliqué) au lieu d'ajouter à la fin.
ALTER TABLE audyn_imports ADD COLUMN IF NOT EXISTS replace_chapter uuid;
ALTER TABLE audyn_imports ADD COLUMN IF NOT EXISTS parts integer NOT NULL DEFAULT 0;
