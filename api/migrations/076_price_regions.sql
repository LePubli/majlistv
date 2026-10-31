-- Étape 44 : tarifs par pays. Un groupe = une liste de pays + ses propres prix Stripe (mêmes devise et durées que les prix généraux).
CREATE TABLE IF NOT EXISTS price_regions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  countries          text[] NOT NULL DEFAULT '{}',   -- codes ISO 3166-1 alpha-2 en majuscules
  price_monthly      text NOT NULL,                  -- identifiants de prix Stripe (price_…)
  price_yearly       text NOT NULL,
  price_learn_monthly text,                          -- facultatifs : sinon le prix général Apprentissage s'applique
  price_learn_yearly  text,
  enabled            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
