-- Étape 23a : Dailymotion devient une source de vidéos (lue depuis leur lecteur, comme YouTube et Vimeo).
ALTER TABLE talks DROP CONSTRAINT talks_source_check;
ALTER TABLE talks ADD CONSTRAINT talks_source_check CHECK (source IN ('youtube', 'vimeo', 'archive', 'dailymotion', 'upload'));

-- Import « chez nous » : l'origine peut être Dailymotion.
ALTER TABLE media_imports DROP CONSTRAINT IF EXISTS media_imports_origin_check;
ALTER TABLE media_imports ADD CONSTRAINT media_imports_origin_check CHECK (origin IN ('youtube', 'vimeo', 'dailymotion', 'archive', 'web'));
