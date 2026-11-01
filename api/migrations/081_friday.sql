-- Étape 45C : le vendredi (carte sur l'accueil, rappels, rangée de conférences, notification). Une seule ligne de réglages.
CREATE TABLE IF NOT EXISTS friday_page (
  id             smallint PRIMARY KEY CHECK (id = 1),
  enabled        boolean NOT NULL DEFAULT false,            -- désactivé tant que les textes n'ont pas été relus et validés
  show_kahf      boolean NOT NULL DEFAULT true,
  show_ghusl     boolean NOT NULL DEFAULT true,
  show_salawat   boolean NOT NULL DEFAULT true,
  ghusl_fr text NOT NULL DEFAULT '', ghusl_en text NOT NULL DEFAULT '', ghusl_ar text NOT NULL DEFAULT '',          -- vide = texte par défaut
  salawat_fr text NOT NULL DEFAULT '', salawat_en text NOT NULL DEFAULT '', salawat_ar text NOT NULL DEFAULT '',
  notif_fr text NOT NULL DEFAULT '', notif_en text NOT NULL DEFAULT '', notif_ar text NOT NULL DEFAULT '',
  collection_id  uuid REFERENCES collections(id) ON DELETE SET NULL,   -- rangée « Conférences du vendredi »
  notify         boolean NOT NULL DEFAULT false,
  notify_hour    smallint NOT NULL DEFAULT 8 CHECK (notify_hour BETWEEN 0 AND 23),   -- heure de Paris
  last_notified_on date,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO friday_page(id) VALUES (1) ON CONFLICT DO NOTHING;
