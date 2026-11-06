// Récitation continue : règles pures (testées) du lecteur global du Coran.
// Un verset = un fichier audio chez la source ; on enchaîne d'un fichier à l'autre et on retente si un fichier échoue.

export const MAX_RETRY = 2; // nouvelles tentatives sur un même verset avant d'afficher l'erreur

/** Que faire quand un verset ne se charge pas : retenter (réseau capricieux, source qui limite) ou abandonner. */
export function afterError(retries: number): 'retry' | 'fail' {
  return retries < MAX_RETRY ? 'retry' : 'fail';
}

/** Attente avant la nouvelle tentative (ms) : 0,8 s puis 1,6 s. */
export function retryDelay(retries: number): number {
  return 800 * (retries + 1);
}

/** Titre affiché sur l'écran verrouillé / la notification. */
export function nowPlayingTitle(suraName: string, aya: number, verseWord: string): string {
  return `${suraName} — ${verseWord} ${aya}`;
}

/** Verset suivant dans la liste de la sourate (enchaînement activé), sinon null. */
export function followingAya(ayas: number[], current: number, chain: boolean): number | null {
  if (!chain) return null;
  return ayas.includes(current + 1) ? current + 1 : null;
}
