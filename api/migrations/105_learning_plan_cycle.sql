-- Planning de révisions : il couvre tout le cycle d'apprentissage, pas seulement les vidéos.
-- Nouveaux types de séance choisie : cartes mémoire, lecture du Coran, adhkar, mise en pratique, bilan personnel (sans vidéo liée).
-- On remplace les contrôles de la migration 104 (noms automatiques) par des contrôles nommés.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'learning_plan_items'::regclass AND contype = 'c' LOOP
    EXECUTE format('ALTER TABLE learning_plan_items DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE learning_plan_items
  ADD CONSTRAINT lpi_kind CHECK (kind IN ('video', 'quiz', 'custom', 'cards', 'quran', 'athkar', 'action', 'bilan')),
  ADD CONSTRAINT lpi_note_len CHECK (char_length(note) <= 120),
  ADD CONSTRAINT lpi_talk CHECK (kind NOT IN ('video', 'quiz') OR talk_id IS NOT NULL),
  ADD CONSTRAINT lpi_custom_note CHECK (kind <> 'custom' OR char_length(note) > 0);
