-- Audyn — catégories gérées dans le Studio (créer, renommer, supprimer), choisies dans une liste sur chaque contenu.
-- Le contenu garde le NOM de sa catégorie (audyn_items.category, texte) : la page publique et ses filtres ne changent pas.
-- Renommer une catégorie renomme celle de ses contenus ; la supprimer laisse ses contenus sans catégorie.
CREATE TABLE IF NOT EXISTS audyn_categories (
  id         serial PRIMARY KEY,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audyn_categories_name_idx ON audyn_categories (lower(name));
-- Les catégories déjà tapées sur des contenus deviennent des catégories de la liste.
INSERT INTO audyn_categories(name)
  SELECT DISTINCT ON (lower(category)) category FROM audyn_items WHERE category <> '' ORDER BY lower(category), category
  ON CONFLICT DO NOTHING;
