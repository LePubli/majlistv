-- Module « Doublage français », étape D1b : relecture, marquage « voix d'origine », glossaire de prononciation, contrôle qualité.

-- Réglages d'une phrase française pour le doublage (le texte lui-même reste dans transcript_segments : le corriger corrige aussi
-- les sous-titres français). keep_original = verset, hadith, invocation : jamais lu par la voix de synthèse.
-- accepted = phrase « à revoir » acceptée telle quelle au contrôle qualité.
CREATE TABLE dub_segments (
  talk_id        uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  idx            int NOT NULL,
  keep_original  boolean NOT NULL DEFAULT false,
  accepted       boolean NOT NULL DEFAULT false,
  updated_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talk_id, idx)
);

-- Relecture validée : empreinte du texte et des marquages au moment de la validation. Toute modification ultérieure
-- (texte, voix d'origine) rend la relecture « à refaire ».
CREATE TABLE dub_reviews (
  talk_id      uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  text_hash    text NOT NULL,
  reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz NOT NULL DEFAULT now()
);

-- Glossaire de prononciation unique (tout le site) : « terme » écrit tel quel dans les sous-titres → « prononciation » envoyée
-- à la voix de synthèse (ex. « Ibn Outhaymine » → « Ibne Outhaïmine »).
CREATE TABLE dub_glossary (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term           text NOT NULL,
  say            text NOT NULL,
  whole_word     boolean NOT NULL DEFAULT true,
  case_sensitive boolean NOT NULL DEFAULT false,
  notes          text NOT NULL DEFAULT '',
  active         boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dub_glossary_term ON dub_glossary(lower(term));
