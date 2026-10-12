-- Étape 10.6 : chronologie du traitement d'une conférence (fiche de suivi du Studio).
-- Remplie automatiquement par des déclencheurs : aucun service (api, worker, transcriber, translator) n'a besoin de changer.
CREATE TABLE IF NOT EXISTS talk_events (
  id      bigserial PRIMARY KEY,
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  at      timestamptz NOT NULL DEFAULT now(),
  kind    text NOT NULL,        -- created | video | transcript | translation | insights | publication | edited
  lang    text,                 -- langue (translation, insights)
  status  text,                 -- pending | processing | ready | failed | draft | scheduled | published | edited…
  message text                  -- erreur éventuelle
);
CREATE INDEX IF NOT EXISTS idx_talk_events_talk ON talk_events(talk_id, at, id);

CREATE OR REPLACE FUNCTION talk_events_on_talks() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO talk_events(talk_id, kind, message) VALUES (NEW.id, 'created', NEW.source);
    IF NEW.video_status <> 'ready' THEN INSERT INTO talk_events(talk_id, kind, status) VALUES (NEW.id, 'video', NEW.video_status); END IF;
    IF NEW.transcript_status = 'pending' THEN INSERT INTO talk_events(talk_id, kind, status) VALUES (NEW.id, 'transcript', 'pending'); END IF;
    IF NEW.publication <> 'published' THEN INSERT INTO talk_events(talk_id, kind, status) VALUES (NEW.id, 'publication', NEW.publication); END IF;
    RETURN NEW;
  END IF;
  IF NEW.video_status IS DISTINCT FROM OLD.video_status THEN
    INSERT INTO talk_events(talk_id, kind, status, message) VALUES (NEW.id, 'video', NEW.video_status, left(NEW.video_error, 300));
  END IF;
  IF NEW.transcript_status IS DISTINCT FROM OLD.transcript_status THEN
    INSERT INTO talk_events(talk_id, kind, status, message) VALUES (NEW.id, 'transcript', NEW.transcript_status, left(NEW.transcript_error, 300));
  END IF;
  IF NEW.publication IS DISTINCT FROM OLD.publication THEN
    INSERT INTO talk_events(talk_id, kind, status, message) VALUES (NEW.id, 'publication', NEW.publication, to_char(NEW.publish_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;
  IF NEW.transcript_edited_at IS DISTINCT FROM OLD.transcript_edited_at THEN
    INSERT INTO talk_events(talk_id, kind, status) VALUES (NEW.id, 'edited', 'transcript');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_talk_events_talks ON talks;
CREATE TRIGGER trg_talk_events_talks AFTER INSERT OR UPDATE ON talks FOR EACH ROW EXECUTE FUNCTION talk_events_on_talks();

CREATE OR REPLACE FUNCTION talk_events_on_translations() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO talk_events(talk_id, kind, lang, status, message) VALUES (NEW.talk_id, 'translation', NEW.lang, NEW.status, left(NEW.error, 300));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_talk_events_translations ON transcript_translations;
CREATE TRIGGER trg_talk_events_translations AFTER INSERT OR UPDATE ON transcript_translations FOR EACH ROW EXECUTE FUNCTION talk_events_on_translations();

CREATE OR REPLACE FUNCTION talk_events_on_insights() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO talk_events(talk_id, kind, lang, status, message) VALUES (NEW.talk_id, 'insights', NEW.lang, NEW.status, left(NEW.error, 300));
  END IF;
  IF NEW.edited AND (TG_OP = 'INSERT' OR NOT OLD.edited) THEN
    INSERT INTO talk_events(talk_id, kind, lang, status) VALUES (NEW.talk_id, 'insights', NEW.lang, 'edited');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_talk_events_insights ON talk_insights;
CREATE TRIGGER trg_talk_events_insights AFTER INSERT OR UPDATE ON talk_insights FOR EACH ROW EXECUTE FUNCTION talk_events_on_insights();

-- Historique des conférences existantes : ce qu'on peut reconstituer avec les dates déjà connues.
INSERT INTO talk_events(talk_id, at, kind, message) SELECT id, created_at, 'created', source FROM talks;
INSERT INTO talk_events(talk_id, at, kind, lang, status, message)
  SELECT talk_id, updated_at, 'translation', lang, status, left(error, 300) FROM transcript_translations WHERE status IN ('ready', 'failed');
INSERT INTO talk_events(talk_id, at, kind, lang, status, message)
  SELECT talk_id, updated_at, 'insights', lang, status, left(error, 300) FROM talk_insights WHERE status IN ('ready', 'failed');
