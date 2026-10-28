-- Étape 40 : notifications dans le navigateur (Web Push, clés VAPID).
-- Un abonnement = un navigateur (ou un site installé) d'un compte. L'adresse (endpoint) est fournie par le navigateur.
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  locale      text NOT NULL DEFAULT 'fr',
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx ON web_push_subscriptions(user_id);
-- Paire de clés VAPID du site (une seule ligne). La clé privée est chiffrée avec SETTINGS_KEY.
CREATE TABLE IF NOT EXISTS web_push_keys (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  public_key  text NOT NULL,
  private_enc text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
