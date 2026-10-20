-- Module « Shorts publics » : un short publié est une COPIE du rendu vertical d'un extrait de l'éditeur (fichier shorts/<id>.mp4),
-- pour que le nettoyage des rendus de l'éditeur ne casse jamais un short en ligne.
-- Le lien avec la chaîne passe par la conférence (talks.speaker), comme partout ailleurs.
CREATE TABLE IF NOT EXISTS public_shorts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id      uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  project_id   uuid,                                         -- extrait de l'éditeur d'où il vient (peut disparaître sans effet)
  title        text NOT NULL DEFAULT '',
  video_key    text NOT NULL,                                -- shorts/<id>.mp4
  duration_s   numeric,
  bytes        bigint,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  views        int NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_shorts_feed ON public_shorts(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS public_shorts_talk ON public_shorts(talk_id);
-- Une vue par personne et par short et par jour (visiteur : empreinte anonyme salée ; membre : identifiant).
CREATE TABLE IF NOT EXISTS public_short_views (
  short_id  uuid NOT NULL REFERENCES public_shorts(id) ON DELETE CASCADE,
  day       date NOT NULL DEFAULT current_date,
  viewer    text NOT NULL,
  PRIMARY KEY (short_id, day, viewer)
);
