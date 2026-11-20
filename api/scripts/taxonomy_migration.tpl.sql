-- Nouveau catalogue (cahier des charges du 20/11/2026), phase 1 : modèle de catégories unique (adultes + Kids),
-- 14 catégories adultes et 10 univers Kids avec leurs sous-catégories, nouvelles tranches d'âge Kids (3-5, 6-8, 9-12, 13-15).
-- FICHIER GÉNÉRÉ par api/scripts/gen_taxonomy_sql.py à partir de api/content/catalogue-taxonomy.json : ne pas modifier à la main.
-- Décision d'Epok (20/11) : les anciennes catégories et tranches d'âge sont REMPLACÉES (il reclassera les vidéos lui-même).
-- Rien n'est perdu pour autant : l'ancien classement est copié dans legacy_catalogue_backup avant remplacement.
-- Les vidéos et séries ne sont jamais supprimées : elles perdent seulement leur catégorie (ON DELETE SET NULL).

-- 1. Champs d'une catégorie (slug stable, indépendant des traductions).
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS slug              text,
  ADD COLUMN IF NOT EXISTS catalogue_type    text NOT NULL DEFAULT 'adult' CHECK (catalogue_type IN ('adult', 'kids')),
  ADD COLUMN IF NOT EXISTS description       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS short_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_order     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icon              text,
  ADD COLUMN IF NOT EXISTS image             text,
  ADD COLUMN IF NOT EXISTS hero_image        text,
  ADD COLUMN IF NOT EXISTS color             text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS seo_title         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seo_description   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS translations     jsonb NOT NULL DEFAULT '{}',   -- { "en": { "name": "…", "description": "…" }, "ar": { … } } ; le français est dans name
  ADD COLUMN IF NOT EXISTS created_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_catalogue ON categories (catalogue_type, display_order);

-- 2. Copie de l'ancien classement (retour arrière possible : on sait quelle vidéo était dans quelle catégorie).
CREATE TABLE IF NOT EXISTS legacy_catalogue_backup (
  id            serial PRIMARY KEY,
  kind          text NOT NULL,        -- talk_principal | talk_extra | series | talk_kid_bands | favorite_categories
  talk_id       uuid,
  series_id     uuid,
  user_id       uuid,
  category_name text,                 -- « Parent › Sous-catégorie » tel qu'il était
  value         text,                 -- tranches d'âge d'avant, identifiants favoris…
  saved_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Remplacement fait une seule fois : s'il y a déjà la catégorie « coran », la migration a déjà eu lieu.
  IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'coran') THEN
    INSERT INTO legacy_catalogue_backup(kind, talk_id, category_name)
      SELECT 'talk_principal', t.id, n.name FROM talks t JOIN category_names n ON n.id = t.category_id WHERE t.category_id IS NOT NULL;
    INSERT INTO legacy_catalogue_backup(kind, talk_id, category_name)
      SELECT 'talk_extra', tc.talk_id, n.name FROM talk_categories tc JOIN category_names n ON n.id = tc.category_id;
    INSERT INTO legacy_catalogue_backup(kind, series_id, category_name)
      SELECT 'series', s.id, n.name FROM series s JOIN category_names n ON n.id = s.category_id WHERE s.category_id IS NOT NULL;
    INSERT INTO legacy_catalogue_backup(kind, talk_id, value)
      SELECT 'talk_kid_bands', id, array_to_string(kids_bands, ',') FROM talks WHERE kids_bands <> '{}';
    INSERT INTO legacy_catalogue_backup(kind, user_id, value)
      SELECT 'favorite_categories', id, array_to_string(favorite_categories, ',') FROM users WHERE favorite_categories <> '{}';
    UPDATE users SET favorite_categories = '{}' WHERE favorite_categories <> '{}';
    -- Anciennes catégories : sous-catégories d'abord (la suppression d'un parent est refusée tant qu'il a des enfants).
    DELETE FROM categories WHERE parent_id IS NOT NULL AND slug IS NULL;
    DELETE FROM categories WHERE slug IS NULL;
  END IF;
END $$;

-- 3. Les 24 catégories principales (14 adultes, 10 Kids), puis leurs sous-catégories. Rejouable : ON CONFLICT sur le slug.
INSERT INTO categories (slug, name, catalogue_type, display_order, icon, color) VALUES
/*TOP*/
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;

INSERT INTO categories (slug, name, parent_id, catalogue_type, display_order)
SELECT v.slug, v.name, p.id, v.ct, v.ord
  FROM (VALUES
/*SUB*/
  ) AS v(slug, name, parent_slug, ct, ord)
  JOIN categories p ON p.slug = v.parent_slug AND p.parent_id IS NULL
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;

-- 4. Tranches d'âge Kids : 3-5, 6-8, 9-12, 13-15 (remplacent 3-6, 7-10, 11-14).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
            WHERE contype = 'c' AND conrelid IN ('talks'::regclass, 'kid_profiles'::regclass) AND pg_get_constraintdef(oid) LIKE '%3-6%' LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
-- Une vidéo d'une ancienne tranche est proposée aux nouvelles tranches qui la recouvrent (3-6 → 3-5 et 6-8 ; 7-10 → 6-8 et 9-12 ; 11-14 → 9-12 et 13-15).
UPDATE talks SET kids_bands = ARRAY(
  SELECT b FROM unnest(ARRAY['3-5', '6-8', '9-12', '13-15']) AS b
   WHERE (b = '3-5' AND kids_bands @> ARRAY['3-6'])
      OR (b = '6-8' AND (kids_bands @> ARRAY['3-6'] OR kids_bands @> ARRAY['7-10']))
      OR (b = '9-12' AND (kids_bands @> ARRAY['7-10'] OR kids_bands @> ARRAY['11-14']))
      OR (b = '13-15' AND kids_bands @> ARRAY['11-14']))
 WHERE kids_bands && ARRAY['3-6', '7-10', '11-14'];
-- Un profil enfant passe à la nouvelle tranche de même rang, la plus jeune des deux recouvrements (le parent peut la changer).
UPDATE kid_profiles SET band = CASE band WHEN '3-6' THEN '3-5' WHEN '7-10' THEN '6-8' WHEN '11-14' THEN '9-12' ELSE band END;
ALTER TABLE talks DROP CONSTRAINT IF EXISTS talks_kids_bands_check;
ALTER TABLE talks ADD CONSTRAINT talks_kids_bands_check CHECK (kids_bands <@ ARRAY['3-5', '6-8', '9-12', '13-15']::text[]);
ALTER TABLE kid_profiles DROP CONSTRAINT IF EXISTS kid_profiles_band_check;
ALTER TABLE kid_profiles ADD CONSTRAINT kid_profiles_band_check CHECK (band IN ('3-5', '6-8', '9-12', '13-15'));
COMMENT ON COLUMN talks.kids_band IS 'Obsolète (avant 26.5) : ancien système de tranches, conservé tel quel, plus utilisé.';
