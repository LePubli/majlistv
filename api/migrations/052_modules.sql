-- Étape M1 : socle des modules. Un module est un dossier d'API (api/src/modules/<id>/) ; ces tables gardent sa version
-- installée et les migrations SQL propres au module déjà appliquées. L'état « activé » et les réglages restent dans app_settings.
CREATE TABLE IF NOT EXISTS modules (
  id text PRIMARY KEY,
  installed_version text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
CREATE TABLE IF NOT EXISTS module_migrations (
  module text NOT NULL,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, name)
);
