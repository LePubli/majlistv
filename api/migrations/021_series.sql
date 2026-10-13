-- Étape 14.1 : séries, saisons, épisodes.
-- Une série regroupe des conférences existantes (les « épisodes »), avec ou sans saisons.
-- L'accès (gratuit / premium) se règle sur la série ET sur chaque épisode : l'épisode l'emporte.
-- talks.access reste la valeur effective lue partout (lecture, aperçu, recherche) : elle est recalculée
-- quand l'accès de la série ou d'un épisode change.
CREATE TABLE series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  speaker     text NOT NULL DEFAULT '',
  category_id integer REFERENCES categories(id) ON DELETE SET NULL,
  has_seasons boolean NOT NULL DEFAULT false,
  access      text NOT NULL DEFAULT 'free' CHECK (access IN ('free', 'premium')),
  published   boolean NOT NULL DEFAULT false,
  poster_key  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_series_owner ON series(owner_id);

CREATE TABLE seasons (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  position  integer NOT NULL,           -- l'ordre donne le numéro affiché (Saison 1, 2, …)
  title     text NOT NULL DEFAULT ''
);
CREATE INDEX idx_seasons_series ON seasons(series_id, position);

CREATE TABLE series_episodes (
  talk_id         uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,  -- une conférence appartient à une seule série
  series_id       uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  season_id       uuid REFERENCES seasons(id) ON DELETE RESTRICT,           -- vide si la série n'a pas de saisons
  position        integer NOT NULL,                                          -- ordre dans toute la série
  access_override text CHECK (access_override IN ('free', 'premium'))        -- vide = hérite de la série
);
CREATE INDEX idx_episodes_series ON series_episodes(series_id, position);
