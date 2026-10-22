-- Étape 22b-5 : versions de l'application (APK proposé à l'installation) et mises à jour de son contenu (protocole expo-updates).
CREATE TABLE IF NOT EXISTS app_releases (
  version_code  integer PRIMARY KEY,                 -- numéro de build Android : toujours croissant
  platform      text NOT NULL DEFAULT 'android',
  version       text NOT NULL,                       -- ex. 0.5.0
  size          bigint NOT NULL,
  sha256        text NOT NULL,                       -- empreinte hexadécimale du fichier APK
  notes         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { fr, en, ar } : nouveautés
  apk_key       text NOT NULL,
  published_at  timestamptz,                         -- null tant que l'envoi n'est pas terminé
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_updates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform         text NOT NULL DEFAULT 'android',
  runtime_version  text NOT NULL,
  kind             text NOT NULL DEFAULT 'update' CHECK (kind IN ('update', 'rollback')),  -- rollback : revenir au contenu intégré à l'APK
  bundle           jsonb,                            -- { launchAsset: {sha256}, assets: [{sha256, key, contentType, fileExtension}], expoClient }
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_updates_lookup_idx ON app_updates(platform, runtime_version, created_at DESC);
