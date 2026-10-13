-- Étape 24.1 : niveau de difficulté et prérequis.
-- Le niveau est choisi par l'organisateur sur une conférence et sur une série ; vide = « tous niveaux ».
-- Les prérequis relient une série aux séries conseillées avant elle (indicatif, jamais bloquant).
ALTER TABLE talks  ADD COLUMN level text CHECK (level IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE series ADD COLUMN level text CHECK (level IN ('beginner', 'intermediate', 'advanced'));
CREATE INDEX idx_talks_level ON talks(level) WHERE level IS NOT NULL;

CREATE TABLE series_prerequisites (
  series_id   uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  requires_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (series_id, requires_id),
  CHECK (series_id <> requires_id)
);
CREATE INDEX idx_prereq_requires ON series_prerequisites(requires_id);
