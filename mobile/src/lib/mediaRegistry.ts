// Les lecteurs en cours (vidéo native, YouTube / Vimeo) s'inscrivent ici : l'écran de pause de la prière peut ainsi les mettre en pause
// puis les reprendre, sans connaître la fiche conférence. Même principe que web/lib/mediaRegistry.js.
export type MediaAdapter = { isPlaying: () => boolean; pause: () => void; play: () => void };

const adapters = new Set<MediaAdapter>();

/** Inscrit un lecteur ; renvoie la fonction qui le retire (à appeler au démontage). */
export function registerMedia(a: MediaAdapter): () => void {
  adapters.add(a);
  return () => { adapters.delete(a); };
}

/** Lecteurs qui jouent en ce moment (avec du son). */
export function playingMedia(): MediaAdapter[] {
  return [...adapters].filter((a) => { try { return a.isPlaying(); } catch { return false; } });
}
