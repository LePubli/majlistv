-- Étape 4 : abonnements Stripe (accès aux conférences premium).
ALTER TABLE users ADD COLUMN stripe_customer_id text UNIQUE;

CREATE TABLE subscriptions (
  id                   text PRIMARY KEY,                 -- identifiant d'abonnement Stripe (sub_…)
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status               text NOT NULL,                    -- trialing | active | past_due | canceled | unpaid | incomplete …
  price_id             text,
  billing_interval     text,                             -- month | year
  current_period_end   timestamptz,
  trial_end            timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  event_created        bigint NOT NULL DEFAULT 0,        -- date du dernier événement Stripe appliqué (évite d'écraser avec un vieil événement)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

-- Événements Stripe déjà traités (Stripe peut renvoyer un même événement plusieurs fois).
CREATE TABLE stripe_events (
  id          text PRIMARY KEY,
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
