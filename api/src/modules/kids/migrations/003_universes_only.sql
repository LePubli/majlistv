-- Nouveau catalogue (20/11/2026), phase 4 : l'espace enfant lit directement les catégories Kids (catalogue_type = 'kids'), plus kid_rubrics.
-- Par sécurité, tout classement encore présent dans talk_kid_rubrics (fait entre la phase 1 et ce déploiement) est recopié dans talk_categories.
-- Les tables kid_rubrics et talk_kid_rubrics restent en place, sans effet (retour arrière possible) ; rien n'est supprimé.
INSERT INTO talk_categories (talk_id, category_id)
  SELECT k.talk_id, r.category_id
    FROM talk_kid_rubrics k
    JOIN kid_rubrics r ON r.id = k.rubric_id AND r.category_id IS NOT NULL
    JOIN talks t ON t.id = k.talk_id
   WHERE t.category_id IS DISTINCT FROM r.category_id
ON CONFLICT DO NOTHING;
