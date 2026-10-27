-- Étape 37 — Sauvegardes : rapports envoyés par le VPS (sauvegarde nocturne, test de restauration hebdomadaire).
-- Le site ne touche à aucune sauvegarde : il garde seulement ce que le VPS lui dit, et alerte s'il n'entend plus rien.
CREATE TABLE IF NOT EXISTS backup_reports (
  id       bigserial PRIMARY KEY,
  kind     text NOT NULL CHECK (kind IN ('backup', 'restore_test')),
  ok       boolean NOT NULL,
  summary  text NOT NULL DEFAULT '',
  details  jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backup_reports_kind_at ON backup_reports (kind, at DESC);
