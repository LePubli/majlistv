-- Module « Stockage et archivage » — étape E4b (registre, point 3) : copie d'archive d'un fichier effacé de Garage par son module.
--   delete_queued : à effacer chez le fournisseur ; deleting : en cours ; deleted : effacée (gardée dans l'historique).
--   failed_op peut valoir 'delete' (effacement à relancer).
DROP INDEX IF EXISTS archive_items_live_key;
CREATE UNIQUE INDEX IF NOT EXISTS archive_items_live_key ON archive_items(source_key) WHERE status NOT IN ('restored', 'failed', 'deleted', 'delete_queued', 'deleting');
