-- Étape 22b-6 bis : paire de clés Ed25519 qui signe les « licences » des téléchargements (une seule ligne, créée au premier besoin).
CREATE TABLE IF NOT EXISTS offline_keys (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key  text NOT NULL,                  -- 32 octets bruts, base64
  private_key text NOT NULL,                  -- PKCS8 (PEM), chiffré avec SETTINGS_KEY quand elle est définie
  encrypted   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
