-- Étape E4b (éditeur de montage : remplacement de la vidéo publiée) : dossier des fichiers HLS d'une conférence.
-- NULL = dossier d'origine hls/<id>/ (toutes les conférences existantes). Après un remplacement : hls/<id>/r/<remplacement>/.
-- Les playlists déjà ouvertes par un spectateur gardent leur version (paramètre v des liens) : aucune coupure pendant la bascule.
ALTER TABLE talks ADD COLUMN IF NOT EXISTS media_prefix text;
