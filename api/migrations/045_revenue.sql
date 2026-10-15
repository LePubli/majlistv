-- Étape D : rémunération des chaînes (« comme YouTube » : une part des abonnements est répartie selon le temps de visionnage).
-- Tout est piloté par les réglages (groupe « Rémunération ») et la fonction « revenue » (désactivée par défaut).

-- Factures d'abonnement encaissées (Stripe invoice.paid). Montant HORS TAXES en centimes ; les remboursements s'y soustraient.
CREATE TABLE revenue_invoices (
  id              text PRIMARY KEY,                 -- identifiant de la facture Stripe (in_…)
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_cents    integer NOT NULL CHECK (amount_cents >= 0),
  refunded_cents  integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  currency        text NOT NULL,
  charge_id       text,
  paid_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_revenue_invoices_paid ON revenue_invoices(paid_at);
CREATE INDEX idx_revenue_invoices_charge ON revenue_invoices(charge_id) WHERE charge_id IS NOT NULL;

-- Temps de visionnage crédité, par jour, membre, conférence (calculé côté serveur à partir de la reprise de lecture :
-- indépendant des statistiques anonymes, qui respectent le « Do Not Track »).
CREATE TABLE watch_credit (
  day          date NOT NULL,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talk_id      uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  channel_slug text NOT NULL,
  paid         boolean NOT NULL,                    -- le membre avait un abonnement en cours ce jour-là
  seconds      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id, talk_id)
);
CREATE INDEX idx_watch_credit_channel ON watch_credit(day, channel_slug);

-- Périodes mensuelles : brouillon tant qu'elles ne sont pas clôturées (le calcul est alors recalculé à la volée).
CREATE TABLE payout_periods (
  month         date PRIMARY KEY,                   -- premier jour du mois (UTC)
  status        text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed')),
  currency      text NOT NULL,
  net_cents     integer NOT NULL,                   -- encaissé hors taxes, net des remboursements
  costs_pct     numeric(5,2) NOT NULL,
  share_pct     numeric(5,2) NOT NULL,
  pool_cents    integer NOT NULL,
  total_seconds bigint NOT NULL,
  closed_at     timestamptz NOT NULL DEFAULT now(),
  closed_by     uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Une ligne par chaîne et par période clôturée.
--   due      : à payer (seuil atteint)      paid : payé      carried : sous le seuil ou sans propriétaire, reporté
--   rolled   : reporté puis repris dans une période suivante
CREATE TABLE payout_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month         date NOT NULL REFERENCES payout_periods(month) ON DELETE CASCADE,
  channel_slug  text NOT NULL,
  channel_name  text NOT NULL,
  owner_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  seconds       bigint NOT NULL,
  amount_cents  integer NOT NULL,                   -- gagné ce mois-ci
  carried_in_cents integer NOT NULL DEFAULT 0,      -- repris des mois précédents
  status        text NOT NULL CHECK (status IN ('due', 'paid', 'carried', 'rolled')),
  paid_at       timestamptz,
  note          text NOT NULL DEFAULT '',
  UNIQUE (month, channel_slug)
);
CREATE INDEX idx_payout_lines_owner ON payout_lines(owner_id);
