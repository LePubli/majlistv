-- Étape 26.1 : Mejliss Kids — profils enfants sous le compte du parent, code parental, contenus par tranche d'âge.

-- Conférence pour enfants : tranche d'âge visée (vide = pas pour les enfants). Un profil voit sa tranche et les plus jeunes.
ALTER TABLE talks ADD COLUMN kids_band text CHECK (kids_band IN ('3-6', '7-10', '11-14'));
CREATE INDEX idx_talks_kids ON talks(kids_band) WHERE kids_band IS NOT NULL;

-- Code parental (4 à 6 chiffres, haché) : sert à quitter l'espace enfant. 5 erreurs de suite = blocage de 10 minutes.
ALTER TABLE users ADD COLUMN kids_pin_hash text;
ALTER TABLE users ADD COLUMN kids_pin_fails integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN kids_pin_locked_until timestamptz;

CREATE TABLE kid_profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 30),   -- prénom ou surnom : aucune autre donnée sur l'enfant
  avatar     text NOT NULL DEFAULT 'lion',
  band       text NOT NULL CHECK (band IN ('3-6', '7-10', '11-14')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_kid_profiles_name ON kid_profiles(user_id, lower(name));

-- Reprise de lecture propre à chaque enfant (la progression du parent n'est pas touchée).
CREATE TABLE kid_progress (
  profile_id  uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  position_ms integer NOT NULL DEFAULT 0,
  completed   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, talk_id)
);
