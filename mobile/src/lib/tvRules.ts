// Application TV — règles pures (sans React Native : testées avec Node, tests/tv.test.ts).

/** Code de connexion affiché en deux groupes lisibles de loin : « ABCD 2345 ». */
export const fmtTvCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code);

/** Écran de la télé vers lequel ramener un chemin de l'application téléphone (lien profond, notification) : /tv par défaut. */
export function tvRouteFor(segments: string[]): string | null {
  return segments[0] === 'tv' ? null : '/tv';
}

/** Rangées de l'accueil TV : « Continuer » d'abord, puis les rangées de l'accueil qui ont des vidéos (au plus `max`). */
export function tvRows<T extends { talks?: unknown[] | null; title?: string | null; key: string }>(rows: T[], max = 12): T[] {
  return rows.filter((r) => Array.isArray(r.talks) && r.talks.length > 0).slice(0, max);
}

/** Position de reprise (secondes) d'une vidéo pour le bouton « Reprendre » : rien sous 30 s ni dans les 30 dernières secondes. */
export function tvResumeSeconds(positionMs?: number | null, durationSeconds?: number | null): number {
  const p = Math.floor((positionMs || 0) / 1000);
  const d = durationSeconds || 0;
  if (p < 30) return 0;
  if (d && p > d - 30) return 0;
  return p;
}
