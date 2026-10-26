// Shorts de l'application (étape 24b) : fil vertical défilant. Logique pure (testée avec Node) : lecture sûre de la liste du serveur,
// ajout de la page suivante sans doublon, savoir s'il en reste à charger.
import type { Short } from './types';

/** Ne garde que les shorts lisibles (identifiant et vidéo présents) ; tout autre contenu est ignoré. */
export const playableList = (list: unknown): Short[] =>
  (Array.isArray(list) ? (list as Short[]) : []).filter((s) => s && typeof s.id === 'string' && typeof s.videoUrl === 'string' && s.videoUrl.length > 0 && s.talk && typeof s.talk.id === 'string');

/** Ajoute une page au fil, sans doublon (un short publié entre deux chargements décale les pages). */
export function mergeShorts(prev: Short[], next: Short[]): Short[] {
  const seen = new Set(prev.map((s) => s.id));
  return [...prev, ...next.filter((s) => !seen.has(s.id))];
}

/** Reste-t-il des shorts à charger ? Vrai tant que le serveur renvoie une page pleine. */
export const hasMore = (batchSize: number, limit: number): boolean => batchSize >= limit;

/** Part (0 à 1) de la barre de progression d'un short. */
export const shortRatio = (positionSec: number, durationSec: number): number =>
  durationSec > 0 && Number.isFinite(positionSec) ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;
