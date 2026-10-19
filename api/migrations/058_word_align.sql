-- Étape E5c : « Préciser la place des mots ». Demandes de recalcul de l'horodatage des mots d'une conférence déjà transcrite
-- (le texte et les traductions ne changent pas). Une ligne par conférence ; le service de transcription la traite
-- (réécoute l'audio, retrouve chaque mot du texte existant et note son moment exact dans transcript_words).
CREATE TABLE IF NOT EXISTS word_align_jobs (
  talk_id      uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  lang         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  progress     int  NOT NULL DEFAULT 0,
  attempts     int  NOT NULL DEFAULT 0,
  error        text,
  aligned      int,
  total        int,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_align_jobs_pending ON word_align_jobs (created_at) WHERE status = 'pending';
