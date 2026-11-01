-- Étape 45E : lecture du Coran en 30 jours (1 juz par jour), pour tout membre connecté (gratuit).
CREATE TABLE IF NOT EXISTS quran_plans (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  started_on       date NOT NULL,                         -- jour 1 (heure de Paris)
  remind_hour      smallint CHECK (remind_hour IS NULL OR remind_hour BETWEEN 0 AND 23),
  last_reminded_on date,
  completed_count  integer NOT NULL DEFAULT 0,            -- lectures complètes (30 juz) terminées
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quran_plan_reads (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  juz      smallint NOT NULL CHECK (juz BETWEEN 1 AND 30),
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, juz)
);
