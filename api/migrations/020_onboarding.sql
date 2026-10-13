-- Étape 12.4 : préférences du visiteur recueillies sur la page de bienvenue.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_sub_lang text;                          -- langue des sous-titres préférée (null = langue de l'interface)
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_categories int[] NOT NULL DEFAULT '{}';  -- thèmes préférés (identifiants de catégories)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;                         -- date de la page de bienvenue (null = jamais vue)
