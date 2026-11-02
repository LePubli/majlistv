-- Étape 45H : saisons enrichies (Aïd al-Fitr, Rajab, Dhou al-Qi‘da) et thème graphique de saison (au choix, par saison).
INSERT INTO season_pages(id) VALUES ('eid_fitr'), ('rajab'), ('dhulqada') ON CONFLICT DO NOTHING;
ALTER TABLE season_pages ADD COLUMN IF NOT EXISTS theme boolean NOT NULL DEFAULT false;
