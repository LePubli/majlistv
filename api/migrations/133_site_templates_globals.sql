-- Éditeur visuel, lot B : modèles enregistrés (sections ou pages entières) et sections globales (page de type « global », adresse /_global/<nom>).
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_kind_check;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_kind_check CHECK (kind IN ('custom', 'slot', 'home', 'catalogue', 'watch', 'global', 'layout'));

CREATE TABLE IF NOT EXISTS site_templates (
  id          serial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('section', 'page')),
  page_kind   text,                       -- pour un modèle de page : le type de page d'origine (custom, slot, home…)
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  content     jsonb NOT NULL,             -- section : { zones: { main: [blocs] } } ; page : { meta, zones }
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
