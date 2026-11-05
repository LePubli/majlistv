-- Amélioration 3.5 : références citées dans une conférence (versets du Coran, hadiths), repérées par l'IA puis relues par un humain.
-- Règle d'or : l'IA ne produit JAMAIS de texte religieux. Elle indique seulement OÙ une référence est citée (extrait mot pour mot de la
-- transcription) et LAQUELLE ; le texte affiché vient toujours du Coran / du corpus importé (voir lib.js). Les hadiths sont toujours relus.
CREATE TABLE IF NOT EXISTS talk_references (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('quran', 'hadith')),
  sura        smallint CHECK (sura BETWEEN 1 AND 114),
  aya_from    smallint CHECK (aya_from BETWEEN 1 AND 286),
  aya_to      smallint CHECK (aya_to BETWEEN 1 AND 286),
  collection  text NOT NULL DEFAULT '',          -- hadith : bukhari, muslim, nawawi, qudsi… (vide = source non précisée)
  number      text NOT NULL DEFAULT '',          -- hadith : numéro dans le recueil, tel que dit par l'intervenant
  said_as     text NOT NULL DEFAULT '' CHECK (char_length(said_as) <= 200),  -- source telle que l'intervenant l'a nommée (« rapporté par Boukhari »)
  ref_key     text NOT NULL,                     -- clé de la référence (une seule ligne par référence et par vidéo)
  start_ms    integer,                           -- minute où la référence est citée
  excerpt     text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 1500),  -- passage de la transcription, mot pour mot
  match       smallint CHECK (match BETWEEN 0 AND 100),  -- concordance entre le passage et le texte de la source (null = non mesurée)
  found       boolean NOT NULL DEFAULT false,    -- le texte de la source a été retrouvé (Coran importé ou corpus)
  origin      text NOT NULL DEFAULT 'manual' CHECK (origin IN ('ai', 'manual')),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talk_id, ref_key),
  CONSTRAINT tr_quran_ref CHECK (kind <> 'quran' OR (sura IS NOT NULL AND aya_from IS NOT NULL AND aya_to IS NOT NULL AND aya_to >= aya_from AND aya_to - aya_from < 10))
);
CREATE INDEX IF NOT EXISTS idx_talk_refs_talk ON talk_references(talk_id, status);
CREATE INDEX IF NOT EXISTS idx_talk_refs_review ON talk_references(created_at) WHERE status = 'draft';

-- Demandes de détection (une par vidéo) : reprises par le service translator.
CREATE TABLE IF NOT EXISTS reference_jobs (
  talk_id    uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  lang       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  produced   integer NOT NULL DEFAULT 0,
  dropped    integer NOT NULL DEFAULT 0,
  error      text,
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reference_jobs_queue ON reference_jobs(created_at) WHERE status IN ('pending', 'processing');
