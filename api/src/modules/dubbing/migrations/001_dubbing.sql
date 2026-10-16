-- Module « Doublage français », étape S1 : bibliothèque de voix, réglages, suivi de la langue d'écoute.

-- Voix : « base » = voix de synthèse qui lit le texte (Piper) ; « target » = voix cible de la conversion (échantillon + consentement).
CREATE TABLE dub_voices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE,                      -- voix fournies d'origine (tom, siwis…) ; NULL pour les voix ajoutées
  kind          text NOT NULL CHECK (kind IN ('base', 'target')),
  name          text NOT NULL,
  engine        text NOT NULL DEFAULT 'piper',
  model         text,                             -- base : modèle Piper (ex. fr_FR-tom-medium)
  speaker       int,                              -- base : numéro de locuteur (modèles à plusieurs voix)
  gender        text NOT NULL DEFAULT '' CHECK (gender IN ('', 'male', 'female', 'child')),
  sample_key    text,                             -- target : échantillon dans le stockage
  sample_bytes  bigint,
  license       text NOT NULL DEFAULT '',
  notes         text NOT NULL DEFAULT '',
  consent_date  date,                             -- target : date du consentement de la personne
  consent_by    text,                             -- target : nom de la personne qui consent
  consent_recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  consent_recorded_at timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'base' OR model IS NOT NULL),
  CHECK (kind <> 'target' OR (sample_key IS NOT NULL AND consent_date IS NOT NULL AND consent_by IS NOT NULL))
);

-- Voix de base françaises de Piper (licences relevées sur les fiches des modèles le 16/10/2026 : à valider avant un usage commercial).
INSERT INTO dub_voices(slug, kind, name, model, speaker, gender, license, notes) VALUES
  ('tom', 'base', 'Tom', 'fr_FR-tom-medium', NULL, 'male', 'AGPL-3.0 (poids) + conditions de l''auteur',
   'Voix humaine réelle. Conditions : ne pas la présenter comme la voix d''une personne réelle ou identifiée ; ne pas mentionner l''identité de l''auteur ; tout modèle de voix entraîné à partir des poids ou de l''audio généré doit être publié en AGPL-3.0 ; conserver les notices. Source : github.com/tjiho/French-tts-model-piper. À valider avec l''auteur avant un service payant.'),
  ('siwis', 'base', 'Siwis', 'fr_FR-siwis-medium', NULL, 'female', 'à vérifier', 'Testée le 16/10/2026 : jugée « trop IA » par Epok.'),
  ('gilles', 'base', 'Gilles', 'fr_FR-gilles-low', NULL, '', 'CC0', 'Qualité basse (16 kHz). Genre non indiqué sur la fiche : à vérifier à l''écoute.'),
  ('upmc-0', 'base', 'UPMC · locuteur 0', 'fr_FR-upmc-medium', 0, '', 'CC BY-SA 4.0', 'Genre non indiqué sur la fiche : à vérifier à l''écoute.'),
  ('upmc-1', 'base', 'UPMC · locuteur 1', 'fr_FR-upmc-medium', 1, '', 'CC BY-SA 4.0', 'Genre non indiqué sur la fiche : à vérifier à l''écoute.'),
  ('mls-1840', 'base', 'MLS 1840', 'fr_FR-mls_1840-low', NULL, '', 'CC BY 4.0', 'Qualité basse. Genre non indiqué sur la fiche : à vérifier à l''écoute.');

-- Réglages par défaut (une seule ligne) et réglages propres à une conférence (seulement les valeurs changées).
CREATE TABLE dub_defaults (
  id          int PRIMARY KEY CHECK (id = 1),
  params      jsonb NOT NULL DEFAULT '{}',
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dub_defaults(id, params) SELECT 1, jsonb_build_object('baseVoice', id::text) FROM dub_voices WHERE slug = 'tom';

CREATE TABLE dub_talk_settings (
  talk_id     uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  params      jsonb NOT NULL DEFAULT '{}',
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Temps d'écoute par jour, conférence et langue de l'audio (« orig » = audio d'origine, « fr » = version française).
CREATE TABLE dub_listen (
  day         date NOT NULL,
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  audio_lang  text NOT NULL CHECK (audio_lang IN ('orig', 'fr')),
  seconds     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, talk_id, audio_lang)
);
CREATE INDEX dub_listen_talk ON dub_listen(talk_id);
