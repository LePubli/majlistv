-- Module « Doublage français », étape D2 : demandes de version française par les abonnés (prévenus par e-mail quand elle est prête).
CREATE TABLE dub_requests (
  talk_id     uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  PRIMARY KEY (talk_id, user_id)
);
CREATE INDEX dub_requests_pending ON dub_requests(talk_id) WHERE notified_at IS NULL;
