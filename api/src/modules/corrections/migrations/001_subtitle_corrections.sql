-- Amélioration 4.1 : corrections de sous-titres proposées par les membres, relues par l'organisateur / un modérateur.
CREATE TABLE IF NOT EXISTS subtitle_corrections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id         uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  lang            text NOT NULL,
  idx             int  NOT NULL,
  start_ms        int  NOT NULL,
  original_text   text NOT NULL,                      -- la phrase telle que le membre la voyait
  suggested_text  text NOT NULL CHECK (char_length(suggested_text) BETWEEN 1 AND 2000),
  comment         text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,  -- compte supprimé : la suggestion reste, sans auteur
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  final_text      text,                               -- texte réellement appliqué (le relecteur peut l'ajuster)
  source_snapshot text,                               -- phrase de la langue d'origine au moment de l'acceptation (langues traduites) : sert à réappliquer après une retraduction
  reviewed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subcorr_status ON subtitle_corrections(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subcorr_talk ON subtitle_corrections(talk_id, status);
CREATE INDEX IF NOT EXISTS idx_subcorr_user_day ON subtitle_corrections(user_id, created_at DESC);
-- Une seule suggestion en attente par membre et par phrase.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subcorr_pending ON subtitle_corrections(user_id, talk_id, lang, idx) WHERE status = 'pending' AND user_id IS NOT NULL;
