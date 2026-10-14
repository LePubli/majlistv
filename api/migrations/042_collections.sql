-- Étape 19 : collections éditoriales (équipe) et listes personnelles partageables (membres).

-- Collections : cycles, séries d'un intervenant, thèmes du moment. Gérées par l'administrateur et les modérateurs.
CREATE TABLE collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind        text NOT NULL DEFAULT 'theme' CHECK (kind IN ('cycle', 'speaker', 'theme')),
  published   boolean NOT NULL DEFAULT false,
  pinned      boolean NOT NULL DEFAULT false,         -- épinglée : en tête de la liste
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE collection_items (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  talk_id       uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  position      integer NOT NULL,
  PRIMARY KEY (collection_id, talk_id)
);
CREATE INDEX idx_collection_items_talk ON collection_items(talk_id);

-- Listes personnelles. share_token : lien de partage secret (supprimé = partage coupé) ; la liste partagée n'affiche jamais l'identité du membre.
CREATE TABLE user_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  share_token text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_lists_user ON user_lists(user_id, created_at);
CREATE TABLE user_list_items (
  list_id  uuid NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  talk_id  uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, talk_id)
);
CREATE INDEX idx_user_list_items_talk ON user_list_items(talk_id);
