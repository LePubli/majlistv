-- Amélioration 4.2 — Événements en direct : annonce, direct YouTube / Vimeo intégré, rappel, rediffusion rattachée à une conférence.
CREATE TABLE IF NOT EXISTS events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  speaker          text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  language         text NOT NULL DEFAULT 'fr',
  source           text NOT NULL CHECK (source IN ('youtube', 'vimeo')),
  video_ref        text NOT NULL,
  starts_at        timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 600),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  talk_id          uuid REFERENCES talks(id) ON DELETE SET NULL,   -- rediffusion : la conférence enregistrée
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(created_by);

-- « Me rappeler » : les membres inscrits à un événement (les rappels eux-mêmes viennent à l'étape 3).
CREATE TABLE IF NOT EXISTS event_reminders (
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user ON event_reminders(user_id);
