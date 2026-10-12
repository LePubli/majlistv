-- Étape 9 bis : vidéos YouTube / Vimeo transcrites, traduites et indexées comme les vidéos envoyées,
-- et import de playlists ou de chaînes entières.

ALTER TABLE talks
  ADD COLUMN rights_confirmed  boolean NOT NULL DEFAULT false, -- l'organisateur déclare avoir l'accord de l'auteur
  ADD COLUMN external_thumb    text,                           -- miniature fournie par YouTube / Vimeo
  ADD COLUMN transcript_method text;                           -- subtitles | whisper | auto_captions

CREATE INDEX idx_talks_external_ref ON talks(source, video_ref) WHERE source <> 'upload';

CREATE TABLE import_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url           text NOT NULL,
  status        text NOT NULL DEFAULT 'listing' CHECK (status IN ('listing', 'listed', 'imported', 'failed')),
  title         text,                               -- nom de la playlist ou de la chaîne
  entries       jsonb NOT NULL DEFAULT '[]',        -- [{ id, source, title, duration, thumb, already }]
  imported      int NOT NULL DEFAULT 0,
  error         text,
  attempts      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_jobs_queue ON import_jobs(created_at) WHERE status = 'listing';
CREATE INDEX idx_import_jobs_owner ON import_jobs(organizer_id, created_at DESC);
