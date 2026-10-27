-- Étape 33 : e-mails automatiques de cycle de vie (reprise de conférence, « par où commencer », retour après abonnement terminé).
-- notify_lifecycle : préférence du membre (activée par défaut ; l'envoi global reste désactivé tant que l'admin ne l'active pas).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_lifecycle boolean NOT NULL DEFAULT true;

-- Journal des envois : un même e-mail n'est jamais envoyé deux fois (kind + ref), et sert à espacer les messages d'un même membre.
CREATE TABLE IF NOT EXISTS lifecycle_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,            -- resume_talk | welcome_nudge | winback
  ref        text NOT NULL,            -- conférence, 'once' ou abonnement concerné
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_user ON lifecycle_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_day ON lifecycle_log(created_at DESC);
