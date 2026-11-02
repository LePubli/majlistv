-- Étape 45G : bilan de Ramadan — note personnelle chiffrée (« ce que je garde après Ramadan »), une par année hégirienne.
CREATE TABLE IF NOT EXISTS ramadan_notes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hyear      integer NOT NULL,
  text_enc   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hyear)
);
