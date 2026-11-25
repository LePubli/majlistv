-- Essai gratuit : une fois par PERSONNE et non par compte (relecture 25/11).
-- La clé est l'adresse e-mail simplifiée : en minuscules, sans « +étiquette », sans points pour Gmail (jean.dupont+a@gmail.com et
-- jeandupont@gmail.com sont la même boîte). Une ligne par clé : le premier compte qui a pris l'essai.
CREATE TABLE IF NOT EXISTS trial_claims (
  key        text PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rattrapage : les comptes qui ont déjà eu un abonnement ont déjà eu leur essai (le plus ancien garde la clé).
INSERT INTO trial_claims(key, user_id, created_at)
SELECT DISTINCT ON (k) k, user_id, first_at FROM (
  SELECT s.user_id, min(s.created_at) AS first_at,
    CASE WHEN split_part(lower(u.email), '@', 2) IN ('gmail.com', 'googlemail.com')
         THEN replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '') || '@gmail.com'
         ELSE split_part(split_part(lower(u.email), '@', 1), '+', 1) || '@' || split_part(lower(u.email), '@', 2) END AS k
  FROM subscriptions s JOIN users u ON u.id = s.user_id GROUP BY s.user_id, u.email) x
ORDER BY k, first_at
ON CONFLICT (key) DO NOTHING;
