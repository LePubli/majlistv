-- Étape D3b : voix de synthèse (fabriquées avec Voicebox, aucune personne réelle) : pas de consentement à saisir.
-- Le drapeau « synthetic » est posé par l'administrateur à l'ajout ; qui l'a posé et quand reste enregistré (consent_recorded_by / _at).
ALTER TABLE dub_voices ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false;

-- Remplace la contrainte « une voix cible a un consentement » (nom automatique : on la retrouve par son contenu).
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'dub_voices'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%consent_date%'
  LOOP
    EXECUTE format('ALTER TABLE dub_voices DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE dub_voices ADD CONSTRAINT dub_voices_target_ok
  CHECK (kind <> 'target' OR (sample_key IS NOT NULL AND (synthetic OR (consent_date IS NOT NULL AND consent_by IS NOT NULL))));
-- Une voix de base n'est jamais « synthétique » au sens du consentement.
ALTER TABLE dub_voices ADD CONSTRAINT dub_voices_synth_target CHECK (NOT synthetic OR kind = 'target');
