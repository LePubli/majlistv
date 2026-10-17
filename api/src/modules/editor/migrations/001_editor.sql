-- Module « Éditeur de montage » — étape E1 : projets de montage, versions et verrou d'édition.
-- Un projet = un montage d'une conférence envoyée (vidéo convertie). Le montage est un document JSON (« timeline ») :
-- le site l'écrit, l'API le vérifie, le moteur de rendu (étape E4, FFmpeg piloté par notre code) le lira.
CREATE TABLE editor_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'main' CHECK (kind IN ('main', 'short')), -- 'short' : extraits 9:16 (étape E5)
  title       text NOT NULL DEFAULT '',
  timeline    jsonb NOT NULL,
  rev         int NOT NULL DEFAULT 1,              -- augmente à chaque enregistrement (détecte deux onglets qui écrivent)
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Verrou : une seule personne (et un seul onglet) modifie ; les autres voient le projet en lecture seule.
  lock_user    uuid REFERENCES users(id) ON DELETE SET NULL,
  lock_session text,
  lock_since   timestamptz,
  lock_until   timestamptz,
  -- Séance de travail déjà copiée en version (une copie automatique au premier enregistrement de chaque séance).
  versioned_session text
);
-- Un seul montage principal par conférence (les extraits de l'étape E5 pourront être plusieurs).
CREATE UNIQUE INDEX editor_projects_main ON editor_projects(talk_id) WHERE kind = 'main';

-- Versions : copies du montage, automatiques (au début de chaque séance de travail) ou nommées à la main.
CREATE TABLE editor_versions (
  project_id  uuid NOT NULL REFERENCES editor_projects(id) ON DELETE CASCADE,
  n           int NOT NULL,
  label       text NOT NULL DEFAULT '',
  auto        boolean NOT NULL DEFAULT true,
  timeline    jsonb NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, n)
);
