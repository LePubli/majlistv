-- 27/11 : analyse demandée par un import (« catégories automatiques ») : appliquée sans validation dès que la confiance atteint 70 %,
-- même si l'application automatique générale est désactivée. Les propositions moins sûres restent à valider (Studio → Catégories proposées).
ALTER TABLE category_jobs ADD COLUMN IF NOT EXISTS apply_now boolean NOT NULL DEFAULT false;
