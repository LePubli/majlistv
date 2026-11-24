-- Extensions déclaratives Mejliss (lot X1) : une extension = un .zip validé (blocs gabarit, blocs composés, réglages, fonctions, textes, CSS limité à ses classes).
CREATE TABLE IF NOT EXISTS ext_packs (
  slug         text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 24),
  name         text NOT NULL,
  version      text NOT NULL,
  author       text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  manifest     jsonb NOT NULL,
  css          text NOT NULL DEFAULT '',          -- CSS déjà filtré et limité aux classes .x-<slug>
  payload      jsonb NOT NULL DEFAULT '{}',       -- { blocks, texts, settings, features } déjà validés
  installed_at timestamptz NOT NULL DEFAULT now(),
  installed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  active       boolean NOT NULL DEFAULT false,
  activated_at timestamptz
);
-- Valeurs choisies par l'administrateur : réglages (clé « s:<nom> ») et fonctions activées (clé « f:<nom> »). Gardées lors d'une mise à jour de l'extension.
CREATE TABLE IF NOT EXISTS ext_values (
  ext    text NOT NULL REFERENCES ext_packs(slug) ON DELETE CASCADE,
  key    text NOT NULL,
  value  jsonb NOT NULL,
  PRIMARY KEY (ext, key)
);
