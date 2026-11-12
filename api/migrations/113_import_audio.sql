-- Import : piste audio française de la plateforme d'origine (YouTube propose des pistes doublées dans plusieurs langues).
-- À l'import, on prend la piste française quand elle existe, à la place de la voix d'origine. Pour une vidéo déjà importée,
-- « Récupérer la voix française » relance un import (reimport) qui remplace la vidéo hébergée par la même vidéo en français.
--   media_imports.audio_lang   langue audio demandée ('fr') ; NULL = voix d'origine
--   media_imports.audio_used   piste réellement prise ('fr') ; NULL = voix d'origine (la vidéo n'a pas de piste dans cette langue)
--   media_imports.reimport     true : la vidéo est déjà hébergée, on la remplace (seulement si la piste demandée existe)
--   talks.audio_track          'fr' : la vidéo hébergée porte une piste française venue de la plateforme (pas de doublage maison à faire)
ALTER TABLE media_imports ADD COLUMN IF NOT EXISTS audio_lang text CHECK (audio_lang IS NULL OR audio_lang ~ '^[a-z]{2}$');
ALTER TABLE media_imports ADD COLUMN IF NOT EXISTS audio_used text CHECK (audio_used IS NULL OR audio_used ~ '^[a-z]{2}$');
ALTER TABLE media_imports ADD COLUMN IF NOT EXISTS reimport boolean NOT NULL DEFAULT false;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS audio_track text CHECK (audio_track IS NULL OR audio_track ~ '^[a-z]{2}$');
