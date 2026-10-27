-- Étape 31 — Double authentification (2FA) par application d'authentification (TOTP, RFC 6238) + codes de secours.
-- totp_secret : clé chiffrée (AES-256-GCM, SETTINGS_KEY) ; totp_pending : clé en cours d'activation (pas encore confirmée par un code).
-- totp_last_step : dernier pas de 30 s accepté (un même code ne sert qu'une fois). totp_failures / totp_locked_until : verrou après 5 erreurs.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret       text,
  ADD COLUMN IF NOT EXISTS totp_pending      text,
  ADD COLUMN IF NOT EXISTS totp_enabled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS totp_last_step    bigint,
  ADD COLUMN IF NOT EXISTS totp_failures     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totp_locked_until timestamptz;

-- Codes de secours (10 par compte, à usage unique) : seule l'empreinte SHA-256 est gardée.
CREATE TABLE IF NOT EXISTS two_factor_recovery (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at   timestamptz,
  PRIMARY KEY (user_id, code_hash)
);

-- Étape intermédiaire de la connexion : mot de passe juste, code à fournir. Valable 5 minutes, 5 essais.
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  failures   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_challenges_expires ON login_challenges(expires_at);
