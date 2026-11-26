-- Shorts autonomes (étape A, 26/11) : un short peut exister SANS conférence (importé depuis la page « Shorts » d'une chaîne YouTube,
-- ou envoyé directement). Il a alors ses propres catégories, son public (adultes ou Kids + tranches d'âge) et son auteur.
-- Deux façons de le lire :
--   play = 'file'     la vidéo est copiée chez nous (video_key) ; tant que copy_status <> 'done', le short n'est pas visible ;
--   play = 'youtube'  la vidéo est lue depuis YouTube (video_ref), rien n'est copié.
-- Chaque import garde la déclaration des droits acceptée (journal : qui, quand, quel texte).
ALTER TABLE public_shorts ALTER COLUMN talk_id DROP NOT NULL;
ALTER TABLE public_shorts ALTER COLUMN video_key DROP NOT NULL;
ALTER TABLE public_shorts
  ADD COLUMN IF NOT EXISTS play                text NOT NULL DEFAULT 'file',
  ADD COLUMN IF NOT EXISTS video_ref           text,
  ADD COLUMN IF NOT EXISTS source_url          text,
  ADD COLUMN IF NOT EXISTS thumb_url           text,
  ADD COLUMN IF NOT EXISTS author              text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category_id         integer REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalogue           text NOT NULL DEFAULT 'adult',
  ADD COLUMN IF NOT EXISTS kids_bands          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS copy_status         text,
  ADD COLUMN IF NOT EXISTS copy_error          text,
  ADD COLUMN IF NOT EXISTS copy_attempts       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rights_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rights_text         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS imported_by_name    text NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE public_shorts ADD CONSTRAINT public_shorts_play_chk CHECK (play IN ('file', 'youtube'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public_shorts ADD CONSTRAINT public_shorts_catalogue_chk CHECK (catalogue IN ('adult', 'kids'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public_shorts ADD CONSTRAINT public_shorts_copy_chk CHECK (copy_status IS NULL OR copy_status IN ('pending', 'downloading', 'done', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Un même short YouTube n'est importé qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_shorts_ref ON public_shorts(video_ref) WHERE video_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_public_shorts_copy ON public_shorts(created_at) WHERE copy_status IN ('pending', 'downloading');
-- Catégories en plus de la catégorie principale (comme talk_categories pour les conférences).
CREATE TABLE IF NOT EXISTS public_short_categories (
  short_id    uuid    NOT NULL REFERENCES public_shorts(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (short_id, category_id)
);
-- Les listes lues par le transcripteur peuvent servir aux shorts.
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_purpose_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_purpose_check CHECK (purpose IN ('videos', 'audyn', 'shorts'));
