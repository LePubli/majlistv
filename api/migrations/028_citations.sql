-- Étape 24.6 : rappels indépendants des quiz + citations (versets du Coran et hadiths) tirées d'un corpus importé.
-- Règle d'or : l'IA n'écrit JAMAIS le texte d'une citation. Elle choisit des références parmi des candidats retrouvés dans le corpus ;
-- le texte affiché est toujours celui de la source importée (arabe + français), avec sa référence exacte.

-- Corpus importé (une ligne par verset ou par hadith).
CREATE TABLE corpus_items (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('quran', 'hadith')),
  collection text NOT NULL,                 -- 'quran' ou le recueil : bukhari, muslim, nawawi, qudsi…
  ref        text NOT NULL,                 -- « 2:153 » pour le Coran, numéro du hadith dans le recueil
  label      text NOT NULL,                 -- référence lisible : « Coran 2:153 », « Sahih al-Boukhari, n° 1 »
  text_ar    text NOT NULL,
  text_fr    text NOT NULL,
  grade      text NOT NULL DEFAULT '',      -- degré d'authenticité fourni par la source (souvent vide)
  fr_tsv     tsvector GENERATED ALWAYS AS (to_tsvector('french', text_fr)) STORED,
  UNIQUE (collection, ref)
);
CREATE INDEX idx_corpus_fts ON corpus_items USING gin (fr_tsv);
CREATE INDEX idx_corpus_kind ON corpus_items(kind);

-- Suivi de l'import du corpus (une seule ligne).
CREATE TABLE corpus_import (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status      text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'ready', 'failed')),
  message     text NOT NULL DEFAULT '',
  items       integer NOT NULL DEFAULT 0,
  started_at  timestamptz,
  finished_at timestamptz
);
INSERT INTO corpus_import(id) VALUES (1);

-- Demandes de génération de citations (reprises par le service translator).
CREATE TABLE citation_jobs (
  id         bigserial PRIMARY KEY,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  wanted     integer NOT NULL DEFAULT 10,
  produced   integer NOT NULL DEFAULT 0,
  dropped    integer NOT NULL DEFAULT 0,   -- références proposées par l'IA mais absentes de la liste de candidats (écartées)
  error      text,
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_citation_jobs_queue ON citation_jobs(created_at) WHERE status IN ('pending', 'processing');

-- Les rappels n'appartiennent plus forcément à une conférence : bibliothèque libre (saisie à la main, citations du corpus).
ALTER TABLE reminders ALTER COLUMN talk_id DROP NOT NULL;
ALTER TABLE reminders DROP CONSTRAINT reminders_origin_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_origin_check CHECK (origin IN ('transcript', 'quiz', 'manual', 'corpus'));
ALTER TABLE reminders ADD COLUMN text_ar text NOT NULL DEFAULT '';
ALTER TABLE reminders ADD COLUMN corpus_id bigint REFERENCES corpus_items(id) ON DELETE SET NULL;
ALTER TABLE reminders DROP CONSTRAINT reminders_text_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_text_check CHECK (length(text) BETWEEN 5 AND 800);
ALTER TABLE reminders ADD CONSTRAINT reminders_ar_check CHECK (length(text_ar) <= 1600);
CREATE UNIQUE INDEX idx_reminders_corpus ON reminders(corpus_id) WHERE corpus_id IS NOT NULL;
CREATE INDEX idx_reminders_created_by ON reminders(created_by) WHERE talk_id IS NULL;
