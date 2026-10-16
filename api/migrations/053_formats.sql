-- Étape B : « Format » d'un contenu (conférence, cours, récitation…), en plus des catégories (sujets).
-- Liste administrée dans Admin → Catégories et formats. Le code (slug) ne change jamais : il sert de repère stable.
CREATE TABLE IF NOT EXISTS formats (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name_fr text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  name_ar text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0
);
INSERT INTO formats(slug, name_fr, name_en, name_ar, position) VALUES
  ('conference',  'Conférence',                          'Lecture',                   'محاضرة',          10),
  ('cours',       'Cours',                               'Course',                    'درس',             20),
  ('recitation',  'Récitation et lecture',               'Recitation and reading',    'تلاوة وقراءة',    30),
  ('documentaire','Documentaire, entretien et débat',    'Documentary, interview and debate', 'وثائقي وحوار ونقاش', 40),
  ('dessin-anime','Dessin animé',                        'Cartoon',                   'رسوم متحركة',     50),
  ('rappel',      'Rappel',                              'Reminder',                  'تذكير',           60)
ON CONFLICT (slug) DO NOTHING;
UPDATE formats SET name_en = 'Talk' WHERE slug = 'conference' AND name_en = 'Lecture';

ALTER TABLE talks ADD COLUMN IF NOT EXISTS format_id int REFERENCES formats(id) ON DELETE SET NULL;
-- Tout le contenu existant est de la conférence (décision d'Epok) : le Studio permet ensuite de corriger, un par un ou en lot.
UPDATE talks SET format_id = (SELECT id FROM formats WHERE slug = 'conference') WHERE format_id IS NULL;
CREATE INDEX IF NOT EXISTS talks_format_idx ON talks(format_id);
