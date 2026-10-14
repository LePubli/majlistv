-- Étape 31 : thèmes « Du savoir à l'action ».
-- 1. Étiquettes de thèmes posées par l'organisateur sur ses conférences (3 au maximum, contrôlé par l'API).
--    Les thèmes eux-mêmes (Q1…, D1…, A1…) vivent dans api/src/themesTazkiya.json ; ici seul l'identifiant est stocké.
CREATE TABLE talk_themes (
  talk_id  uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  theme_id text NOT NULL CHECK (theme_id ~ '^[QDA][0-9]{1,2}$'),
  PRIMARY KEY (talk_id, theme_id)
);
CREATE INDEX idx_talk_themes_theme ON talk_themes(theme_id);

-- 2. Un engagement peut être pris directement depuis la page d'un thème (sans conférence) : le thème est alors
--    conservé chiffré avec le reste (même clé PRACTICE_KEY), comme pour les objectifs.
ALTER TABLE practice_commitments ADD COLUMN theme_enc text NOT NULL DEFAULT '';
