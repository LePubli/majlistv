-- Planning, étape 3 : rappels choisis par le membre. Rien n'est envoyé tant que le membre n'a pas activé un canal (notification ou e-mail).
--   push / email : canaux ; morning : récapitulatif du jour à l'heure choisie ; deadline : la veille d'une échéance ; streak : le soir, si la série est à sauver.
CREATE TABLE IF NOT EXISTS learning_plan_prefs (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push             boolean NOT NULL DEFAULT false,
  email            boolean NOT NULL DEFAULT false,
  morning          boolean NOT NULL DEFAULT true,
  deadline         boolean NOT NULL DEFAULT true,
  streak           boolean NOT NULL DEFAULT false,
  morning_hour     smallint NOT NULL DEFAULT 8 CHECK (morning_hour BETWEEN 5 AND 12),
  last_morning_on  date,
  last_deadline_on date,
  last_streak_on   date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
