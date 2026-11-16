// Page vidéo de l'application — étape N7 (16/11), comme le site (étape N6).
// Fonctions pures : testées avec Node (tests/talkFlow.test.ts).

export type TabKey = 'about' | 'notes' | 'ask';
/** Onglets sous le lecteur : À propos (résumé, chapitres, détails, transcription repliée) · Mes notes · Questions (assistant). */
export function talkTabs(o: { loggedIn: boolean; feat: (id: string) => boolean; locked: boolean; hasTracks: boolean }): TabKey[] {
  return [
    'about',
    ...(o.feat('notes') && !o.locked ? ['notes' as const] : []),
    ...(o.loggedIn && o.feat('ask') && !o.locked && o.hasTracks ? ['ask' as const] : []),
  ];
}
/** Ancien nom d'onglet (avant N7) → nouvel onglet. */
export const tabOf = (k: unknown): TabKey => (k === 'notes' ? 'notes' : k === 'ask' ? 'ask' : 'about');

export type EndStep = 'lock' | 'quiz' | 'practice' | 'next';
/** Fin de vidéo, toujours dans le même ordre : quiz (s'il n'est pas réussi) → « que faire maintenant ? » → épisode suivant.
 * Vidéo verrouillée (fin de l'aperçu) : seulement l'invitation. « Plus tard » passe à l'étape suivante. */
export function endSteps(o: { locked: boolean; quiz: boolean; quizPassed: boolean; practice: boolean; next: boolean }): EndStep[] {
  if (o.locked) return ['lock'];
  return [
    ...(o.quiz && !o.quizPassed ? ['quiz' as const] : []),
    ...(o.practice ? ['practice' as const] : []),
    ...(o.next ? ['next' as const] : []),
  ];
}
