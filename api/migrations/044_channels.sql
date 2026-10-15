-- Étape C : chaînes. Une chaîne = l'ancienne page « intervenant » (même adresse stable, même présentation), désormais avec un nom
-- modifiable et un PROPRIÉTAIRE (un organisateur). Aucune donnée n'est déplacée : la table speakers devient le registre des chaînes.
-- Les lignes manquantes sont créées au démarrage et toutes les 10 minutes (api/src/channels.js) à partir des conférences existantes.
ALTER TABLE speakers
  ADD COLUMN name       text NOT NULL DEFAULT '',   -- nom affiché ; vide = graphie la plus fréquente sur les conférences
  ADD COLUMN owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN owner_locked boolean NOT NULL DEFAULT false, -- vrai dès qu'un modérateur/administrateur a décidé du propriétaire (même « aucun ») : la synchronisation n'y touche plus
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX idx_speakers_owner ON speakers(owner_id) WHERE owner_id IS NOT NULL;
