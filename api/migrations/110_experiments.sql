-- Amélioration 7.2 (étape 1) : tests A/B. Un test = une zone du site (ex. bannière de l'accueil visiteur) + 2 ou 3 variantes.
CREATE TABLE experiments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  zone       text NOT NULL,
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'ended')),
  goal       text NOT NULL DEFAULT 'signup' CHECK (goal IN ('signup')),
  winner     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at   timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
-- Un seul test en cours par zone (sinon deux variantes se disputeraient le même texte).
CREATE UNIQUE INDEX experiments_one_running_per_zone ON experiments(zone) WHERE status = 'running';

-- Variantes : A = original (jamais modifié, config vide). config = { texts: { fr: { clé: texte }, en: {…}, ar: {…} } }.
CREATE TABLE experiment_variants (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (key IN ('A', 'B', 'C')),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  weight        int  NOT NULL DEFAULT 50 CHECK (weight BETWEEN 1 AND 100),
  config        jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (experiment_id, key)
);

-- Un visiteur = une ligne par test. `visitor_hash` = empreinte (sha256) de l'identifiant aléatoire gardé dans le navigateur : aucune donnée personnelle.
CREATE TABLE experiment_exposures (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  visitor_hash  text NOT NULL,
  variant       text NOT NULL,
  first_day     date NOT NULL DEFAULT current_date,
  clicked_at    timestamptz,
  converted_at  timestamptz,
  PRIMARY KEY (experiment_id, visitor_hash)
);
CREATE INDEX experiment_exposures_visitor ON experiment_exposures(visitor_hash);
