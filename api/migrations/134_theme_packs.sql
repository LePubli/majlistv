-- Thèmes uploadables « Mejliss » (lot T) : un thème = un .zip validé (theme.json, CSS filtré, polices, images, pages, modèles).
CREATE TABLE IF NOT EXISTS theme_packs (
  slug         text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 40),
  name         text NOT NULL,
  version      text NOT NULL,
  author       text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  base         text NOT NULL CHECK (base IN ('classique', 'nuit', 'bleu', 'premium')),
  manifest     jsonb NOT NULL,
  css          text NOT NULL DEFAULT '',          -- CSS déjà filtré, adresses réécrites vers /api/theme-pack/<slug>/…
  tokens       jsonb NOT NULL DEFAULT '{}',       -- jetons (couleurs, polices, arrondis…) déjà validés
  fonts        jsonb NOT NULL DEFAULT '[]',       -- [{ family, weight, style, file, format }]
  files        jsonb NOT NULL DEFAULT '{}',       -- chemin → { key, type, size } (images et polices, dans le stockage)
  payload      jsonb NOT NULL DEFAULT '{}',       -- pages, sections globales, modèles (à appliquer à l'activation, en brouillon)
  installed_at timestamptz NOT NULL DEFAULT now(),
  installed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  active       boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  previous     jsonb                              -- état avant activation : { skin, themeId, packThemeId } pour revenir en arrière
);
CREATE UNIQUE INDEX IF NOT EXISTS theme_packs_one_active ON theme_packs ((true)) WHERE active;
