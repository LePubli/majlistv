-- Amélioration 4.2, étape 3 : une trace par rappel envoyé (jamais deux fois le même).
ALTER TABLE event_reminders ADD COLUMN IF NOT EXISTS day_sent_at    timestamptz;  -- rappel « dans la journée » (24 h avant au plus)
ALTER TABLE event_reminders ADD COLUMN IF NOT EXISTS soon_sent_at   timestamptz;  -- « ça commence » (30 min avant au plus)
ALTER TABLE event_reminders ADD COLUMN IF NOT EXISTS cancel_sent_at timestamptz;  -- avis d'annulation
CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, starts_at);
