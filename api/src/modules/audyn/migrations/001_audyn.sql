-- Audyn : livres audio (adultes) et histoires du soir (enfants). Un contenu = plusieurs chapitres (un fichier audio chacun).
CREATE TABLE IF NOT EXISTS audyn_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  narrator         text NOT NULL DEFAULT '',
  author           text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  audience         text NOT NULL DEFAULT 'adults' CHECK (audience IN ('kids', 'adults', 'both')),
  category         text NOT NULL DEFAULT '',
  language         text NOT NULL DEFAULT 'fr',
  access           text NOT NULL DEFAULT 'learning' CHECK (access IN ('learning', 'free')),  -- learning : formule « Apprentissage » (aperçu gratuit) ; free : ouvert à tous
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  cover_key        text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audyn_items_list_idx ON audyn_items(status, audience, created_at DESC);

CREATE TABLE IF NOT EXISTS audyn_chapters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid NOT NULL REFERENCES audyn_items(id) ON DELETE CASCADE,
  position         integer NOT NULL,
  title            text NOT NULL,
  audio_key        text NOT NULL,
  content_type     text NOT NULL,
  size             bigint NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Envois en cours (multipart direct navigateur → stockage), comme les vidéos.
CREATE TABLE IF NOT EXISTS audyn_uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid NOT NULL REFERENCES audyn_items(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  object_key       text NOT NULL,
  s3_upload_id     text NOT NULL,
  filename         text NOT NULL,
  title            text NOT NULL,
  content_type     text NOT NULL,
  size             bigint NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Journal des attestations de droits : une ligne à chaque fichier envoyé (qui, quoi, quand).
CREATE TABLE IF NOT EXISTS audyn_rights_log (
  id               bigserial PRIMARY KEY,
  item_id          uuid,
  item_title       text NOT NULL,
  chapter_id       uuid,
  filename         text NOT NULL,
  size             bigint NOT NULL,
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  user_label       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
