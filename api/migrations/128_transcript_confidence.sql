-- Confiance de la reconnaissance vocale (Whisper) par phrase : exp(avg_logprob), de 0 (aucune confiance) à 1 (certain).
-- NULL = inconnue : sous-titres venus de YouTube / Vimeo / d'un fichier, traductions, transcriptions faites avant cette migration.
ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS confidence real CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- Dès qu'un humain (auteur, membre, doublage) modifie le texte d'une phrase, la confiance de la machine ne la concerne plus : on l'efface.
CREATE OR REPLACE FUNCTION transcript_segments_clear_confidence() RETURNS trigger AS $$
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text AND NEW.confidence IS NOT DISTINCT FROM OLD.confidence THEN
    NEW.confidence := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS transcript_segments_conf ON transcript_segments;
CREATE TRIGGER transcript_segments_conf BEFORE UPDATE OF text ON transcript_segments
  FOR EACH ROW EXECUTE FUNCTION transcript_segments_clear_confidence();
