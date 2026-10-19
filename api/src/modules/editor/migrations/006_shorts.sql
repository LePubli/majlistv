-- Étape E5b (éditeur de montage : extraits courts 9:16).
-- Un extrait court est un projet de montage de type « short » (editor_projects.kind = 'short', prévu dès l'étape E1) :
--   timeline = un seul extrait de la vidéo (le passage choisi) ; short = réglages propres à l'extrait vertical :
--   { cropX (0 à 100 : position du cadre vertical), captions (sous-titres courts), lang (langue des sous-titres, null = langue parlée),
--     dub (voix française), showTitle (titre affiché au début) }.
-- Son rendu passe par la même file que les rendus du montage (editor_renders) : image verticale 1080 × 1920 (ou 720 × 1280 / 360 × 640).
ALTER TABLE editor_projects ADD COLUMN IF NOT EXISTS short jsonb;
CREATE INDEX IF NOT EXISTS editor_projects_shorts ON editor_projects(talk_id, updated_at DESC) WHERE kind = 'short';
