-- Étape 10.1 : nom définitif « Mejliss TV ». Le nom enregistré dans le back-office prime sur la variable APP_NAME :
-- on remplace l'ancien nom provisoire (s'il a été enregistré) et on enregistre le nouveau sinon.
INSERT INTO app_settings (key, value, is_secret) VALUES ('app_name', 'Mejliss TV', false)
ON CONFLICT (key) DO UPDATE SET value = 'Mejliss TV', updated_at = now()
  WHERE app_settings.value ILIKE 'majlis%' OR app_settings.value ILIKE 'majliss%';
