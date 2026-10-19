-- Module « Éditeur de montage » — étape E3 : habillage (titres, bandeaux, logo, intro et fin, transitions, sous-titres incrustés).
-- 1) Les logos importés rejoignent la bibliothèque (editor_assets, kind = 'logo') : png, jpeg ou webp, avec leurs dimensions.
-- 2) Les modèles de chaîne (editor_templates) gardent un habillage réutilisable : pour une chaîne, ou pour toutes (administrateur).
ALTER TABLE editor_assets DROP CONSTRAINT IF EXISTS editor_assets_kind_check;
ALTER TABLE editor_assets ADD CONSTRAINT editor_assets_kind_check CHECK (kind IN ('music', 'logo'));
ALTER TABLE editor_assets ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';   -- logo : { w, h }

CREATE TABLE editor_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_slug text,                              -- chaîne (speakers.slug) ; NULL = tous les montages (créé par un administrateur)
  name         text NOT NULL,
  dress        jsonb NOT NULL,                    -- habillage sans les transitions propres à chaque extrait
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_editor_templates_name ON editor_templates (COALESCE(channel_slug, ''), lower(name));
