-- Catalogue : noms de catégories traduits dans les cartes de vidéos (23/11/2026).
-- La vue category_names (nom complet « Parent › Sous-catégorie », en français) gagne une colonne `tr` = {"en": "…", "ar": "…"} :
-- le nom complet dans chaque langue, présent SEULEMENT si la catégorie a une traduction (sinon la clé manque et le site garde le français).
-- Pour une sous-catégorie : parent traduit (ou français si le parent n'a pas de traduction) › sous-catégorie traduite.
-- Une colonne ajoutée en fin de vue : les requêtes existantes ne changent pas. Rejouable.
CREATE OR REPLACE VIEW category_names AS
  SELECT c.id, c.parent_id, c.name AS own_name,
         CASE WHEN p.id IS NULL THEN c.name ELSE p.name || ' › ' || c.name END AS name,
         jsonb_strip_nulls(jsonb_build_object(
           'en', CASE WHEN COALESCE(c.translations->'en'->>'name', '') = '' THEN NULL
                      WHEN p.id IS NULL THEN c.translations->'en'->>'name'
                      ELSE COALESCE(NULLIF(p.translations->'en'->>'name', ''), p.name) || ' › ' || (c.translations->'en'->>'name') END,
           'ar', CASE WHEN COALESCE(c.translations->'ar'->>'name', '') = '' THEN NULL
                      WHEN p.id IS NULL THEN c.translations->'ar'->>'name'
                      ELSE COALESCE(NULLIF(p.translations->'ar'->>'name', ''), p.name) || ' › ' || (c.translations->'ar'->>'name') END
         )) AS tr
    FROM categories c LEFT JOIN categories p ON p.id = c.parent_id;
