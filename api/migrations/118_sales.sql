-- Étape C-1 : vidéos et contenus Audyn payants à l'unité (achat définitif et/ou location), en plus de l'abonnement.
-- sale_offers : un contenu mis en vente (prix d'achat et/ou de location, réduction pour les abonnés).
-- sale_purchases : achats et locations (en attente → payé → remboursé).
-- Tant qu'un contenu est en vente, son accès reste « réservé » (premium pour une vidéo, « Apprentissage » pour Audyn) : ainsi aucune
-- règle « accès libre » existante ne peut l'ouvrir. L'ancien accès est gardé et remis quand le contenu est retiré de la vente.

CREATE TABLE sale_offers (
  kind                text NOT NULL CHECK (kind IN ('talk', 'audyn')),
  item_id             uuid NOT NULL,
  buy_cents           int CHECK (buy_cents IS NULL OR buy_cents BETWEEN 50 AND 50000),
  rent_cents          int CHECK (rent_cents IS NULL OR rent_cents BETWEEN 50 AND 50000),
  rent_hours          int NOT NULL DEFAULT 48 CHECK (rent_hours BETWEEN 1 AND 720),
  member_discount_pct int NOT NULL DEFAULT 0 CHECK (member_discount_pct BETWEEN 0 AND 90),
  prev_access         text NOT NULL,
  updated_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, item_id),
  CHECK (buy_cents IS NOT NULL OR rent_cents IS NOT NULL)
);

CREATE TABLE sale_purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  email            text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('talk', 'audyn')),
  item_id          uuid NOT NULL,
  title            text NOT NULL,
  mode             text NOT NULL CHECK (mode IN ('buy', 'rent')),
  amount           int NOT NULL CHECK (amount >= 0),
  currency         text NOT NULL,
  member_price     boolean NOT NULL DEFAULT false,
  rent_hours       int,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  stripe_session_id text UNIQUE,
  stripe_payment_intent text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  expires_at       timestamptz,          -- location : fin de l'accès (paiement + durée) ; achat : vide
  refunded_at      timestamptz
);
CREATE INDEX idx_sale_purchases_owner ON sale_purchases(user_id, kind, item_id) WHERE status = 'paid';
CREATE INDEX idx_sale_purchases_pi ON sale_purchases(stripe_payment_intent);
CREATE INDEX idx_sale_purchases_created ON sale_purchases(created_at DESC);

-- Accès forcé tant que le contenu est en vente (toutes les écritures : Studio, séries, imports, actions groupées).
CREATE FUNCTION sale_force_talk_access() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sale_offers WHERE kind = 'talk' AND item_id = NEW.id) THEN NEW.access := 'premium'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sale_talk_access BEFORE INSERT OR UPDATE OF access ON talks FOR EACH ROW EXECUTE FUNCTION sale_force_talk_access();

CREATE FUNCTION sale_force_audyn_access() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sale_offers WHERE kind = 'audyn' AND item_id = NEW.id) THEN NEW.access := 'learning'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
-- audyn_items est créée par le module Audyn : le déclencheur n'est posé que si la table existe déjà (sinon : le module le pose).
DO $$ BEGIN
  IF to_regclass('public.audyn_items') IS NOT NULL THEN
    EXECUTE 'CREATE TRIGGER trg_sale_audyn_access BEFORE INSERT OR UPDATE OF access ON audyn_items FOR EACH ROW EXECUTE FUNCTION sale_force_audyn_access()';
  END IF;
END $$;
