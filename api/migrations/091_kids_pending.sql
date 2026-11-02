-- Étape B5 — Signal au parent : un enfant attend une validation (petites actions, circuit de Ramadan des enfants).
-- kids_pending_email : e-mail regroupé une fois par jour (désactivable) ; kids_pending_at : moment du dernier signal (une fois par jour au plus ; seules les demandes arrivées après sont nouvelles).
ALTER TABLE users ADD COLUMN IF NOT EXISTS kids_pending_email boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kids_pending_at timestamptz;
