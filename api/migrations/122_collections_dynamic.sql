-- Catalogue, phase 6 (20/11/2026) : collections dynamiques (cahier des charges § 11).
-- Une collection peut être MANUELLE (liste choisie à la main, comme avant), AUTOMATIQUE (règles : catégorie, intervenant, niveau, langue,
-- format, durée, tri), SAISONNIÈRE (visible seulement pendant une saison : Ramadan, Hajj…) ou PERSONNALISÉE (propre à chaque membre :
-- en cours, prochains épisodes, pour vous, à regarder plus tard). Aucune statistique de popularité n'est inventée.
-- Les collections existantes restent manuelles, sur le catalogue adulte, inchangées. Rejouable.
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS slug       text,
  ADD COLUMN IF NOT EXISTS mode       text    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS catalogue  text    NOT NULL DEFAULT 'adult',
  ADD COLUMN IF NOT EXISTS rule       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS season     text,
  ADD COLUMN IF NOT EXISTS on_home    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_order integer NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE collections ADD CONSTRAINT collections_mode_chk CHECK (mode IN ('manual', 'auto', 'seasonal', 'personal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE collections ADD CONSTRAINT collections_catalogue_chk CHECK (catalogue IN ('adult', 'kids'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_uq ON collections(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS collections_home_idx ON collections(catalogue, on_home, home_order) WHERE published;

-- Collections de départ du cahier des charges (§ 11), en BROUILLON : rien ne s'affiche tant que l'administrateur ne les publie pas
-- (Studio → Collections). Les règles désignent les catégories par leur identifiant stable (slug), jamais par un numéro.
-- Non créées faute de données réelles : « Documentaires populaires », « Mes personnages préférés » (pas de statistique ni de personnages).
INSERT INTO collections(slug, title, description, kind, mode, catalogue, rule, season, on_home, home_order, published) VALUES
  ('continuer-a-regarder',   'Continuer à regarder',            'Les vidéos que vous avez commencées.',                    'theme', 'personal', 'adult', '{"type":"continue"}', NULL, true, 1, false),
  ('a-la-une',               'À la une',                        'La sélection mise en avant par l''équipe.',               'theme', 'auto',     'adult', '{"featured":true,"sort":"recent"}', NULL, true, 2, false),
  ('nouveautes',             'Nouveautés',                      'Les dernières vidéos publiées.',                          'theme', 'auto',     'adult', '{"sort":"recent"}', NULL, true, 3, false),
  ('series-historiques',     'Séries historiques',              'Histoire et civilisations.',                              'theme', 'auto',     'adult', '{"category":"histoire-civilisations","sort":"recent"}', NULL, true, 4, false),
  ('comprendre-le-coran',    'Comprendre le Coran',             'Récitation, tafsir et sciences du Coran.',                'theme', 'auto',     'adult', '{"category":"coran","sort":"recent"}', NULL, true, 5, false),
  ('les-grands-recits',      'Les grands récits',               'Prophètes et grandes figures.',                           'theme', 'auto',     'adult', '{"category":"prophetes-grandes-figures","sort":"recent"}', NULL, true, 6, false),
  ('conferenciers-a-decouvrir','Les conférenciers à découvrir', 'Choisis à la main par l''équipe.',                        'theme', 'manual',   'adult', '{}', NULL, true, 7, false),
  ('rappels-spirituels',     'Rappels spirituels',              'Courtes vidéos pour le cœur.',                            'theme', 'auto',     'adult', '{"category":"spiritualite-rappels-spirituels","sort":"recent"}', NULL, true, 8, false),
  ('reprendre-mon-parcours', 'Reprendre mon parcours',          'La suite de vos séries.',                                 'theme', 'personal', 'adult', '{"type":"path"}', NULL, true, 9, false),
  ('moins-de-10-minutes',    'À découvrir en moins de 10 minutes','Pour une pause courte.',                                'theme', 'auto',     'adult', '{"maxSeconds":600,"sort":"recent"}', NULL, true, 10, false),
  ('selections-du-ramadan',  'Sélections du Ramadan',           'Visible pendant la saison du Ramadan.',                   'theme', 'seasonal', 'adult', '{}', 'ramadan', true, 11, false),
  ('selections-du-hajj',     'Sélections du Hajj',              'Visible pendant la saison du Hajj.',                      'theme', 'seasonal', 'adult', '{}', 'hajj', true, 12, false),
  ('recommandations',        'Recommandations personnalisées',  'D''après vos favoris et vos vidéos à regarder plus tard.','theme', 'personal', 'adult', '{"type":"foryou"}', NULL, true, 13, false),
  ('kids-reprendre-aventure','Reprendre mon aventure',          'Les vidéos commencées.',                                  'theme', 'personal', 'kids',  '{"type":"continue"}', NULL, true, 1, false),
  ('kids-yacine-et-lina',    'Yacine et Lina',                  'Les aventures de Yacine et Lina.',                        'theme', 'auto',     'kids',  '{"category":"kids-series-aventures-yacine-et-lina","sort":"recent"}', NULL, true, 2, false),
  ('kids-a-regarder-maintenant','À regarder maintenant',        'Choisis à la main par l''équipe.',                        'theme', 'manual',   'kids',  '{}', NULL, true, 3, false),
  ('kids-histoires-des-prophetes','Histoires des prophètes',    'Les prophètes racontés aux enfants.',                     'theme', 'auto',     'kids',  '{"category":"kids-histoires-prophetes","sort":"recent"}', NULL, true, 4, false),
  ('kids-j-apprends-en-m-amusant','J''apprends en m''amusant',  'Choisis à la main par l''équipe.',                        'theme', 'manual',   'kids',  '{}', NULL, true, 5, false),
  ('kids-les-belles-valeurs','Les belles valeurs',              'Adab et bonnes manières.',                                'theme', 'auto',     'kids',  '{"category":"kids-belles-valeurs","sort":"recent"}', NULL, true, 6, false),
  ('kids-les-animaux',       'Les animaux',                     'Découvrir les animaux.',                                  'theme', 'auto',     'kids',  '{"category":"kids-sciences-decouvertes-les-animaux","sort":"recent"}', NULL, true, 7, false),
  ('kids-quiz-de-la-semaine','Quiz de la semaine',              'Choisis à la main par l''équipe chaque semaine.',         'theme', 'manual',   'kids',  '{}', NULL, true, 8, false),
  ('kids-nouveautes',        'Nouveautés Kids',                 'Les dernières vidéos Kids.',                              'theme', 'auto',     'kids',  '{"sort":"recent"}', NULL, true, 9, false)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;
