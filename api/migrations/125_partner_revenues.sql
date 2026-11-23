-- Revenus & abonnements : revenus de partenariats / sponsoring, SAISIS À LA MAIN par l'administrateur
-- (le site n'encaisse rien pour eux : ni Stripe ni facture). « received » compte dans les encaissements à la date d'encaissement ;
-- « pending » est seulement affiché comme « à encaisser ». Lien facultatif avec une publicité (campagne).
CREATE TABLE IF NOT EXISTS partner_revenues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner     text NOT NULL CHECK (length(partner) BETWEEN 1 AND 120),
  label       text NOT NULL DEFAULT '' CHECK (length(label) <= 200),
  amount      integer NOT NULL CHECK (amount > 0 AND amount <= 100000000),   -- centimes, hors taxes
  currency    text NOT NULL,
  status      text NOT NULL DEFAULT 'received' CHECK (status IN ('pending', 'received')),
  received_on date NOT NULL DEFAULT current_date,                            -- date d'encaissement (ou prévue si « pending »)
  ad_id       uuid REFERENCES ads(id) ON DELETE SET NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_revenues_day ON partner_revenues(received_on);
