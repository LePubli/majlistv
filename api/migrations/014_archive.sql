-- Internet Archive (archive.org) : troisième source de vidéos externes, à côté de YouTube et Vimeo.
-- video_ref = identifiant de l'élément archive.org ; external_file = fichier vidéo lu par le lecteur Mejliss TV
-- (MP4 servi directement par archive.org : ni lecteur, ni logo, ni publicité de la plateforme).
ALTER TABLE talks DROP CONSTRAINT talks_source_check;
ALTER TABLE talks ADD CONSTRAINT talks_source_check CHECK (source IN ('youtube', 'vimeo', 'archive', 'upload'));
ALTER TABLE talks ADD COLUMN external_file text;
