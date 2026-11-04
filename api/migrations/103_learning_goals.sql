-- Série de jours et objectif de la semaine (palier Apprentissage) : réglage propre à chaque membre.
-- weekly_goal : nombre de jours actifs visés par semaine (1 à 7). show : afficher ou masquer la série et l'objectif.
-- Les jours actifs eux-mêmes ne sont PAS stockés : ils se déduisent des vidéos regardées (≥ 1 min), quiz, révisions et cartes mémoire.
CREATE TABLE IF NOT EXISTS learning_goals (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_goal smallint NOT NULL DEFAULT 3 CHECK (weekly_goal BETWEEN 1 AND 7),
  show        boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
