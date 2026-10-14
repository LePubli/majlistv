-- Étape 30 : bilan personnel « Tazkiyat an-nafs » (palier Apprentissage).
-- Objectifs choisis par la personne (qualités à cultiver, défauts à corriger) et bilan de chaque semaine.
-- Données très sensibles : intitulé, thème et note sont CHIFFRÉS (AES-256-GCM, clé dédiée PRACTICE_KEY). Aucun total, score ni pourcentage.

CREATE TABLE self_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nature        text NOT NULL CHECK (nature IN ('quality', 'defect')),
  title_enc     text NOT NULL,                                   -- intitulé (chiffré)
  theme_enc     text NOT NULL DEFAULT '',                        -- code du thème de la base (chiffré : il révélerait le défaut choisi)
  commitment_id uuid REFERENCES practice_commitments(id) ON DELETE SET NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_self_goals_user ON self_goals(user_id, archived_at);

CREATE TABLE self_checkins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id    uuid NOT NULL REFERENCES self_goals(id) ON DELETE CASCADE,
  week       date NOT NULL,                                      -- lundi de la semaine (jour de Paris)
  status     text NOT NULL CHECK (status IN ('achieved', 'progress', 'not_yet')),
  note_enc   text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, week)
);

-- Rappel hebdomadaire : choix de chacun (activé, jour de la semaine 1 = lundi … 7 = dimanche, vendredi par défaut) et semaine déjà traitée.
ALTER TABLE users ADD COLUMN practice_email boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN practice_weekday smallint NOT NULL DEFAULT 5 CHECK (practice_weekday BETWEEN 1 AND 7);
ALTER TABLE users ADD COLUMN practice_last_week date;
