-- Étape 29 : mise en pratique (« Et maintenant, que faire ? »).
-- Propositions d'action liées à une conférence (relues par un humain avant publication) et engagements personnels des membres
-- du palier Apprentissage. Les textes personnels (action choisie ou écrite, intention, note) sont CHIFFRÉS avec PRACTICE_KEY.

-- Propositions d'action : 3 à 5 par conférence, en trois tailles (1 petit pas, 2 moyen, 3 ambitieux).
CREATE TABLE practice_suggestions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id        uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  lang           text NOT NULL,
  text           text NOT NULL,                       -- l'action, à l'infinitif ou à l'impératif, concrète et réalisable
  size           int  NOT NULL DEFAULT 1 CHECK (size BETWEEN 1 AND 3),
  reference      text NOT NULL DEFAULT '',            -- référence facultative saisie par le relecteur (corpus importé), jamais par l'IA
  evidence_ms    int,                                 -- minute où l'intervenant donne l'enseignement dont l'action découle
  evidence_quote text NOT NULL DEFAULT '',            -- passage de la transcription (mot pour mot) qui justifie la proposition
  origin         text NOT NULL DEFAULT 'manual' CHECK (origin IN ('ai', 'manual')),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_practice_sugg_talk ON practice_suggestions(talk_id, status);
CREATE INDEX idx_practice_sugg_review ON practice_suggestions(created_at) WHERE status = 'draft';

-- Demandes de génération (une par conférence) : reprises par le service translator.
CREATE TABLE practice_jobs (
  talk_id    uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  lang       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  wanted     int  NOT NULL DEFAULT 4,
  produced   int  NOT NULL DEFAULT 0,
  dropped    int  NOT NULL DEFAULT 0,
  error      text,
  attempts   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_practice_jobs_queue ON practice_jobs(created_at) WHERE status IN ('pending', 'processing');

-- Engagements d'un membre. Aucune donnée en clair : text_enc, niyya_enc et note_enc sont chiffrés (AES-256-GCM, PRACTICE_KEY).
CREATE TABLE practice_commitments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id       uuid REFERENCES talks(id) ON DELETE SET NULL,   -- la conférence peut disparaître, l'engagement reste
  suggestion_id uuid REFERENCES practice_suggestions(id) ON DELETE SET NULL,
  size          int  CHECK (size BETWEEN 1 AND 3),
  text_enc      text NOT NULL,
  niyya_enc     text NOT NULL DEFAULT '',
  note_enc      text NOT NULL DEFAULT '',
  due_kind      text CHECK (due_kind IN ('today', 'week', 'month')),
  due_on        date,
  status        text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'not_yet')),
  done_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_practice_commit_user ON practice_commitments(user_id, status, created_at DESC);

-- Consentement explicite au traitement de ces notes personnelles (RGPD, données pouvant révéler des convictions religieuses).
ALTER TABLE users ADD COLUMN practice_consent_at timestamptz;
