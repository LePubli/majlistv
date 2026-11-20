-- Nouveau catalogue (20/11/2026), phase 1 : les rubriques Kids deviennent les 10 univers Kids du modèle de catégories unique.
-- Chaque rubrique est liée à une catégorie Kids (category_id) ; l'espace enfant continue de lire les rubriques en attendant la phase 4.
-- Décision d'Epok : les anciennes rubriques sont remplacées. L'ancien classement est copié dans legacy_catalogue_backup (migration principale 121).
ALTER TABLE kid_rubrics ADD COLUMN IF NOT EXISTS category_id integer REFERENCES categories(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kid_rubrics_category ON kid_rubrics(category_id) WHERE category_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kid_rubrics WHERE category_id IS NOT NULL) THEN
    INSERT INTO legacy_catalogue_backup(kind, talk_id, value)
      SELECT 'talk_kid_rubric', k.talk_id, r.slug FROM talk_kid_rubrics k JOIN kid_rubrics r ON r.id = k.rubric_id;
    DELETE FROM kid_rubrics;                      -- les liens vidéo ↔ rubrique partent avec (ON DELETE CASCADE) ; les vidéos restent
    INSERT INTO kid_rubrics(slug, names, emoji, position, active, category_id)
      SELECT c.slug, jsonb_build_object('fr', c.name), COALESCE(c.icon, '⭐'), c.display_order, c.is_active, c.id
        FROM categories c WHERE c.parent_id IS NULL AND c.catalogue_type = 'kids' AND c.slug IS NOT NULL
      ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;
