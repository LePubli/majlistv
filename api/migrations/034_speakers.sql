-- Étape 16.2b : présentation des intervenants. L'intervenant reste un nom saisi sur les conférences ; sa page est identifiée par son slug
-- (« Cheikh Hamza » et « cheikh hamza » donnent la même page). Seule la présentation est stockée ici.
CREATE TABLE speakers (
  slug       text PRIMARY KEY,
  bio        text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
