-- Étape « Import » : copier chez nous une vidéo qui vit ailleurs (YouTube, Vimeo, archive.org, tout autre site ou lien direct)
-- pour qu'elle devienne une vidéo hébergée (HLS, mode audio, éditeur de montage, doublage avec mixage, extraits 9:16…).
--
-- Une demande d'import = une ligne de media_imports. Elle sert aussi de JOURNAL : qui a demandé, quand, quelle adresse, et la
-- phrase de déclaration des droits acceptée (elle survit au compte : requested_by_name est un instantané).
--   pending      en attente du transcripteur (téléchargement)
--   downloading  le transcripteur télécharge puis envoie le fichier dans Garage (stage : download | upload)
--   converting   fichier dans Garage : stage NULL = attend le worker ; stage 'convert' = le worker convertit en HLS
--   done | failed | canceled
-- NB : la table import_jobs existe déjà (listes de lecture et chaînes YouTube) : celle-ci s'appelle media_imports.

CREATE TABLE IF NOT EXISTS media_imports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id             uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  requested_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_by_name   text NOT NULL DEFAULT '',
  source_url          text NOT NULL,
  origin              text NOT NULL CHECK (origin IN ('youtube', 'vimeo', 'archive', 'web')),
  archive_file        text,                       -- archive.org : nom du fichier choisi dans l'élément
  new_talk            boolean NOT NULL DEFAULT false, -- true : conférence créée pour cet import (source 'upload' dès le départ, vidéo « importing »)
  prev_source         text,                       -- source de la conférence avant l'import (youtube, vimeo, archive) ; NULL si new_talk
  object_key          text NOT NULL,              -- clé du fichier dans Garage : talks/<uuid>
  rights_confirmed_at timestamptz NOT NULL,
  rights_text         text NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'converting', 'done', 'failed', 'canceled')),
  stage               text,
  progress            int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  bytes               bigint,
  attempts            int NOT NULL DEFAULT 0,
  convert_attempts    int NOT NULL DEFAULT 0,
  error               text,
  cancel_requested    boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_media_imports_talk ON media_imports(talk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_imports_queue ON media_imports(created_at) WHERE status IN ('pending', 'downloading', 'converting');
-- Une seule demande active par conférence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_imports_active ON media_imports(talk_id) WHERE status IN ('pending', 'downloading', 'converting');

-- Trace sur la conférence : d'où vient la vidéo hébergée.
ALTER TABLE talks ADD COLUMN IF NOT EXISTS imported_from text;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS imported_origin text;

-- La vidéo d'une conférence créée pour un import n'existe pas encore chez nous : état « importing » (ni convertie, ni en attente du worker).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'talks'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%video_status%' LOOP
    EXECUTE format('ALTER TABLE talks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE talks ADD CONSTRAINT talks_video_status_check CHECK (video_status IN ('pending', 'processing', 'ready', 'failed', 'importing'));

-- Studio → Activité : nouvelle file « import » (pause, priorité, annulation).
ALTER TABLE activity_controls DROP CONSTRAINT IF EXISTS activity_controls_queue_check;
ALTER TABLE activity_controls ADD CONSTRAINT activity_controls_queue_check
  CHECK (queue IN ('video', 'transcript', 'translation', 'dubbing', 'archive', 'editor', 'render', 'replace', 'align', 'face', 'speakers', 'import'));
