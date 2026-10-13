-- Étape 26.2 : quiz, étoiles et badges pour les enfants (Mejliss Kids).
-- Pas de « réussite / échec » côté enfant : chaque essai donne 1 à 3 étoiles. Aucun classement, aucune comparaison entre enfants.

CREATE TABLE kid_quiz_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  score      int NOT NULL,
  total      int NOT NULL,
  percent    int NOT NULL,
  stars      int NOT NULL CHECK (stars BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kid_attempts ON kid_quiz_attempts(profile_id, talk_id, created_at);

-- Badges gagnés (palier Apprentissage uniquement).
CREATE TABLE kid_badges (
  profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  code       text NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, code)
);

-- Révision espacée de l'enfant (palier Apprentissage) : « à rejouer aujourd'hui », J+1 / J+3 / J+7.
CREATE TABLE kid_revision (
  profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  stage      int NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 3),
  due_on     date,                       -- NULL : retenu (les trois révisions sont faites)
  PRIMARY KEY (profile_id, talk_id)
);
CREATE INDEX idx_kid_revision_due ON kid_revision(due_on) WHERE due_on IS NOT NULL;
