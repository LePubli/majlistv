-- Étape 9 : paiement conforme, e-mails transactionnels, pages légales, mot de passe oublié.

-- Consentements horodatés (renonciation au droit de rétractation, acceptation des CGV).
-- Conservés même si le compte est supprimé (preuve), avec l'e-mail de l'époque.
CREATE TABLE consents (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  email       text NOT NULL,
  kind        text NOT NULL,          -- withdrawal_waiver | terms
  version     text NOT NULL,          -- version du texte accepté
  text        text NOT NULL,          -- texte exact affiché
  context     text,                   -- ex. formule choisie
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consents_user ON consents(user_id, created_at DESC);

-- Pages légales modifiables dans le back-office (texte simple : « ## » titre, « - » liste).
CREATE TABLE legal_pages (
  slug        text PRIMARY KEY,
  title       text NOT NULL,
  body        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL
);

-- File d'envoi des e-mails : un envoi par clé (dedupe_key), réessais espacés.
CREATE TABLE email_outbox (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  to_email    text NOT NULL,
  kind        text NOT NULL,
  locale      text NOT NULL DEFAULT 'fr',
  vars        jsonb NOT NULL DEFAULT '{}',   -- valeurs du modèle ; l'e-mail est mis en forme au moment de l'envoi
  subject     text,                           -- rempli à l'envoi (historique)
  dedupe_key  text UNIQUE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'expired')),
  attempts    int  NOT NULL DEFAULT 0,
  last_error  text,
  send_after  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX idx_outbox_queue ON email_outbox(send_after) WHERE status = 'pending';

-- Après un changement de mot de passe, les sessions ouvertes avant cette date sont refusées.
ALTER TABLE users ADD COLUMN sessions_valid_after timestamptz;

-- Mot de passe oublié : on ne stocke que l'empreinte du jeton.
CREATE TABLE password_resets (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);

INSERT INTO legal_pages(slug, title, body) VALUES
('mentions-legales', 'Mentions légales', $txt$Modèle à compléter et à faire relire. Remplacez chaque passage entre crochets.

## Éditeur du site
- Raison sociale : [RAISON SOCIALE]
- Forme juridique et capital : [FORME] au capital de [MONTANT] €
- Siège : [ADRESSE COMPLÈTE]
- SIRET : [NUMÉRO SIRET] · RCS : [VILLE ET NUMÉRO]
- TVA intracommunautaire : [NUMÉRO]
- Contact : [E-MAIL DE CONTACT]
- Directeur de la publication : [NOM]

## Hébergement
- Hébergeur : [NOM DE L'HÉBERGEUR]
- Adresse : [ADRESSE DE L'HÉBERGEUR]

## Propriété intellectuelle
Les conférences, textes, logos et éléments graphiques sont protégés. Toute reproduction ou diffusion sans autorisation écrite est interdite.

## Contenus
Les propos tenus dans les conférences n'engagent que leurs intervenants. Les transcriptions, traductions et résumés sont produits automatiquement et peuvent contenir des erreurs.$txt$),
('cgv', 'Conditions générales de vente et d''utilisation', $txt$Modèle à compléter et à faire relire par un professionnel du droit.

## Objet
Les présentes conditions encadrent l'utilisation du service [NOM DU SERVICE], édité par [RAISON SOCIALE], et la souscription aux abonnements donnant accès aux conférences premium.

## Compte
La création d'un compte est gratuite. Vous êtes responsable de la confidentialité de votre mot de passe. Un compte est strictement personnel.

## Abonnements et prix
- Formule mensuelle et formule annuelle, aux prix affichés sur la page Abonnement, toutes taxes comprises.
- Essai gratuit à la première souscription, une seule fois par compte, pour la durée indiquée au moment de l'inscription.
- Sans résiliation, l'abonnement se renouvelle automatiquement à la fin de chaque période, au prix en vigueur.
- Le paiement est traité par Stripe. Nous ne conservons aucune donnée de carte bancaire.

## Résiliation
Vous pouvez résilier à tout moment depuis Mon compte, rubrique Abonnement. La résiliation prend effet à la fin de la période en cours ; l'accès reste ouvert jusqu'à cette date. Une résiliation pendant l'essai gratuit n'entraîne aucun prélèvement.

## Droit de rétractation
Le service fournit un contenu numérique sans support matériel. Conformément à l'article L221-28 du Code de la consommation, en demandant l'accès immédiat au service et en renonçant expressément à votre droit de rétractation lors de la souscription, vous ne pouvez plus l'exercer une fois l'accès commencé. Votre accord est enregistré et horodaté.

## Disponibilité
Nous faisons nos meilleurs efforts pour assurer l'accès au service, sans garantie d'absence d'interruption (maintenance, incident).

## Médiation
En cas de litige, vous pouvez recourir gratuitement au médiateur de la consommation : [NOM ET COORDONNÉES DU MÉDIATEUR]. Plateforme européenne de règlement des litiges : https://ec.europa.eu/consumers/odr

## Droit applicable
Droit français. [À COMPLÉTER : juridiction compétente]$txt$),
('confidentialite', 'Politique de confidentialité', $txt$Modèle à compléter et à faire relire.

## Responsable du traitement
[RAISON SOCIALE], [ADRESSE]. Contact : [E-MAIL DE CONTACT].

## Données collectées
- Compte : nom, e-mail, mot de passe (stocké sous forme chiffrée irréversible), langue.
- Abonnement : statut et dates, identifiant client Stripe. Les données de carte bancaire sont traitées uniquement par Stripe.
- Utilisation : favoris, position de lecture, consentements horodatés.

## Finalités et bases légales
- Fournir le service et gérer l'abonnement (exécution du contrat).
- Envoyer les e-mails liés au compte et au paiement (exécution du contrat).
- Conserver la preuve des consentements et les factures (obligations légales).

## Durées de conservation
- Compte : tant qu'il est actif, puis suppression à votre demande ou après [DURÉE] d'inactivité.
- Factures et preuves de consentement : [DURÉE LÉGALE, en général 10 ans pour les pièces comptables].

## Destinataires
Stripe (paiement), [NOM DE L'HÉBERGEUR] (hébergement), [PRESTATAIRE D'E-MAIL] (envoi des e-mails). Les services d'intelligence artificielle utilisés pour la transcription, la traduction et les résumés traitent le contenu des conférences, pas vos données personnelles.

## Cookies
Le site n'utilise que des éléments techniques nécessaires : la langue choisie et votre session de connexion. Aucun cookie publicitaire ni de mesure d'audience tierce.

## Vos droits
Accès, rectification, effacement, portabilité, opposition et limitation : écrivez à [E-MAIL DE CONTACT]. Vous pouvez saisir la CNIL (www.cnil.fr).$txt$);
