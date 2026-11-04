-- Adhkar : thème de parcours (classement inspiré de Hisn al-Muslim) et note de relecture.
-- Le thème est déduit du moment puis de la tranche de position du lot de contenus ; l'administrateur peut le changer (fiche ou action en lot).
-- La note de relecture accompagne un dhikr à relire (points d'attention) ; elle n'est jamais montrée aux membres.
ALTER TABLE athkar_items ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT '';
ALTER TABLE athkar_items ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '';

UPDATE athkar_items SET theme = CASE
  WHEN category IN ('morning', 'evening') THEN 'matin_soir'
  WHEN category = 'after_prayer' THEN 'apres_priere'
  WHEN category = 'sleep' THEN 'sommeil'
  WHEN position >= 127 AND position < 200 THEN 'sommeil'
  WHEN position >= 200 AND position < 300 THEN 'maison'
  WHEN position >= 300 AND position < 400 THEN 'voyage'
  WHEN position >= 400 AND position < 500 THEN 'epreuves'
  WHEN position >= 500 AND position < 600 THEN 'dans_priere'
  WHEN position >= 600 AND position < 700 THEN 'deuil'
  WHEN position >= 700 AND position < 800 THEN 'nature'
  WHEN position >= 800 AND position < 900 THEN 'relations'
  WHEN position >= 1000 THEN 'sommeil'
  ELSE 'pardon'
END WHERE theme = '';

CREATE INDEX IF NOT EXISTS athkar_items_theme ON athkar_items(theme);

-- Note de relecture : formule reconstituée par l'assistant (la source décrit seulement l'action).
UPDATE athkar_items SET review_note = 'La source ne donne pas de formule : elle décrit seulement l’action à la 3e personne (« il cherche refuge auprès d’Allah contre Satan et contre le mal de ce qu’il a vu »). L’arabe est une mise à la 1re personne faite par l’assistant. À valider ou à retirer.'
 WHERE category = 'general' AND position = 1002 AND review_note = '' AND reviewed_at IS NULL;
