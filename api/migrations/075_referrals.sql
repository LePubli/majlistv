-- Étape 43 : parrainage. Un code personnel par membre ; le filleul est rattaché à son parrain à l'inscription ;
-- la récompense (mois offerts aux deux) n'est versée qu'au premier vrai paiement du filleul.
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id        uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, -- un filleul n'a qu'un parrain
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded')),
  months            int,                       -- mois offerts à chaque personne (figé au versement)
  referrer_rewarded boolean NOT NULL DEFAULT false, -- faux si le plafond annuel du parrain était atteint
  created_at        timestamptz NOT NULL DEFAULT now(),
  rewarded_at       timestamptz,
  CHECK (referrer_id <> referee_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id, created_at DESC);
