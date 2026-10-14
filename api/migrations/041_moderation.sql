-- Étape 20 : modération.
-- 1. Rôle « modérateur » : relit les conférences, traite les signalements. N'a aucun accès à l'administration du site.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'organizer', 'moderator', 'admin'));

-- 2. Organisateur « de confiance » : ses conférences sont publiées sans relecture, même quand la relecture est activée.
ALTER TABLE users ADD COLUMN trusted_publisher boolean NOT NULL DEFAULT false;

-- 3. Relecture des conférences : none = pas de relecture (cas habituel), pending = en attente, approved = validée, rejected = refusée
--    (ou retirée après signalement). Une conférence en attente ou refusée n'est visible que de son propriétaire et de l'équipe.
ALTER TABLE talks
  ADD COLUMN review_status text NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN review_note text NOT NULL DEFAULT '',
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_talks_review ON talks(review_status) WHERE review_status IN ('pending', 'rejected');

-- La relecture se déclenche toute seule, quel que soit le chemin (Studio, import en lot…) : quand une conférence passe de
-- « brouillon » à publiée / programmée, et que le réglage « review_required » est actif et que son propriétaire est un organisateur
-- qui n'est pas « de confiance », elle passe en attente. Une conférence refusée qu'on republie repasse aussi en attente.
CREATE FUNCTION talks_review_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE needs boolean;
BEGIN
  IF NEW.publication = 'draft' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.publication <> 'draft' THEN RETURN NEW; END IF;
  IF NEW.review_status = 'rejected' THEN
    NEW.review_status := 'pending'; NEW.submitted_at := now(); RETURN NEW;
  END IF;
  IF NEW.review_status <> 'none' THEN RETURN NEW; END IF;
  SELECT (u.role = 'organizer' AND NOT u.trusted_publisher) INTO needs FROM users u WHERE u.id = NEW.organizer_id;
  IF COALESCE(needs, false)
     AND COALESCE((SELECT lower(value) IN ('true', '1', 'on', 'yes') FROM app_settings WHERE key = 'review_required'), false) THEN
    NEW.review_status := 'pending'; NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER talks_review_gate_ins BEFORE INSERT ON talks FOR EACH ROW EXECUTE FUNCTION talks_review_gate();
CREATE TRIGGER talks_review_gate_upd BEFORE UPDATE OF publication ON talks FOR EACH ROW EXECUTE FUNCTION talks_review_gate();

-- 4. Signalements par les spectateurs.
CREATE TABLE content_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,      -- null : visiteur sans compte
  reason      text NOT NULL CHECK (reason IN ('copyright', 'inappropriate', 'misleading', 'doctrinal', 'technical', 'other')),
  details     text NOT NULL DEFAULT '' CHECK (length(details) <= 1000),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'resolved', 'actioned')),
  handled_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  handled_at  timestamptz,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_open ON content_reports(created_at DESC) WHERE status = 'open';
CREATE INDEX idx_reports_talk ON content_reports(talk_id, status);
CREATE UNIQUE INDEX idx_reports_once ON content_reports(talk_id, reporter_id) WHERE status = 'open' AND reporter_id IS NOT NULL;

-- 5. Journal des actions des administrateurs et modérateurs (qui a fait quoi). On ne stocke que les NOMS des champs modifiés,
--    jamais leurs valeurs (mots de passe, clés…). Aucune route ne modifie ni ne supprime une ligne.
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,                  -- copie du nom et du rôle au moment de l'action
  actor_role text NOT NULL,
  method     text NOT NULL,
  route      text NOT NULL,                  -- modèle de route, ex. PATCH /admin/users/:id
  target     text NOT NULL DEFAULT '',       -- identifiants dans l'adresse, ex. id=…
  fields     text[] NOT NULL DEFAULT '{}',   -- noms des champs envoyés
  summary    text NOT NULL DEFAULT '',       -- phrase lisible (décisions de modération)
  status     int NOT NULL
);
CREATE INDEX idx_audit_at ON audit_log(at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, at DESC);
