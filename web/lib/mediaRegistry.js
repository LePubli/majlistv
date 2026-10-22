// Lecteurs en cours de lecture (étape 23a) : la pause de prière doit pouvoir arrêter la vidéo où qu'elle soit.
// Les balises <video> / <audio> se trouvent dans la page ; les lecteurs YouTube / Vimeo (iframe) s'inscrivent ici.
const external = new Set();

export const registerMedia = (m) => { external.add(m); return () => external.delete(m); };

/** Médias que la personne regarde ou écoute : ni les aperçus muets des vignettes, ni les boucles d'ambiance. */
export function playingMedia(doc = typeof document !== 'undefined' ? document : null) {
  const out = [];
  if (doc) for (const el of doc.querySelectorAll('video, audio')) if (!el.paused && !el.ended && !el.muted && !el.loop) out.push(el);
  for (const m of external) if (m.paused === false && !m.muted) out.push(m);
  return out;
}
