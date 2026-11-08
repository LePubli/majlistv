-- Amélioration 7.2 (étape 4) : test de prix. Objectif « abonnement » + mesure des abonnements démarrés, payés et du revenu encaissé par visiteur.
ALTER TABLE experiments DROP CONSTRAINT IF EXISTS experiments_goal_check;
ALTER TABLE experiments ADD CONSTRAINT experiments_goal_check CHECK (goal IN ('signup', 'subscription'));
ALTER TABLE experiment_exposures
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,          -- abonnement démarré (essai gratuit compris)
  ADD COLUMN IF NOT EXISTS paid_at       timestamptz,          -- première facture réellement payée
  ADD COLUMN IF NOT EXISTS revenue_cents int NOT NULL DEFAULT 0; -- somme des factures payées (centimes, devise du site)
