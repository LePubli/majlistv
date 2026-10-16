-- Étape Kids « Mes petites actions » : actions concrètes proposées par le parent à un enfant (après le quiz),
-- que l'enfant déclare faites ("claimed") et que le parent valide ("validated"). Rien n'est généré par l'IA.
CREATE TABLE IF NOT EXISTS kid_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'claimed', 'validated')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,
  validated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_kid_actions_profile ON kid_actions(profile_id, status);
