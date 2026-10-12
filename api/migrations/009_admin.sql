-- Back-office admin : paramètres modifiables depuis le site, comptes suspendus, accès premium offert.
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  is_secret  boolean NOT NULL DEFAULT false,   -- true : valeur chiffrée (AES-256-GCM, clé SETTINGS_KEY)
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE users ADD COLUMN disabled_at timestamptz;     -- compte suspendu : connexion et sessions refusées
ALTER TABLE users ADD COLUMN premium_until timestamptz;   -- accès premium offert par un admin jusqu'à cette date
