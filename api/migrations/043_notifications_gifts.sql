-- Étape 21 : suivi des intervenants, préférences d'e-mails, cartes cadeaux.

-- Intervenants suivis (un intervenant = son slug, comme sur sa page publique).
CREATE TABLE speaker_follows (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  speaker_slug text NOT NULL,
  speaker_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, speaker_slug)
);
CREATE INDEX idx_speaker_follows_slug ON speaker_follows(speaker_slug);

-- Préférences : alertes des intervenants suivis (activées : la personne a choisi de suivre) ; sélection de la semaine (à l'inscription volontaire).
ALTER TABLE users
  ADD COLUMN notify_speakers boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_weekly   boolean NOT NULL DEFAULT false,
  ADD COLUMN weekly_last_week date;

-- Une conférence est « annoncée » une seule fois aux abonnés de son intervenant. Les conférences déjà en ligne ne déclenchent rien.
ALTER TABLE talks ADD COLUMN announced_at timestamptz;
UPDATE talks SET announced_at = now();

-- Cartes cadeaux. Le code n'est révélé qu'une fois le paiement confirmé (statut « paid »).
CREATE TABLE gift_cards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,
  months                int  NOT NULL CHECK (months IN (1, 3, 12)),
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'redeemed', 'void')),
  source                text NOT NULL DEFAULT 'stripe' CHECK (source IN ('stripe', 'admin')),
  purchaser_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  purchaser_name        text,
  recipient_email       text,
  recipient_name        text,
  message               text,
  amount                int,            -- centimes
  currency              text,
  stripe_session_id     text UNIQUE,
  stripe_payment_intent text,
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  paid_at               timestamptz,
  redeemed_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at           timestamptz,
  voided_at             timestamptz,
  refunded_at           timestamptz
);
CREATE INDEX idx_gift_purchaser ON gift_cards(purchaser_id, created_at DESC);
CREATE INDEX idx_gift_status ON gift_cards(status, created_at DESC);
