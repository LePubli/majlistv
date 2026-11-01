-- Étape 45B2 : récitateurs (lus depuis leur source), mot à mot et couleurs du tajwid (aucune donnée fournie : tout vient de l'administration).
CREATE TABLE IF NOT EXISTS quran_reciters (
  id           serial PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  url_template text NOT NULL,           -- ex. https://hote/chemin/{sura3}{aya3}.mp3
  source_url   text NOT NULL DEFAULT '',
  license      text NOT NULL DEFAULT '',
  credit       text NOT NULL DEFAULT '',
  enabled      boolean NOT NULL DEFAULT false,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Mot à mot : les sens des mots d'un verset, dans l'ordre des mots du texte arabe (ressource de type « words »).
CREATE TABLE IF NOT EXISTS quran_words (
  resource_id integer NOT NULL REFERENCES quran_resources(id) ON DELETE CASCADE,
  sura        smallint NOT NULL,
  aya         smallint NOT NULL,
  words       text[] NOT NULL,
  PRIMARY KEY (resource_id, sura, aya)
);
-- Tajwid : règles par verset, positions en caractères du texte arabe (ressource de type « tajweed »).
CREATE TABLE IF NOT EXISTS quran_tajweed (
  resource_id integer NOT NULL REFERENCES quran_resources(id) ON DELETE CASCADE,
  sura        smallint NOT NULL,
  aya         smallint NOT NULL,
  marks       jsonb NOT NULL,
  PRIMARY KEY (resource_id, sura, aya)
);
ALTER TABLE quran_resources DROP CONSTRAINT IF EXISTS quran_resources_kind_check;
ALTER TABLE quran_resources ADD CONSTRAINT quran_resources_kind_check CHECK (kind IN ('text', 'translation', 'transliteration', 'tafsir', 'words', 'tajweed'));
