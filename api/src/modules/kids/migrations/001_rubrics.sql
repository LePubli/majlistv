-- Mejliss Kids en vrai catalogue (20/10) : « rubriques Kids », distinctes des catégories adultes, gérées dans l'Admin.
-- Une conférence peut être dans plusieurs rubriques. Rien n'est supprimé ni modifié dans les tables existantes.
CREATE TABLE kid_rubrics (
  id         serial PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,60}$'),
  names      jsonb NOT NULL,                 -- { "fr": "...", "en": "...", "ar": "..." } (fr obligatoire côté API)
  emoji      text NOT NULL DEFAULT '⭐',
  position   int  NOT NULL DEFAULT 0,        -- ordre d'affichage (croissant)
  active     boolean NOT NULL DEFAULT true,  -- inactive : cachée des enfants, conférences conservées
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE talk_kid_rubrics (
  talk_id   uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  rubric_id int  NOT NULL REFERENCES kid_rubrics(id) ON DELETE CASCADE,
  PRIMARY KEY (talk_id, rubric_id)
);
CREATE INDEX idx_talk_kid_rubrics_rubric ON talk_kid_rubrics(rubric_id);

-- Rubriques de départ (modifiables dans Admin → Rubriques Kids).
INSERT INTO kid_rubrics(slug, names, emoji, position) VALUES
 ('histoires',   '{"fr":"Histoires","en":"Stories","ar":"قصص"}', '📖', 10),
 ('prophetes',   '{"fr":"Les prophètes","en":"The prophets","ar":"الأنبياء"}', '🌙', 20),
 ('valeurs',     '{"fr":"Valeurs et bonne conduite","en":"Values and good manners","ar":"القيم وحسن الخلق"}', '🤝', 30),
 ('coran',       '{"fr":"Coran et invocations","en":"Quran and supplications","ar":"القرآن والأدعية"}', '🕌', 40),
 ('sciences',    '{"fr":"Sciences et nature","en":"Science and nature","ar":"العلوم والطبيعة"}', '🔬', 50),
 ('chants',      '{"fr":"Chants et comptines","en":"Songs and rhymes","ar":"أناشيد وأغاني"}', '🎵', 60),
 ('jeux',        '{"fr":"Jeux et créativité","en":"Games and creativity","ar":"ألعاب وإبداع"}', '🎨', 70),
 ('arabe',       '{"fr":"Apprendre l''arabe","en":"Learning Arabic","ar":"تعلّم العربية"}', '✏️', 80);
