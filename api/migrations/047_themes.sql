-- Étape I1 : apparence réglable depuis Admin → Apparence.
-- Un thème ne garde que les réglages modifiés par rapport aux valeurs d'origine (voir api/src/themeCss.js).
-- published = ce que voient les visiteurs (si le thème est actif) ; draft = brouillon en cours (NULL = aucun).
CREATE TABLE themes (
  id           serial PRIMARY KEY,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  published    jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft        jsonb,
  is_active    boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES users(id) ON DELETE SET NULL
);
-- Un seul thème actif à la fois.
CREATE UNIQUE INDEX themes_one_active ON themes (is_active) WHERE is_active;

-- Historique : une ligne par publication (les 50 dernières par thème sont gardées).
CREATE TABLE theme_versions (
  id         serial PRIMARY KEY,
  theme_id   int NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  vals       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX theme_versions_theme ON theme_versions (theme_id, id DESC);

-- Polices importées (fichiers dans le stockage, servis par GET /theme/fonts/:id).
CREATE TABLE theme_fonts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family      text NOT NULL,
  weight      text NOT NULL DEFAULT '400',
  style       text NOT NULL DEFAULT 'normal' CHECK (style IN ('normal', 'italic')),
  format      text NOT NULL CHECK (format IN ('woff2', 'woff', 'truetype', 'opentype')),
  storage_key text NOT NULL,
  size_bytes  int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Thème d'origine : aucune valeur modifiée = l'apparence actuelle du site, à l'identique.
INSERT INTO themes (name, is_active, published_at) VALUES ('Mejliss TV (origine)', true, now());
