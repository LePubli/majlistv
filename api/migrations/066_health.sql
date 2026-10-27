-- Étape 29 — Santé du serveur : mesures régulières (disque, mémoire, charge) et état des alertes e-mail.
-- Une mesure toutes les 10 minutes, gardée 35 jours (nettoyage par la boucle de fond).
CREATE TABLE IF NOT EXISTS health_samples (
  at          timestamptz PRIMARY KEY DEFAULT now(),
  disk_total  bigint NOT NULL,
  disk_free   bigint NOT NULL,
  mem_total   bigint NOT NULL,
  mem_avail   bigint NOT NULL,
  load1       real   NOT NULL
);

-- Dernier niveau connu de chaque surveillance (disk, mem) : sert à n'envoyer un e-mail qu'au changement de niveau (ou en rappel espacé).
CREATE TABLE IF NOT EXISTS health_alerts (
  kind          text PRIMARY KEY,
  level         text NOT NULL DEFAULT 'ok' CHECK (level IN ('ok', 'warn', 'crit')),
  since         timestamptz NOT NULL DEFAULT now(),
  last_sent_at  timestamptz
);
