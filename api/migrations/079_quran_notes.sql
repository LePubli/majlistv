-- Étape 45B : notes de bas de page des traductions (la licence de QuranEnc impose de les conserver avec le texte).
ALTER TABLE quran_verses ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
