-- Étape I3 : pages en blocs (Admin → Pages).
--  kind = 'custom' : page créée dans l'administration, adresse /p/<nom> (contenu = zone « main »).
--  kind = 'slot'   : blocs ajoutés AVANT / APRÈS une page existante du site (path = son adresse, ex. /pricing).
-- published = ce que voient les visiteurs (si live) ; draft = brouillon en cours (NULL = aucun).
-- Contenu : { meta: { title, description }, zones: { main: [blocs] } ou { before: [blocs], after: [blocs] } } (voir api/src/blocks.js).
CREATE TABLE site_pages (
  id           serial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('custom', 'slot')),
  path         text NOT NULL UNIQUE CHECK (path ~ '^/[a-z0-9_/-]{0,98}$'),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  published    jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft        jsonb,
  live         boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Historique : une ligne par publication (les 20 dernières par page sont gardées).
CREATE TABLE site_page_versions (
  id         serial PRIMARY KEY,
  page_id    integer NOT NULL REFERENCES site_pages(id) ON DELETE CASCADE,
  content    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX site_page_versions_page ON site_page_versions (page_id, id DESC);

-- Images envoyées pour les blocs (fichiers dans le stockage, site/pages/<id>.<ext>).
CREATE TABLE site_page_media (
  id           uuid PRIMARY KEY,
  name         text NOT NULL,
  content_type text NOT NULL,
  storage_key  text NOT NULL,
  size_bytes   integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL
);
