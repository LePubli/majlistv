-- Catégories automatiques (étape « suggérer ») : l'IA propose, un humain valide.
-- Règle d'or : l'IA ne peut proposer QUE des catégories qui existent (identifiants contrôlés par le service) ; elle ne remplace jamais
-- un choix fait à la main : une proposition validée s'AJOUTE (catégorie principale si la vidéo n'en a pas, sinon catégorie supplémentaire).
CREATE TABLE IF NOT EXISTS talk_category_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence  smallint NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  reason      text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 400),   -- une phrase de justification, tirée de ce que dit la vidéo
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (talk_id, category_id)          -- une refusée n'est jamais reproposée ; une validée non plus
);
CREATE INDEX IF NOT EXISTS idx_tcs_review ON talk_category_suggestions(created_at) WHERE status = 'draft';

-- Demandes d'analyse (une par vidéo) : reprises par le service translator.
CREATE TABLE IF NOT EXISTS category_jobs (
  talk_id    uuid PRIMARY KEY REFERENCES talks(id) ON DELETE CASCADE,
  lang       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  produced   integer NOT NULL DEFAULT 0,
  basis      text NOT NULL DEFAULT '' ,       -- sur quoi l'analyse s'est appuyée : transcript | summary | metadata
  error      text,
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_category_jobs_queue ON category_jobs(created_at) WHERE status IN ('pending', 'processing');
