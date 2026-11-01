-- Étape 45D : compteur d'athkar (formule Apprentissage). Aucun dhikr n'est fourni : l'administration les saisit avec leur référence,
-- et seuls les dhikr VALIDÉS (relus) et activés sont montrés aux membres.
CREATE TABLE IF NOT EXISTS athkar_items (
  id          serial PRIMARY KEY,
  category    text NOT NULL DEFAULT 'general' CHECK (category IN ('morning', 'evening', 'after_prayer', 'sleep', 'general')),
  text_ar     text NOT NULL,
  translit    text NOT NULL DEFAULT '',
  tr_fr       text NOT NULL DEFAULT '',
  tr_en       text NOT NULL DEFAULT '',
  reference   text NOT NULL,                       -- source (recueil, numéro, degré d'authenticité tel que donné par la source)
  target      integer NOT NULL DEFAULT 1 CHECK (target BETWEEN 1 AND 1000),
  enabled     boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,                         -- validé (relu par une personne qualifiée) : obligatoire pour être montré
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Compte du jour (heure de Paris) par membre et par dhikr.
CREATE TABLE IF NOT EXISTS athkar_counts (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id  integer NOT NULL REFERENCES athkar_items(id) ON DELETE CASCADE,
  day      date NOT NULL,
  count    integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, item_id, day)
);
CREATE INDEX IF NOT EXISTS athkar_counts_user_day ON athkar_counts(user_id, day);
-- Réglages du membre : objectif (nombre de dhikr terminés par jour), heure du rappel (Paris, vide = pas de rappel).
CREATE TABLE IF NOT EXISTS athkar_prefs (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_goal       smallint NOT NULL DEFAULT 1 CHECK (daily_goal BETWEEN 1 AND 100),
  remind_hour      smallint CHECK (remind_hour IS NULL OR remind_hour BETWEEN 0 AND 23),
  last_reminded_on date,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
