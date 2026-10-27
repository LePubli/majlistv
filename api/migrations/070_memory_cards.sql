-- Étape 38 — Cartes mémoire : progression de chaque membre sur chaque carte.
-- Les cartes elles-mêmes ne sont PAS stockées : une carte = une question de quiz VALIDÉE par un humain (question → bonne réponse + explication + passage cité).
-- Elles restent donc toujours à jour (question corrigée ou retirée = carte corrigée ou retirée) et rien de nouveau ne doit être relu ni validé.
CREATE TABLE IF NOT EXISTS memory_card_progress (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  stage       integer NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),   -- réussites consécutives ; 5 = acquise
  due_on      date,                                                       -- NULL quand la carte est acquise
  seen        integer NOT NULL DEFAULT 0,
  known       integer NOT NULL DEFAULT 0,
  first_on    date NOT NULL,                                              -- jour de la première présentation (plafond de nouvelles cartes par jour)
  last_on     date NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS memory_card_due ON memory_card_progress (user_id, due_on) WHERE due_on IS NOT NULL;
