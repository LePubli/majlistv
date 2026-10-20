-- Chaînes riches + plusieurs chaînes par personne (validé par Epok le 20/10).
-- Aucune donnée supprimée ni déplacée : uniquement des colonnes (toutes avec valeur par défaut) et une table d'équipe.
-- Le propriétaire (speakers.owner_id) ne change pas : c'est lui qui reçoit les revenus (module Revenus). Les « éditeurs » ajoutés
-- ci-dessous peuvent seulement modifier la page de la chaîne (nom, présentation, images, liens), pas les revenus ni l'équipe.
-- Une vidéo n'est JAMAIS obligée d'avoir une chaîne : talks.speaker reste facultatif.
ALTER TABLE speakers
  ADD COLUMN tagline          text NOT NULL DEFAULT '',   -- phrase d'accroche (100 caractères max côté API)
  ADD COLUMN website          text NOT NULL DEFAULT '',   -- https://… (vide = aucun)
  ADD COLUMN contact_email    text NOT NULL DEFAULT '',   -- affiché publiquement si renseigné
  ADD COLUMN socials          jsonb NOT NULL DEFAULT '{}'::jsonb, -- { youtube, instagram, x, facebook, tiktok } : adresses https
  ADD COLUMN country          text NOT NULL DEFAULT '',   -- libre (ex. « France »)
  ADD COLUMN main_language    text NOT NULL DEFAULT '',   -- fr / en / ar … (vide = non précisé)
  ADD COLUMN featured_talk_id uuid REFERENCES talks(id) ON DELETE SET NULL, -- conférence à la une
  ADD COLUMN key_name         text NOT NULL DEFAULT '',   -- graphie à saisir sur une conférence pour la rattacher à la chaîne (vide = déduite)
  ADD COLUMN created_by       uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE channel_members (
  slug       text NOT NULL REFERENCES speakers(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor')),
  added_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, user_id)
);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);
