-- Étape 23a : réglages « Prière » par compte (pause, méthode de calcul, ville, prières suivies).
-- Une seule ligne par compte ; supprimée avec le compte. Aucune position précise n'est conservée (arrondie à 0,1° côté client).
CREATE TABLE user_prayer_prefs (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
