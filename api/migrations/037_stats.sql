-- Étape 18 : statistiques d'audience INTERNES et ANONYMES (aucun cookie, aucune adresse IP, aucun identifiant de personne).
-- Seuls des compteurs par jour sont conservés. Les « empreintes du jour » servent uniquement à compter une personne une seule
-- fois dans la journée : elles sont calculées avec une clé secrète du serveur et supprimées au bout de 2 jours.
-- Les jours sont ceux de l'heure de Paris. audience = 'web' (site) ou 'kids' (espace enfant).

-- Compteurs du site entier. dim = 'all' (totaux), 'source', 'referrer', 'device', 'lang', 'country' ; value = la valeur de la dimension.
CREATE TABLE stat_dim_daily (
  day      date    NOT NULL,
  audience text    NOT NULL CHECK (audience IN ('web', 'kids')),
  dim      text    NOT NULL,
  value    text    NOT NULL DEFAULT '',
  views    integer NOT NULL DEFAULT 0,   -- pages vues
  visitors integer NOT NULL DEFAULT 0,   -- visiteurs du jour (comptés une fois)
  PRIMARY KEY (day, audience, dim, value)
);

-- Compteurs par conférence et par jour.
CREATE TABLE stat_talk_daily (
  day       date    NOT NULL,
  talk_id   uuid    NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  audience  text    NOT NULL CHECK (audience IN ('web', 'kids')),
  views     integer NOT NULL DEFAULT 0,   -- page de la conférence ouverte
  viewers   integer NOT NULL DEFAULT 0,   -- spectateurs du jour (comptés une fois)
  plays     integer NOT NULL DEFAULT 0,   -- lectures lancées
  seconds   bigint  NOT NULL DEFAULT 0,   -- temps réellement regardé
  q25       integer NOT NULL DEFAULT 0,   -- lectures arrivées à 25 %, 50 %, 75 %
  q50       integer NOT NULL DEFAULT 0,
  q75       integer NOT NULL DEFAULT 0,
  completes integer NOT NULL DEFAULT 0,   -- lectures terminées
  PRIMARY KEY (day, talk_id, audience)
);
CREATE INDEX idx_stat_talk_talk ON stat_talk_daily(talk_id, day);

-- Provenance / appareil / langue des ouvertures d'une conférence (pour l'organisateur). Web uniquement.
CREATE TABLE stat_talk_dim_daily (
  day     date    NOT NULL,
  talk_id uuid    NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  dim     text    NOT NULL,
  value   text    NOT NULL,
  views   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, talk_id, dim, value)
);

-- Empreintes du jour (voir plus haut) : supprimées automatiquement après 2 jours.
CREATE TABLE stat_seen (
  day  date NOT NULL,
  kind text NOT NULL,
  h    text NOT NULL,
  PRIMARY KEY (day, kind, h)
);
