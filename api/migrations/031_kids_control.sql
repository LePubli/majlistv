-- Étape 26.3 : contrôle parental — durée quotidienne, catalogue autorisé, rapport de progression.

-- Réglages propres à chaque enfant. NULL = pas de limite. Catalogue : « all » = tout le catalogue Kids de son âge sauf ce que le parent bloque ;
-- « selected » = seulement ce que le parent a autorisé.
ALTER TABLE kid_profiles ADD COLUMN daily_limit_min integer CHECK (daily_limit_min BETWEEN 5 AND 480);
ALTER TABLE kid_profiles ADD COLUMN catalog_mode text NOT NULL DEFAULT 'all' CHECK (catalog_mode IN ('all', 'selected'));

CREATE TABLE kid_catalog (
  profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  talk_id    uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  allowed    boolean NOT NULL,
  PRIMARY KEY (profile_id, talk_id)
);

-- Temps passé dans l'espace enfant, par jour (heure de Paris). Calculé par le serveur à partir des « pings » de la page :
-- l'enfant ne peut pas gonfler ni réduire son temps en envoyant de fausses durées.
CREATE TABLE kid_usage (
  profile_id uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  seconds    integer NOT NULL DEFAULT 0,
  last_ping  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, day)
);

-- Rapport hebdomadaire envoyé au parent (désactivable), une seule fois par jour au plus.
ALTER TABLE users ADD COLUMN kids_report_email boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN kids_report_last date;
