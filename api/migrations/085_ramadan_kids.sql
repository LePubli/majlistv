-- Étape 45F2 : circuit de Ramadan des enfants (actions « kid » de ramadan_items). L'enfant dit « je l'ai fait », le parent valide.
CREATE TABLE IF NOT EXISTS ramadan_kid_marks (
  profile_id   uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  hyear        integer NOT NULL,
  day          smallint NOT NULL CHECK (day BETWEEN 1 AND 30),
  item_id      integer NOT NULL REFERENCES ramadan_items(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'validated')),
  claimed_at   timestamptz,
  validated_at timestamptz,
  PRIMARY KEY (profile_id, hyear, day, item_id)
);
