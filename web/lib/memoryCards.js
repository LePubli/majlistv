// Étape 38 — Cartes mémoire (site) : logique de séance, sans dépendance (testée avec Node).

/** Après une réponse : la carte sort de la file ; si elle est ratée, elle revient UNE fois en fin de file (jamais en boucle). */
export function requeue(queue, card, known, retried) {
  const rest = queue.slice(1);
  if (known || retried.has(card.id)) return { queue: rest, retried };
  const r = new Set(retried); r.add(card.id);
  return { queue: [...rest, card], retried: r };
}

/** Lien « revoir ce passage » : minute de la citation en secondes (au moins 5 s, sinon la vidéo s'ouvre au début). */
export function replayHref(card) {
  const sec = card.startMs != null ? Math.max(0, Math.floor(card.startMs / 1000) - 3) : 0;
  return `/talks/${card.talkId}${sec > 5 ? `?t=${sec}` : ''}`;
}
