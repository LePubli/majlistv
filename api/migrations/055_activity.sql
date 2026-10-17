-- Étape S3 : Studio → Activité. Pause, priorité et plage horaire des tâches de fond.
-- Les services (worker, transcripteur, traducteur, doublage) et l'archivage de l'API consultent ces fonctions
-- au moment de prendre une tâche : rien n'est modifié dans les tables des tâches elles-mêmes.

CREATE TABLE IF NOT EXISTS activity_controls (
  queue      text NOT NULL CHECK (queue IN ('video', 'transcript', 'translation', 'dubbing', 'archive')),
  ref        text NOT NULL,                 -- identifiant de la tâche (conférence, conférence:langue, demande de doublage, archive)
  paused     boolean NOT NULL DEFAULT false,
  priority   integer NOT NULL DEFAULT 0,    -- plus grand = pris avant
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (queue, ref)
);

-- Valeur d'un réglage (Admin → Paramètres → Activité), ou valeur par défaut.
CREATE OR REPLACE FUNCTION activity_setting(k text, def text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT NULLIF(value, '') FROM app_settings WHERE key = k AND NOT is_secret), def)
$$;

-- Une tâche LOURDE (conversion vidéo, transcription, doublage complet) peut-elle démarrer maintenant ?
-- Non si « tâches lourdes en pause » ; sinon, si une plage horaire est activée, seulement pendant cette plage (heure de Paris).
-- Les autres files (traduction, archivage) ne sont jamais bloquées par la plage.
CREATE OR REPLACE FUNCTION activity_allows(q text) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  s int; e int; h int;
BEGIN
  IF q NOT IN ('video', 'transcript', 'dubbing') THEN RETURN true; END IF;
  IF lower(activity_setting('activity_pause_all', 'false')) IN ('true', 'on', '1', 'yes') THEN RETURN false; END IF;
  IF lower(activity_setting('activity_window_enabled', 'false')) NOT IN ('true', 'on', '1', 'yes') THEN RETURN true; END IF;
  s := activity_setting('activity_window_start', '22')::int;
  e := activity_setting('activity_window_end', '7')::int;
  h := extract(hour FROM now() AT TIME ZONE 'Europe/Paris')::int;
  IF s = e THEN RETURN true; END IF;
  IF s < e THEN RETURN h >= s AND h < e; END IF;
  RETURN h >= s OR h < e;   -- plage qui passe minuit (ex. 22 h - 7 h)
END
$$;

CREATE OR REPLACE FUNCTION activity_paused(q text, r text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM activity_controls WHERE queue = q AND ref = r AND paused)
$$;

CREATE OR REPLACE FUNCTION activity_priority(q text, r text) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT priority FROM activity_controls WHERE queue = q AND ref = r), 0)
$$;
