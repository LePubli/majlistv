-- Étape 39 — Suivi des erreurs : une ligne par type d'erreur (regroupement par empreinte) + les dernières occurrences.
-- Aucune donnée personnelle : pas d'identifiant de membre, pas d'adresse IP ; e-mails, jetons et paramètres d'adresse sont masqués avant l'enregistrement.
CREATE TABLE IF NOT EXISTS error_groups (
  fingerprint   text PRIMARY KEY,
  source        text NOT NULL CHECK (source IN ('api', 'web')),
  message       text NOT NULL,
  route         text NOT NULL DEFAULT '',
  method        text NOT NULL DEFAULT '',
  http_status   integer,
  state         text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved', 'ignored')),
  count         bigint NOT NULL DEFAULT 1,
  first_at      timestamptz NOT NULL DEFAULT now(),
  last_at       timestamptz NOT NULL DEFAULT now(),
  last_stack    text NOT NULL DEFAULT '',
  resolved_at   timestamptz,
  last_alert_at timestamptz
);
CREATE INDEX IF NOT EXISTS error_groups_state_last ON error_groups (state, last_at DESC);

CREATE TABLE IF NOT EXISTS error_events (
  id          bigserial PRIMARY KEY,
  fingerprint text NOT NULL REFERENCES error_groups(fingerprint) ON DELETE CASCADE,
  at          timestamptz NOT NULL DEFAULT now(),
  path        text NOT NULL DEFAULT '',
  user_agent  text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS error_events_fp_at ON error_events (fingerprint, at DESC);
