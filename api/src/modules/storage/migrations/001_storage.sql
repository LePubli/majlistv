-- Module « Stockage et archivage » (étape S2) : fichiers archivés chez le fournisseur et état du module.
CREATE TABLE IF NOT EXISTS archive_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key    text NOT NULL,                       -- clé de l'objet dans Garage (remis au même endroit à la restauration)
  kind          text NOT NULL DEFAULT 'other',       -- test | dub_preview | dub_voice | original | render | other
  label         text NOT NULL DEFAULT '',
  talk_id       uuid REFERENCES talks(id) ON DELETE SET NULL,
  bytes         bigint,
  provider      text NOT NULL DEFAULT '',            -- fournisseur au moment de l'archivage
  remote_path   text NOT NULL DEFAULT '',            -- chemin chez le fournisseur (sous le dossier des archives)
  encrypted     boolean NOT NULL DEFAULT false,
  delete_source boolean NOT NULL DEFAULT true,       -- effacer de Garage une fois l'archive vérifiée
  status        text NOT NULL DEFAULT 'queued',      -- queued | archiving | archived | restore_queued | restoring | restored | failed
  failed_op     text,                                -- archive | restore
  error         text,
  attempts      int NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  restored_at   timestamptz
);
CREATE INDEX IF NOT EXISTS archive_items_status ON archive_items(status, updated_at);
CREATE INDEX IF NOT EXISTS archive_items_key ON archive_items(source_key);
-- Une seule archive « vivante » (pas restaurée ni en échec) par fichier de Garage.
CREATE UNIQUE INDEX IF NOT EXISTS archive_items_live_key ON archive_items(source_key) WHERE status NOT IN ('restored', 'failed');

CREATE TABLE IF NOT EXISTS storage_state (
  k          text PRIMARY KEY,
  v          jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
