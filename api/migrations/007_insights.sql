-- Étape 3D : résumé, points clés et chapitres générés par IA (une ligne par conférence et par langue).
-- La ligne de la langue d'origine est générée depuis la transcription ; les autres langues sont des traductions de cette ligne.
CREATE TABLE talk_insights (
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  lang       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  summary    text NOT NULL DEFAULT '',
  key_points jsonb NOT NULL DEFAULT '[]',
  chapters   jsonb NOT NULL DEFAULT '[]',   -- [{ "ms": 125000, "title": "…" }]
  error      text,
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talk_id, lang)
);
CREATE INDEX idx_insights_queue ON talk_insights(created_at) WHERE status IN ('pending', 'processing');
