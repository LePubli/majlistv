-- Étape 26.5 : classement des conférences — sous-catégories, plusieurs catégories par conférence, plusieurs tranches d'âge Kids,
-- et public (catalogue adultes ou non) séparé des catégories.

-- 1. Sous-catégories (deux niveaux : « Coran › Lecture »). Une catégorie parente ne peut pas être supprimée tant qu'elle a des sous-catégories.
ALTER TABLE categories ADD COLUMN parent_id integer REFERENCES categories(id) ON DELETE RESTRICT CHECK (parent_id IS NULL OR parent_id <> id);
-- Sécurité : deux catégories qui ne diffèrent que par la casse (« Kids » / « kids ») sont distinguées avant de créer l'index unique.
UPDATE categories c SET name = c.name || ' (' || c.id || ')' WHERE EXISTS (SELECT 1 FROM categories d WHERE lower(d.name) = lower(c.name) AND d.id < c.id);
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;                 -- le nom n'est plus unique globalement…
CREATE UNIQUE INDEX idx_categories_name_top ON categories (lower(name)) WHERE parent_id IS NULL;            -- … mais unique parmi les catégories principales
CREATE UNIQUE INDEX idx_categories_name_sub ON categories (parent_id, lower(name)) WHERE parent_id IS NOT NULL; -- … et au sein d'une même catégorie parente
CREATE INDEX idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- Nom complet (« Coran › Lecture ») pour l'affichage partout où l'on montre la catégorie d'une conférence.
CREATE VIEW category_names AS
  SELECT c.id, c.parent_id, c.name AS own_name, CASE WHEN p.id IS NULL THEN c.name ELSE p.name || ' › ' || c.name END AS name
    FROM categories c LEFT JOIN categories p ON p.id = c.parent_id;

-- 2. Catégories supplémentaires d'une conférence (talks.category_id reste la catégorie principale ; 2 de plus au maximum, contrôlé par l'API).
CREATE TABLE talk_categories (
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (talk_id, category_id)
);
CREATE INDEX idx_talk_categories_cat ON talk_categories(category_id);

-- 3. Tranches d'âge Kids : une conférence peut convenir à plusieurs tranches (3-6, 7-10, 11-14).
-- Reprise de l'existant sans rien changer pour les enfants : l'ancienne règle « un profil voit sa tranche et les plus jeunes » devient la liste explicite.
ALTER TABLE talks ADD COLUMN kids_bands text[] NOT NULL DEFAULT '{}' CHECK (kids_bands <@ ARRAY['3-6', '7-10', '11-14']::text[]);
UPDATE talks SET kids_bands = CASE kids_band WHEN '3-6' THEN ARRAY['3-6', '7-10', '11-14'] WHEN '7-10' THEN ARRAY['7-10', '11-14'] ELSE ARRAY['11-14'] END WHERE kids_band IS NOT NULL;
CREATE INDEX idx_talks_kids_bands ON talks USING gin (kids_bands);
COMMENT ON COLUMN talks.kids_band IS 'Obsolète (avant 26.5) : remplacé par kids_bands. Conservé pour pouvoir revenir en arrière.';

-- 4. Public : une conférence Kids peut être masquée du catalogue adultes (accueil, recherche, rangées). Elle reste accessible par son lien.
ALTER TABLE talks ADD COLUMN show_adults boolean NOT NULL DEFAULT true;

-- 5. Sous-catégories de départ pour « Coran » (si cette catégorie existe) : lecture et apprentissage.
INSERT INTO categories(name, parent_id)
  SELECT s.n, c.id FROM categories c CROSS JOIN (VALUES ('Lecture et récitation'), ('Apprentissage'), ('Explication (tafsir)')) AS s(n)
   WHERE lower(c.name) = 'coran' AND c.parent_id IS NULL
  ON CONFLICT DO NOTHING;
