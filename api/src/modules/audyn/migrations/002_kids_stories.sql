-- Histoires du soir (espace Kids) : réglages par enfant et temps d'écoute compté à part (hors limite quotidienne, pour le rapport du parent).
ALTER TABLE kid_profiles ADD COLUMN IF NOT EXISTS stories_timer_allowed boolean NOT NULL DEFAULT false;  -- l'enfant peut régler lui-même le minuteur de sommeil
ALTER TABLE kid_profiles ADD COLUMN IF NOT EXISTS stories_auto_stop_min integer CHECK (stories_auto_stop_min BETWEEN 5 AND 120);  -- arrêt automatique réglé par le parent (NULL = aucun)

CREATE TABLE IF NOT EXISTS kid_story_usage (
  profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  seconds    integer NOT NULL DEFAULT 0,
  last_ping  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, day)
);
