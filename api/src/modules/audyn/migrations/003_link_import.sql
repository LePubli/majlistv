-- Audyn — import depuis un lien (vidéo YouTube, archive.org, Vimeo, Dailymotion, autre site, lien direct) : seul le son est gardé
-- (MP3), l'image de la vidéo peut devenir la couverture (carrée, image entière sur fond flou). Le travail est fait par le service
-- de transcription (majlistv-transcriber, transcriber/src/audyn_import.py) ; l'API ne fait qu'ouvrir et suivre les demandes.
--   kind     audio : un chapitre à créer ; cover : seulement l'image de la vidéo comme couverture
--   cover    auto : l'image devient la couverture si le contenu n'en a pas ; replace : elle remplace la couverture ; none : rien
--   parent   une playlist (ou un élément archive.org à plusieurs fichiers audio) est découpée en demandes filles, une par vidéo / fichier,
--            dans l'ordre (seq) ; la demande « mère » passe à « done » avec le nombre de demandes ajoutées (added).
CREATE TABLE IF NOT EXISTS audyn_imports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           uuid NOT NULL REFERENCES audyn_items(id) ON DELETE CASCADE,
  parent_id         uuid REFERENCES audyn_imports(id) ON DELETE SET NULL,
  seq               integer NOT NULL DEFAULT 0,
  kind              text NOT NULL DEFAULT 'audio' CHECK (kind IN ('audio', 'cover')),
  source_url        text NOT NULL,
  origin            text NOT NULL,
  archive_file      text,
  title             text NOT NULL DEFAULT '',
  audio_lang        text CHECK (audio_lang IS NULL OR audio_lang ~ '^[a-z]{2}$'),
  audio_used        text,
  cover             text NOT NULL DEFAULT 'auto' CHECK (cover IN ('auto', 'replace', 'none')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'done', 'failed', 'canceled')),
  progress          integer NOT NULL DEFAULT 0,
  error             text,
  note              text,
  attempts          integer NOT NULL DEFAULT 0,
  cancel_requested  boolean NOT NULL DEFAULT false,
  added             integer NOT NULL DEFAULT 0,
  chapter_id        uuid REFERENCES audyn_chapters(id) ON DELETE SET NULL,
  requested_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_by_name text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);
CREATE INDEX IF NOT EXISTS audyn_imports_queue_idx ON audyn_imports(status, created_at, seq);
CREATE INDEX IF NOT EXISTS audyn_imports_item_idx ON audyn_imports(item_id, created_at DESC);

-- Lien d'origine d'un chapitre importé (bouton « Utiliser l'image de la vidéo ») et du journal des attestations.
ALTER TABLE audyn_chapters ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE audyn_rights_log ADD COLUMN IF NOT EXISTS source_url text;
