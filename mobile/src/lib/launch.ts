// Séquence de lancement (étape 26) : animation du logo, puis publicité éventuelle, puis l'application.
// Petit relais sans dépendance native : la publicité attend la fin de l'animation (qu'elle ait été jouée, passée ou ignorée).
let over = false;
let endedAt = 0;
const subs = new Set<() => void>();

export const introOver = (): boolean => over;
/** Instant (ms) où l'animation s'est terminée, 0 tant qu'elle ne l'est pas. */
export const introEndedAt = (): number => endedAt;

/** L'animation est terminée (ou n'aura pas lieu) : réveille ceux qui attendent. Sans effet la deuxième fois. */
export function endIntro(now: number = Date.now()): void {
  if (over) return;
  over = true; endedAt = now;
  for (const f of [...subs]) { try { f(); } catch { /* un abonné défaillant ne bloque pas les autres */ } }
  subs.clear();
}

/** Appelle f dès que l'animation est terminée (tout de suite si c'est déjà le cas). Renvoie la fonction qui annule l'attente. */
export function onIntroEnd(f: () => void): () => void {
  if (over) { f(); return () => {}; }
  subs.add(f);
  return () => { subs.delete(f); };
}

/** Pour les tests. */
export function resetLaunch(): void { over = false; endedAt = 0; subs.clear(); }
