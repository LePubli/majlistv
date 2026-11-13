-- Application TV : connexion par code (comme Netflix / YouTube sur une télé).
-- La télé demande un code (POST /auth/tv/start) et l'affiche avec un QR code ; la personne, déjà connectée sur son téléphone ou
-- le site, valide ce code (page /tv) ; la télé, qui interroge régulièrement (POST /auth/tv/poll avec son secret), reçoit alors
-- son jeton de connexion. Code valable 10 minutes, utilisable une fois ; seule l'empreinte du secret est gardée.
CREATE TABLE IF NOT EXISTS tv_logins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{8}$'),
  secret_hash  text NOT NULL,
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  device       text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'used', 'denied')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  approved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS tv_logins_expires_idx ON tv_logins(expires_at);
