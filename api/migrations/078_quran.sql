-- Étape 45B : socle Coran. Chaque ressource (texte arabe, traduction, phonétique, tafsir) garde sa source, sa licence et son crédit.
-- Aucun texte n'est fourni avec le logiciel : l'administrateur importe les ressources qu'il a le droit d'utiliser (Admin → Coran).
CREATE TABLE IF NOT EXISTS quran_resources (
  id          serial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('text', 'translation', 'transliteration', 'tafsir')),
  lang        text NOT NULL,
  name        text NOT NULL,
  author      text NOT NULL DEFAULT '',
  source_url  text NOT NULL DEFAULT '',
  license     text NOT NULL DEFAULT '',
  credit      text NOT NULL DEFAULT '',
  enabled     boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  verse_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quran_verses (
  resource_id integer NOT NULL REFERENCES quran_resources(id) ON DELETE CASCADE,
  sura        smallint NOT NULL CHECK (sura BETWEEN 1 AND 114),
  aya         smallint NOT NULL CHECK (aya BETWEEN 1 AND 286),
  text        text NOT NULL,
  PRIMARY KEY (resource_id, sura, aya)
);
CREATE INDEX IF NOT EXISTS idx_quran_verses_sura ON quran_verses (resource_id, sura, aya);
