-- Validation des shorts avant publication (réglage `shorts_review`, désactivé d'origine).
-- Nouveau statut « pending » (en attente de validation) ; le relecteur (modérateur ou administrateur) valide ou refuse avec un motif.
ALTER TABLE public_shorts DROP CONSTRAINT IF EXISTS public_shorts_status_check;
ALTER TABLE public_shorts ADD CONSTRAINT public_shorts_status_check CHECK (status IN ('draft', 'pending', 'published'));
ALTER TABLE public_shorts ADD COLUMN IF NOT EXISTS submitted_at timestamptz;                                   -- dernière demande de validation
ALTER TABLE public_shorts ADD COLUMN IF NOT EXISTS review_note  text;                                          -- motif du dernier refus (effacé à la nouvelle demande)
ALTER TABLE public_shorts ADD COLUMN IF NOT EXISTS reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public_shorts ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz;
CREATE INDEX IF NOT EXISTS public_shorts_pending ON public_shorts(submitted_at) WHERE status = 'pending';
