-- Étape 7 : recherche Meilisearch. État de l'index par conférence (pas de clé étrangère :
-- une ligne orpheline signale une conférence supprimée à retirer de l'index).
CREATE TABLE search_state (
  talk_id    uuid PRIMARY KEY,
  signature  text NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
);
