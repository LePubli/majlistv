-- Étape 45F : circuit de Ramadan sur 30 jours (adultes) et suivi des tarawih. Aucun contenu fourni : les actions sont saisies
-- et VALIDÉES dans l'admin. `audience` prépare la version enfants (sous-étape suivante).
CREATE TABLE IF NOT EXISTS ramadan_items (
  id          serial PRIMARY KEY,
  audience    text NOT NULL DEFAULT 'adult' CHECK (audience IN ('adult', 'kid')),
  day         smallint NOT NULL CHECK (day BETWEEN 0 AND 30),   -- 0 = chaque jour
  title_fr    text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', title_ar text NOT NULL DEFAULT '',
  text_fr     text NOT NULL DEFAULT '', text_en  text NOT NULL DEFAULT '', text_ar  text NOT NULL DEFAULT '',
  link        text NOT NULL DEFAULT '',                          -- page du site (/coran/2, /talks/…) ou vide
  reference   text NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ramadan_marks (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hyear    integer NOT NULL,                                     -- année hégirienne
  day      smallint NOT NULL CHECK (day BETWEEN 1 AND 30),
  item_id  integer NOT NULL REFERENCES ramadan_items(id) ON DELETE CASCADE,
  done_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hyear, day, item_id)
);
CREATE TABLE IF NOT EXISTS ramadan_tarawih (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hyear    integer NOT NULL,
  day      smallint NOT NULL CHECK (day BETWEEN 1 AND 30),       -- nuit qui précède le jour n
  rakaat   smallint CHECK (rakaat IS NULL OR rakaat BETWEEN 2 AND 40),
  place    text CHECK (place IS NULL OR place IN ('mosque', 'home')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hyear, day)
);
CREATE TABLE IF NOT EXISTS ramadan_prefs (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  remind_hour      smallint CHECK (remind_hour IS NULL OR remind_hour BETWEEN 0 AND 23),
  last_reminded_on date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
