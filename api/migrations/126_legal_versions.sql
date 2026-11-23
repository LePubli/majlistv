-- Pages légales : historique des textes personnalisés (23/11/2026).
-- Chaque enregistrement d'un texte personnalisé garde une version numérotée ; on peut relire une ancienne version et la remettre.
-- Les pages qui suivent le modèle automatique n'ont pas de version (leur texte vient du code, daté par LEGAL_TEMPLATES_DATE).
CREATE TABLE IF NOT EXISTS legal_page_versions (
  id         bigserial PRIMARY KEY,
  slug       text NOT NULL,
  version    integer NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  title_en   text NOT NULL DEFAULT '',
  body_en    text NOT NULL DEFAULT '',
  title_ar   text NOT NULL DEFAULT '',
  body_ar    text NOT NULL DEFAULT '',
  saved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  restored_from integer,                     -- numéro de la version remise en place (vide pour un enregistrement normal)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);
CREATE INDEX IF NOT EXISTS idx_legal_versions_slug ON legal_page_versions(slug, version DESC);

-- Textes personnalisés déjà enregistrés : version 1 (date de leur dernière modification).
INSERT INTO legal_page_versions(slug, version, title, body, title_en, body_en, title_ar, body_ar, saved_by, created_at)
SELECT slug, 1, title, body, COALESCE(title_en, ''), COALESCE(body_en, ''), COALESCE(title_ar, ''), COALESCE(body_ar, ''), updated_by, updated_at
  FROM legal_pages WHERE custom
ON CONFLICT (slug, version) DO NOTHING;
