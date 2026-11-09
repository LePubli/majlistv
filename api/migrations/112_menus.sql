-- Menus (projet « Menus », étape 1) : menus nommés, créés dans Admin → Menus, affectés à des emplacements (site, application).
-- Un menu = une liste d'éléments (arbre à un niveau de sous-menus) enregistrée d'un bloc en JSON : l'enregistrement est atomique.
-- Un emplacement sans menu affecté garde le menu d'origine (réglages « Pages → En-tête, menus et pied de page », étape I4).
CREATE TABLE menus (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  items      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_menus_name ON menus (lower(name));

CREATE TABLE menu_locations (
  location   text PRIMARY KEY CHECK (location IN ('web_top', 'web_side', 'web_bar', 'web_footer', 'app_drawer', 'app_tabs')),
  menu_id    uuid REFERENCES menus(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
