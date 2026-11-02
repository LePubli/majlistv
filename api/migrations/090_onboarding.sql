-- Étape B2 — écran « Par quoi commencer ? » : affiché une seule fois aux NOUVEAUX membres.
-- onboarded_at NULL = pas encore vu. Les comptes existants au déploiement sont marqués « vus » (ils ne le verront pas).
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
UPDATE users SET onboarded_at = now() WHERE onboarded_at IS NULL;
