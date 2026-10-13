-- Étape 25 : ouvrages (fiche, éditions par langue : PDF ou liens boutique), rattachement aux conférences et séries.

CREATE TABLE books (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  author      text NOT NULL DEFAULT '' CHECK (length(author) <= 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  cover_key   text,
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_published ON books(published, updated_at DESC);

-- Un fichier PDF par langue. Il n'est diffusé que si les droits sont confirmés (même principe que pour les vidéos).
CREATE TABLE book_files (
  book_id          uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  lang             text NOT NULL CHECK (lang ~ '^[a-z]{2,3}$'),
  file_key         text NOT NULL,
  file_name        text NOT NULL DEFAULT '',
  size_bytes       bigint NOT NULL DEFAULT 0,
  pages            integer NOT NULL DEFAULT 0,
  rights_confirmed boolean NOT NULL DEFAULT false,
  rights_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  rights_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, lang)
);

-- Liens boutique (affiliation, revendeur, pays…) : plusieurs par langue.
CREATE TABLE book_links (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id  uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  lang     text NOT NULL CHECK (lang ~ '^[a-z]{2,3}$'),
  label    text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  url      text NOT NULL CHECK (url ~* '^https?://' AND length(url) <= 1000),
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_book_links_book ON book_links(book_id, lang, position);

CREATE TABLE book_talks (
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, talk_id)
);
CREATE INDEX idx_book_talks_talk ON book_talks(talk_id);

CREATE TABLE book_series (
  book_id   uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, series_id)
);
CREATE INDEX idx_book_series_series ON book_series(series_id);

-- Journal des téléchargements : qui, quel ouvrage, quand (traçabilité du filigrane, limite quotidienne).
CREATE TABLE book_downloads (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  book_id    uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  lang       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_book_downloads_user ON book_downloads(user_id, created_at DESC);
