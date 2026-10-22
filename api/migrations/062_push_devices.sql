-- Étape 22b-4 : notifications sur téléphone (Firebase Cloud Messaging).
-- Un jeton = un téléphone ; il appartient à un seul compte à la fois (si quelqu'un d'autre se connecte sur ce téléphone, le jeton change de compte).
CREATE TABLE IF NOT EXISTS device_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'android',
  locale      text NOT NULL DEFAULT 'fr',
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);
-- Interrupteur général « notifications sur le téléphone » du compte (les alertes d'intervenants, la sélection de la semaine
-- et la révision gardent leurs propres choix par catégorie).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true;
