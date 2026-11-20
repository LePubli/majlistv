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
  ('coran', 'Le Coran', 'adult', 10, '📖', NULL),
  ('foi-croyance', 'La foi et la croyance', 'adult', 20, '🌙', NULL),
  ('hadith-sunna', 'Hadith et Sunna', 'adult', 30, '📜', NULL),
  ('vie-du-prophete', 'La vie du Prophète ﷺ', 'adult', 40, '🕌', NULL),
  ('prophetes-grandes-figures', 'Prophètes et grandes figures', 'adult', 50, '🌟', NULL),
  ('sciences-islamiques', 'Sciences islamiques', 'adult', 60, '🎓', NULL),
  ('pratiques-adorations', 'Pratiques et adorations', 'adult', 70, '🤲', NULL),
  ('spiritualite', 'Spiritualité et développement personnel', 'adult', 80, '💛', NULL),
  ('famille-societe', 'Famille et société', 'adult', 90, '👨‍👩‍👧', NULL),
  ('histoire-civilisations', 'Histoire et civilisations', 'adult', 100, '🏛️', NULL),
  ('sciences-decouvertes', 'Sciences, savoirs et découvertes', 'adult', 110, '🔭', NULL),
  ('islam-contemporain', 'Islam et monde contemporain', 'adult', 120, '🌍', NULL),
  ('conferences-enseignements', 'Conférences et enseignements', 'adult', 130, '🎤', NULL),
  ('decouvrir-islam', 'Découvrir l''Islam', 'adult', 140, '🧭', NULL),
  ('kids-series-aventures', 'Mes séries et aventures', 'kids', 10, '🎬', '#FF8A3D'),
  ('kids-histoires-prophetes', 'Histoires des prophètes', 'kids', 20, '🌙', '#7C5CFF'),
  ('kids-coran', 'Mon Coran', 'kids', 30, '📖', '#19B88B'),
  ('kids-foi', 'Je découvre ma foi', 'kids', 40, '☀️', '#FFC83D'),
  ('kids-pratiques', 'J''apprends à pratiquer', 'kids', 50, '🕋', '#2D9CFF'),
  ('kids-belles-valeurs', 'Les belles valeurs (Adab)', 'kids', 60, '🤝', '#FF5C8A'),
  ('kids-sciences-decouvertes', 'Sciences et découvertes', 'kids', 70, '🔬', '#22C1D6'),
  ('kids-apprendre-arabe', 'J''apprends l''arabe', 'kids', 80, '✏️', '#8BC34A'),
  ('kids-jeux-quiz', 'Jeux et quiz', 'kids', 90, '🎲', '#FF6B4A'),
  ('kids-chansons-contes', 'Chansons, contes et créativité', 'kids', 100, '🎵', '#B26BFF')
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;

INSERT INTO categories (slug, name, parent_id, catalogue_type, display_order)
SELECT v.slug, v.name, p.id, v.ct, v.ord
  FROM (VALUES
  ('coran-recitation-du-coran', 'Récitation du Coran', 'coran', 'adult', 10),
  ('coran-apprendre-a-lire-le-coran', 'Apprendre à lire le Coran', 'coran', 'adult', 20),
  ('coran-tajwid-et-regles-de-recitation', 'Tajwid et règles de récitation', 'coran', 'adult', 30),
  ('coran-memorisation-du-coran', 'Mémorisation du Coran', 'coran', 'adult', 40),
  ('coran-tafsir-et-explication-des-sourates', 'Tafsir et explication des sourates', 'coran', 'adult', 50),
  ('coran-meditation-du-coran', 'Méditation du Coran', 'coran', 'adult', 60),
  ('coran-sciences-du-coran', 'Sciences du Coran', 'coran', 'adult', 70),
  ('coran-vocabulaire-coranique', 'Vocabulaire coranique', 'coran', 'adult', 80),
  ('coran-recitateurs', 'Récitateurs', 'coran', 'adult', 90),
  ('coran-comprendre-le-coran-en-francais', 'Comprendre le Coran en français', 'coran', 'adult', 100),
  ('foi-croyance-les-six-piliers-de-la-foi', 'Les six piliers de la foi', 'foi-croyance', 'adult', 10),
  ('foi-croyance-connaitre-allah', 'Connaître Allah', 'foi-croyance', 'adult', 20),
  ('foi-croyance-les-noms-et-attributs-d-allah', 'Les noms et attributs d''Allah', 'foi-croyance', 'adult', 30),
  ('foi-croyance-les-anges', 'Les anges', 'foi-croyance', 'adult', 40),
  ('foi-croyance-les-livres-reveles', 'Les Livres révélés', 'foi-croyance', 'adult', 50),
  ('foi-croyance-les-prophetes-et-messagers', 'Les prophètes et messagers', 'foi-croyance', 'adult', 60),
  ('foi-croyance-le-jour-dernier', 'Le Jour dernier', 'foi-croyance', 'adult', 70),
  ('foi-croyance-le-destin', 'Le destin', 'foi-croyance', 'adult', 80),
  ('foi-croyance-les-fondements-du-tawhid', 'Les fondements du Tawhid', 'foi-croyance', 'adult', 90),
  ('foi-croyance-questions-et-doutes-sur-la-foi', 'Questions et doutes sur la foi', 'foi-croyance', 'adult', 100),
  ('hadith-sunna-les-40-hadiths-d-an-nawawi', 'Les 40 hadiths d''An-Nawawi', 'hadith-sunna', 'adult', 10),
  ('hadith-sunna-sahih-al-bukhari', 'Sahih Al-Bukhari', 'hadith-sunna', 'adult', 20),
  ('hadith-sunna-sahih-muslim', 'Sahih Muslim', 'hadith-sunna', 'adult', 30),
  ('hadith-sunna-riyad-as-salihin', 'Riyad As-Salihin', 'hadith-sunna', 'adult', 40),
  ('hadith-sunna-hadiths-du-quotidien', 'Hadiths du quotidien', 'hadith-sunna', 'adult', 50),
  ('hadith-sunna-comprendre-la-sunna', 'Comprendre la Sunna', 'hadith-sunna', 'adult', 60),
  ('hadith-sunna-sciences-du-hadith', 'Sciences du hadith', 'hadith-sunna', 'adult', 70),
  ('hadith-sunna-authenticite-et-classification', 'Authenticité et classification', 'hadith-sunna', 'adult', 80),
  ('hadith-sunna-comportements-prophetiques', 'Comportements prophétiques', 'hadith-sunna', 'adult', 90),
  ('vie-du-prophete-avant-la-revelation', 'Avant la révélation', 'vie-du-prophete', 'adult', 10),
  ('vie-du-prophete-la-revelation-a-la-mecque', 'La révélation à La Mecque', 'vie-du-prophete', 'adult', 20),
  ('vie-du-prophete-l-hegire', 'L''Hégire', 'vie-du-prophete', 'adult', 30),
  ('vie-du-prophete-la-periode-medinoise', 'La période médinoise', 'vie-du-prophete', 'adult', 40),
  ('vie-du-prophete-les-grands-evenements-de-la-sira', 'Les grands événements de la Sîra', 'vie-du-prophete', 'adult', 50),
  ('vie-du-prophete-la-famille-du-prophete', 'La famille du Prophète ﷺ', 'vie-du-prophete', 'adult', 60),
  ('vie-du-prophete-son-caractere-et-ses-qualites', 'Son caractère et ses qualités', 'vie-du-prophete', 'adult', 70),
  ('vie-du-prophete-ses-enseignements-au-quotidien', 'Ses enseignements au quotidien', 'vie-du-prophete', 'adult', 80),
  ('vie-du-prophete-les-dernieres-annees', 'Les dernières années', 'vie-du-prophete', 'adult', 90),
  ('vie-du-prophete-les-lecons-de-la-sira', 'Les leçons de la Sîra', 'vie-du-prophete', 'adult', 100),
  ('prophetes-grandes-figures-les-histoires-des-prophetes', 'Les histoires des prophètes', 'prophetes-grandes-figures', 'adult', 10),
  ('prophetes-grandes-figures-les-quatre-califes-bien-guides', 'Les quatre califes bien guidés', 'prophetes-grandes-figures', 'adult', 20),
  ('prophetes-grandes-figures-les-compagnons-du-prophete', 'Les compagnons du Prophète ﷺ', 'prophetes-grandes-figures', 'adult', 30),
  ('prophetes-grandes-figures-les-femmes-remarquables-de-l-islam', 'Les femmes remarquables de l''Islam', 'prophetes-grandes-figures', 'adult', 40),
  ('prophetes-grandes-figures-les-grandes-figures-du-savoir', 'Les grandes figures du savoir', 'prophetes-grandes-figures', 'adult', 50),
  ('prophetes-grandes-figures-les-savants-et-erudits', 'Les savants et érudits', 'prophetes-grandes-figures', 'adult', 60),
  ('prophetes-grandes-figures-les-personnalites-historiques', 'Les personnalités historiques', 'prophetes-grandes-figures', 'adult', 70),
  ('prophetes-grandes-figures-les-biographies-inspirantes', 'Les biographies inspirantes', 'prophetes-grandes-figures', 'adult', 80),
  ('sciences-islamiques-introduction-aux-sciences-islamiques', 'Introduction aux sciences islamiques', 'sciences-islamiques', 'adult', 10),
  ('sciences-islamiques-fiqh-et-jurisprudence', 'Fiqh et jurisprudence', 'sciences-islamiques', 'adult', 20),
  ('sciences-islamiques-usul-al-fiqh', 'Usul al-Fiqh', 'sciences-islamiques', 'adult', 30),
  ('sciences-islamiques-aqida-et-theologie', 'Aqida et théologie', 'sciences-islamiques', 'adult', 40),
  ('sciences-islamiques-sciences-du-coran', 'Sciences du Coran', 'sciences-islamiques', 'adult', 50),
  ('sciences-islamiques-sciences-du-hadith', 'Sciences du hadith', 'sciences-islamiques', 'adult', 60),
  ('sciences-islamiques-langue-arabe-classique', 'Langue arabe classique', 'sciences-islamiques', 'adult', 70),
  ('sciences-islamiques-ecoles-juridiques', 'Écoles juridiques', 'sciences-islamiques', 'adult', 80),
  ('sciences-islamiques-methodologie-de-recherche', 'Méthodologie de recherche', 'sciences-islamiques', 'adult', 90),
  ('sciences-islamiques-ouvrages-classiques', 'Ouvrages classiques', 'sciences-islamiques', 'adult', 100),
  ('pratiques-adorations-les-cinq-piliers-de-l-islam', 'Les cinq piliers de l''Islam', 'pratiques-adorations', 'adult', 10),
  ('pratiques-adorations-ablutions-et-purification', 'Ablutions et purification', 'pratiques-adorations', 'adult', 20),
  ('pratiques-adorations-la-priere', 'La prière', 'pratiques-adorations', 'adult', 30),
  ('pratiques-adorations-le-jeune', 'Le jeûne', 'pratiques-adorations', 'adult', 40),
  ('pratiques-adorations-la-zakat-et-l-aumone', 'La Zakat et l''aumône', 'pratiques-adorations', 'adult', 50),
  ('pratiques-adorations-le-hajj-et-la-omra', 'Le Hajj et la Omra', 'pratiques-adorations', 'adult', 60),
  ('pratiques-adorations-les-invocations', 'Les invocations', 'pratiques-adorations', 'adult', 70),
  ('pratiques-adorations-le-dhikr', 'Le Dhikr', 'pratiques-adorations', 'adult', 80),
  ('pratiques-adorations-prieres-surerogatoires', 'Prières surérogatoires', 'pratiques-adorations', 'adult', 90),
  ('pratiques-adorations-pratique-au-quotidien', 'Pratique au quotidien', 'pratiques-adorations', 'adult', 100),
  ('spiritualite-purification-du-cur', 'Purification du cœur', 'spiritualite', 'adult', 10),
  ('spiritualite-patience-et-perseverance', 'Patience et persévérance', 'spiritualite', 'adult', 20),
  ('spiritualite-gratitude', 'Gratitude', 'spiritualite', 'adult', 30),
  ('spiritualite-sincerite-et-intention', 'Sincérité et intention', 'spiritualite', 'adult', 40),
  ('spiritualite-confiance-en-allah', 'Confiance en Allah', 'spiritualite', 'adult', 50),
  ('spiritualite-repentir-et-pardon', 'Repentir et pardon', 'spiritualite', 'adult', 60),
  ('spiritualite-gestion-des-emotions', 'Gestion des émotions', 'spiritualite', 'adult', 70),
  ('spiritualite-epreuves-de-la-vie', 'Épreuves de la vie', 'spiritualite', 'adult', 80),
  ('spiritualite-motivation-et-discipline', 'Motivation et discipline', 'spiritualite', 'adult', 90),
  ('spiritualite-rappels-spirituels', 'Rappels spirituels', 'spiritualite', 'adult', 100),
  ('famille-societe-mariage-et-vie-conjugale', 'Mariage et vie conjugale', 'famille-societe', 'adult', 10),
  ('famille-societe-parentalite-et-education', 'Parentalité et éducation', 'famille-societe', 'adult', 20),
  ('famille-societe-adolescence-et-jeunesse', 'Adolescence et jeunesse', 'famille-societe', 'adult', 30),
  ('famille-societe-relations-avec-les-parents', 'Relations avec les parents', 'famille-societe', 'adult', 40),
  ('famille-societe-fraternite-et-relations-sociales', 'Fraternité et relations sociales', 'famille-societe', 'adult', 50),
  ('famille-societe-travail-et-vie-professionnelle', 'Travail et vie professionnelle', 'famille-societe', 'adult', 60),
  ('famille-societe-ethique-et-comportement', 'Éthique et comportement', 'famille-societe', 'adult', 70),
  ('famille-societe-solidarite', 'Solidarité', 'famille-societe', 'adult', 80),
  ('famille-societe-voisinage', 'Voisinage', 'famille-societe', 'adult', 90),
  ('famille-societe-questions-familiales-contemporaines', 'Questions familiales contemporaines', 'famille-societe', 'adult', 100),
  ('histoire-civilisations-histoire-de-l-islam', 'Histoire de l''Islam', 'histoire-civilisations', 'adult', 10),
  ('histoire-civilisations-les-premiers-siecles', 'Les premiers siècles', 'histoire-civilisations', 'adult', 20),
  ('histoire-civilisations-les-califats', 'Les califats', 'histoire-civilisations', 'adult', 30),
  ('histoire-civilisations-al-andalus', 'Al-Andalus', 'histoire-civilisations', 'adult', 40),
  ('histoire-civilisations-l-age-d-or-des-sciences', 'L''âge d''or des sciences', 'histoire-civilisations', 'adult', 50),
  ('histoire-civilisations-les-grandes-dynasties', 'Les grandes dynasties', 'histoire-civilisations', 'adult', 60),
  ('histoire-civilisations-batailles-et-evenements-historiques', 'Batailles et événements historiques', 'histoire-civilisations', 'adult', 70),
  ('histoire-civilisations-villes-historiques', 'Villes historiques', 'histoire-civilisations', 'adult', 80),
  ('histoire-civilisations-architecture-et-patrimoine', 'Architecture et patrimoine', 'histoire-civilisations', 'adult', 90),
  ('histoire-civilisations-civilisations-et-echanges-culturels', 'Civilisations et échanges culturels', 'histoire-civilisations', 'adult', 100),
  ('sciences-decouvertes-astronomie', 'Astronomie', 'sciences-decouvertes', 'adult', 10),
  ('sciences-decouvertes-mathematiques', 'Mathématiques', 'sciences-decouvertes', 'adult', 20),
  ('sciences-decouvertes-medecine-dans-l-histoire', 'Médecine dans l''histoire', 'sciences-decouvertes', 'adult', 30),
  ('sciences-decouvertes-physique-et-optique', 'Physique et optique', 'sciences-decouvertes', 'adult', 40),
  ('sciences-decouvertes-geographie-et-exploration', 'Géographie et exploration', 'sciences-decouvertes', 'adult', 50),
  ('sciences-decouvertes-inventions-et-decouvertes', 'Inventions et découvertes', 'sciences-decouvertes', 'adult', 60),
  ('sciences-decouvertes-nature-et-environnement', 'Nature et environnement', 'sciences-decouvertes', 'adult', 70),
  ('sciences-decouvertes-savants-musulmans', 'Savants musulmans', 'sciences-decouvertes', 'adult', 80),
  ('sciences-decouvertes-bibliotheques-et-transmission-du-savoir', 'Bibliothèques et transmission du savoir', 'sciences-decouvertes', 'adult', 90),
  ('sciences-decouvertes-sciences-et-reflexion-ethique', 'Sciences et réflexion éthique', 'sciences-decouvertes', 'adult', 100),
  ('islam-contemporain-vivre-sa-foi-aujourd-hui', 'Vivre sa foi aujourd''hui', 'islam-contemporain', 'adult', 10),
  ('islam-contemporain-islam-en-france-et-en-europe', 'Islam en France et en Europe', 'islam-contemporain', 'adult', 20),
  ('islam-contemporain-identite-et-citoyennete', 'Identité et citoyenneté', 'islam-contemporain', 'adult', 30),
  ('islam-contemporain-ethique-numerique', 'Éthique numérique', 'islam-contemporain', 'adult', 40),
  ('islam-contemporain-economie-et-finance-ethique', 'Économie et finance éthique', 'islam-contemporain', 'adult', 50),
  ('islam-contemporain-environnement-et-responsabilite', 'Environnement et responsabilité', 'islam-contemporain', 'adult', 60),
  ('islam-contemporain-questions-de-societe', 'Questions de société', 'islam-contemporain', 'adult', 70),
  ('islam-contemporain-dialogue-et-coexistence', 'Dialogue et coexistence', 'islam-contemporain', 'adult', 80),
  ('islam-contemporain-idees-recues-sur-l-islam', 'Idées reçues sur l''Islam', 'islam-contemporain', 'adult', 90),
  ('islam-contemporain-questions-des-nouveaux-musulmans', 'Questions des nouveaux musulmans', 'islam-contemporain', 'adult', 100),
  ('conferences-enseignements-conferences-thematiques', 'Conférences thématiques', 'conferences-enseignements', 'adult', 10),
  ('conferences-enseignements-series-de-cours', 'Séries de cours', 'conferences-enseignements', 'adult', 20),
  ('conferences-enseignements-questions-reponses', 'Questions-réponses', 'conferences-enseignements', 'adult', 30),
  ('conferences-enseignements-debats-et-entretiens', 'Débats et entretiens', 'conferences-enseignements', 'adult', 40),
  ('conferences-enseignements-sermons-du-vendredi', 'Sermons du vendredi', 'conferences-enseignements', 'adult', 50),
  ('conferences-enseignements-rappels-courts', 'Rappels courts', 'conferences-enseignements', 'adult', 60),
  ('conferences-enseignements-seminaires', 'Séminaires', 'conferences-enseignements', 'adult', 70),
  ('conferences-enseignements-rencontres-avec-les-enseignants', 'Rencontres avec les enseignants', 'conferences-enseignements', 'adult', 80),
  ('conferences-enseignements-cours-en-arabe-sous-titres', 'Cours en arabe sous-titrés', 'conferences-enseignements', 'adult', 90),
  ('conferences-enseignements-conferences-traduites-en-francais', 'Conférences traduites en français', 'conferences-enseignements', 'adult', 100),
  ('decouvrir-islam-qu-est-ce-que-l-islam', 'Qu''est-ce que l''Islam ?', 'decouvrir-islam', 'adult', 10),
  ('decouvrir-islam-les-premieres-notions', 'Les premières notions', 'decouvrir-islam', 'adult', 20),
  ('decouvrir-islam-les-piliers-de-l-islam-et-de-la-foi', 'Les piliers de l''Islam et de la foi', 'decouvrir-islam', 'adult', 30),
  ('decouvrir-islam-decouvrir-le-coran', 'Découvrir le Coran', 'decouvrir-islam', 'adult', 40),
  ('decouvrir-islam-decouvrir-le-prophete', 'Découvrir le Prophète ﷺ', 'decouvrir-islam', 'adult', 50),
  ('decouvrir-islam-premiers-pas-dans-la-priere', 'Premiers pas dans la prière', 'decouvrir-islam', 'adult', 60),
  ('decouvrir-islam-parcours-pour-nouveaux-musulmans', 'Parcours pour nouveaux musulmans', 'decouvrir-islam', 'adult', 70),
  ('decouvrir-islam-questions-essentielles', 'Questions essentielles', 'decouvrir-islam', 'adult', 80),
  ('decouvrir-islam-lexique-islamique', 'Lexique islamique', 'decouvrir-islam', 'adult', 90),
  ('decouvrir-islam-premiers-parcours-guides', 'Premiers parcours guidés', 'decouvrir-islam', 'adult', 100),
  ('kids-series-aventures-yacine-et-lina', 'Yacine et Lina', 'kids-series-aventures', 'kids', 10),
  ('kids-series-aventures-les-aventures-du-quotidien', 'Les aventures du quotidien', 'kids-series-aventures', 'kids', 20),
  ('kids-series-aventures-series-educatives', 'Séries éducatives', 'kids-series-aventures', 'kids', 30),
  ('kids-series-aventures-histoires-en-famille', 'Histoires en famille', 'kids-series-aventures', 'kids', 40),
  ('kids-series-aventures-amitie-et-entraide', 'Amitié et entraide', 'kids-series-aventures', 'kids', 50),
  ('kids-series-aventures-grandes-aventures', 'Grandes aventures', 'kids-series-aventures', 'kids', 60),
  ('kids-histoires-prophetes-adam', 'Adam', 'kids-histoires-prophetes', 'kids', 10),
  ('kids-histoires-prophetes-nuh', 'Nûh', 'kids-histoires-prophetes', 'kids', 20),
  ('kids-histoires-prophetes-ibrahim', 'Ibrahim', 'kids-histoires-prophetes', 'kids', 30),
  ('kids-histoires-prophetes-moussa', 'Moussa', 'kids-histoires-prophetes', 'kids', 40),
  ('kids-histoires-prophetes-youssouf', 'Youssouf', 'kids-histoires-prophetes', 'kids', 50),
  ('kids-histoires-prophetes-issa', 'Issa', 'kids-histoires-prophetes', 'kids', 60),
  ('kids-histoires-prophetes-muhammad', 'Muhammad ﷺ', 'kids-histoires-prophetes', 'kids', 70),
  ('kids-histoires-prophetes-les-lecons-des-prophetes', 'Les leçons des prophètes', 'kids-histoires-prophetes', 'kids', 80),
  ('kids-coran-decouvrir-le-coran', 'Découvrir le Coran', 'kids-coran', 'kids', 10),
  ('kids-coran-les-petites-sourates', 'Les petites sourates', 'kids-coran', 'kids', 20),
  ('kids-coran-apprendre-al-fatiha', 'Apprendre Al-Fatiha', 'kids-coran', 'kids', 30),
  ('kids-coran-recitation-et-repetition', 'Récitation et répétition', 'kids-coran', 'kids', 40),
  ('kids-coran-premieres-lettres-arabes', 'Premières lettres arabes', 'kids-coran', 'kids', 50),
  ('kids-coran-histoires-du-coran', 'Histoires du Coran', 'kids-coran', 'kids', 60),
  ('kids-coran-memoriser-en-s-amusant', 'Mémoriser en s''amusant', 'kids-coran', 'kids', 70),
  ('kids-coran-comprendre-une-sourate', 'Comprendre une sourate', 'kids-coran', 'kids', 80),
  ('kids-foi-allah-notre-createur', 'Allah, notre Créateur', 'kids-foi', 'kids', 10),
  ('kids-foi-les-belles-choses-de-la-creation', 'Les belles choses de la création', 'kids-foi', 'kids', 20),
  ('kids-foi-les-six-piliers-de-la-foi', 'Les six piliers de la foi', 'kids-foi', 'kids', 30),
  ('kids-foi-les-anges', 'Les anges', 'kids-foi', 'kids', 40),
  ('kids-foi-les-prophetes', 'Les prophètes', 'kids-foi', 'kids', 50),
  ('kids-foi-le-paradis', 'Le Paradis', 'kids-foi', 'kids', 60),
  ('kids-foi-la-confiance-en-allah', 'La confiance en Allah', 'kids-foi', 'kids', 70),
  ('kids-foi-mes-premieres-questions', 'Mes premières questions', 'kids-foi', 'kids', 80),
  ('kids-pratiques-mes-premieres-ablutions', 'Mes premières ablutions', 'kids-pratiques', 'kids', 10),
  ('kids-pratiques-j-apprends-la-priere', 'J''apprends la prière', 'kids-pratiques', 'kids', 20),
  ('kids-pratiques-les-petites-invocations', 'Les petites invocations', 'kids-pratiques', 'kids', 30),
  ('kids-pratiques-decouvrir-le-ramadan', 'Découvrir le Ramadan', 'kids-pratiques', 'kids', 40),
  ('kids-pratiques-la-generosite', 'La générosité', 'kids-pratiques', 'kids', 50),
  ('kids-pratiques-les-fetes-musulmanes', 'Les fêtes musulmanes', 'kids-pratiques', 'kids', 60),
  ('kids-pratiques-decouvrir-le-hajj', 'Découvrir le Hajj', 'kids-pratiques', 'kids', 70),
  ('kids-pratiques-mes-bonnes-habitudes', 'Mes bonnes habitudes', 'kids-pratiques', 'kids', 80),
  ('kids-belles-valeurs-dire-la-verite', 'Dire la vérité', 'kids-belles-valeurs', 'kids', 10),
  ('kids-belles-valeurs-etre-gentil', 'Être gentil', 'kids-belles-valeurs', 'kids', 20),
  ('kids-belles-valeurs-respecter-ses-parents', 'Respecter ses parents', 'kids-belles-valeurs', 'kids', 30),
  ('kids-belles-valeurs-partager', 'Partager', 'kids-belles-valeurs', 'kids', 40),
  ('kids-belles-valeurs-la-patience', 'La patience', 'kids-belles-valeurs', 'kids', 50),
  ('kids-belles-valeurs-le-pardon', 'Le pardon', 'kids-belles-valeurs', 'kids', 60),
  ('kids-belles-valeurs-la-gratitude', 'La gratitude', 'kids-belles-valeurs', 'kids', 70),
  ('kids-belles-valeurs-la-proprete', 'La propreté', 'kids-belles-valeurs', 'kids', 80),
  ('kids-belles-valeurs-respecter-les-autres', 'Respecter les autres', 'kids-belles-valeurs', 'kids', 90),
  ('kids-belles-valeurs-les-bonnes-manieres', 'Les bonnes manières', 'kids-belles-valeurs', 'kids', 100),
  ('kids-sciences-decouvertes-les-animaux', 'Les animaux', 'kids-sciences-decouvertes', 'kids', 10),
  ('kids-sciences-decouvertes-la-nature', 'La nature', 'kids-sciences-decouvertes', 'kids', 20),
  ('kids-sciences-decouvertes-l-espace-et-les-etoiles', 'L''espace et les étoiles', 'kids-sciences-decouvertes', 'kids', 30),
  ('kids-sciences-decouvertes-le-corps-humain', 'Le corps humain', 'kids-sciences-decouvertes', 'kids', 40),
  ('kids-sciences-decouvertes-les-grandes-inventions', 'Les grandes inventions', 'kids-sciences-decouvertes', 'kids', 50),
  ('kids-sciences-decouvertes-les-savants-musulmans', 'Les savants musulmans', 'kids-sciences-decouvertes', 'kids', 60),
  ('kids-sciences-decouvertes-les-pays-du-monde', 'Les pays du monde', 'kids-sciences-decouvertes', 'kids', 70),
  ('kids-sciences-decouvertes-les-merveilles-de-la-terre', 'Les merveilles de la Terre', 'kids-sciences-decouvertes', 'kids', 80),
  ('kids-apprendre-arabe-les-lettres-arabes', 'Les lettres arabes', 'kids-apprendre-arabe', 'kids', 10),
  ('kids-apprendre-arabe-mes-premiers-mots', 'Mes premiers mots', 'kids-apprendre-arabe', 'kids', 20),
  ('kids-apprendre-arabe-les-couleurs', 'Les couleurs', 'kids-apprendre-arabe', 'kids', 30),
  ('kids-apprendre-arabe-les-chiffres', 'Les chiffres', 'kids-apprendre-arabe', 'kids', 40),
  ('kids-apprendre-arabe-les-animaux-en-arabe', 'Les animaux en arabe', 'kids-apprendre-arabe', 'kids', 50),
  ('kids-apprendre-arabe-les-objets-du-quotidien', 'Les objets du quotidien', 'kids-apprendre-arabe', 'kids', 60),
  ('kids-apprendre-arabe-les-petites-phrases', 'Les petites phrases', 'kids-apprendre-arabe', 'kids', 70),
  ('kids-apprendre-arabe-les-mots-du-coran', 'Les mots du Coran', 'kids-apprendre-arabe', 'kids', 80),
  ('kids-jeux-quiz-quiz-des-prophetes', 'Quiz des prophètes', 'kids-jeux-quiz', 'kids', 10),
  ('kids-jeux-quiz-quiz-du-coran', 'Quiz du Coran', 'kids-jeux-quiz', 'kids', 20),
  ('kids-jeux-quiz-devine-l-animal', 'Devine l''animal', 'kids-jeux-quiz', 'kids', 30),
  ('kids-jeux-quiz-trouve-la-bonne-reponse', 'Trouve la bonne réponse', 'kids-jeux-quiz', 'kids', 40),
  ('kids-jeux-quiz-jeux-de-memoire', 'Jeux de mémoire', 'kids-jeux-quiz', 'kids', 50),
  ('kids-jeux-quiz-defis-des-belles-valeurs', 'Défis des belles valeurs', 'kids-jeux-quiz', 'kids', 60),
  ('kids-jeux-quiz-puzzles-educatifs', 'Puzzles éducatifs', 'kids-jeux-quiz', 'kids', 70),
  ('kids-jeux-quiz-revisions-amusantes', 'Révisions amusantes', 'kids-jeux-quiz', 'kids', 80),
  ('kids-chansons-contes-comptines-educatives', 'Comptines éducatives', 'kids-chansons-contes', 'kids', 10),
  ('kids-chansons-contes-anachid-et-chants', 'Anachid et chants', 'kids-chansons-contes', 'kids', 20),
  ('kids-chansons-contes-contes-illustres', 'Contes illustrés', 'kids-chansons-contes', 'kids', 30),
  ('kids-chansons-contes-histoires-avant-de-dormir', 'Histoires avant de dormir', 'kids-chansons-contes', 'kids', 40),
  ('kids-chansons-contes-dessins-et-activites', 'Dessins et activités', 'kids-chansons-contes', 'kids', 50),
  ('kids-chansons-contes-bricolages-du-ramadan', 'Bricolages du Ramadan', 'kids-chansons-contes', 'kids', 60),
  ('kids-chansons-contes-activites-a-faire-en-famille', 'Activités à faire en famille', 'kids-chansons-contes', 'kids', 70),
  ('kids-chansons-contes-histoires-interactives', 'Histoires interactives', 'kids-chansons-contes', 'kids', 80)
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
