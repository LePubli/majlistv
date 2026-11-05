-- Amélioration 7.1 : entonnoir et cohortes. « Mois d'activité » d'un compte : une ligne (compte, mois) dès que le membre se sert du site ou de l'application
-- ce mois-là. Aucune autre donnée (ni jour, ni page, ni appareil). Supprimé avec le compte, inclus dans l'export RGPD, conservé ~26 mois.
-- Sert uniquement aux tableaux de cohortes de l'administrateur (Admin → Statistiques → Croissance).
CREATE TABLE IF NOT EXISTS user_activity_month (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month   date NOT NULL CHECK (month = date_trunc('month', month)::date),
  PRIMARY KEY (user_id, month)
);
CREATE INDEX IF NOT EXISTS idx_user_activity_month ON user_activity_month(month);

-- Passé reconstitué (estimation, sous-estimée) : mois d'inscription, puis quiz, notes, favoris, questions, engagements et dernière lecture datés.
-- Chaque source n'est lue que si sa table existe.
DO $$
DECLARE s record;
BEGIN
  INSERT INTO user_activity_month(user_id, month)
    SELECT id, date_trunc('month', created_at AT TIME ZONE 'Europe/Paris')::date FROM users ON CONFLICT DO NOTHING;
  FOR s IN SELECT * FROM (VALUES ('quiz_attempts', 'created_at'), ('talk_notes', 'created_at'), ('favorites', 'created_at'), ('ask_log', 'created_at'),
                                 ('practice_commitments', 'created_at'), ('watch_progress', 'updated_at')) AS v(t, c)
  LOOP
    IF to_regclass('public.' || s.t) IS NOT NULL THEN
      EXECUTE format('INSERT INTO user_activity_month(user_id, month) SELECT DISTINCT user_id, date_trunc(''month'', %I AT TIME ZONE ''Europe/Paris'')::date FROM %I WHERE user_id IS NOT NULL ON CONFLICT DO NOTHING', s.c, s.t);
    END IF;
  END LOOP;
END $$;
