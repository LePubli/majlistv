-- Étape 24.4 : palier « Apprentissage » (score, badges, courbe, attestations de suivi).

-- Palier de l'abonnement : 'standard' (visionnage + quiz de fin de vidéo) ou 'learning' (Apprentissage).
-- Déterminé par le webhook Stripe d'après le prix souscrit.
ALTER TABLE subscriptions ADD COLUMN tier text NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'learning'));

-- Attestation de suivi d'une série (ce n'est ni un diplôme ni une ijâza) : délivrée quand tous les quiz de la série sont réussis.
-- Page publique vérifiable par son code ; le membre peut la supprimer à tout moment.
CREATE TABLE attestations (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code      text NOT NULL UNIQUE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  holder    text NOT NULL,                 -- nom affiché sur l'attestation (au moment de la délivrance)
  snapshot  jsonb NOT NULL DEFAULT '{}',   -- { seriesTitle, speaker, quizzes, average }
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, series_id)
);
