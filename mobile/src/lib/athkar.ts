// Étape M3 — athkar, vendredi et saisons dans l'application (mêmes données que le site : étapes 45, 45C, 45D).
// Fonctions pures : testées avec Node (tests/athkar.test.ts).
import type { Card } from './types';
import type { Key } from './i18n';

export const ATHKAR_CATS = ['morning', 'evening', 'after_prayer', 'sleep', 'general'] as const;
export type AthkarCat = typeof ATHKAR_CATS[number];
export type AthkarItem = { id: number; category: AthkarCat | string; ar: string; translit: string; tr: string; reference: string; target: number; count: number };
export type AthkarResponse = { today: string; goal: number; remindHour: number | null; doneToday: number; streak: number; total: number; items: AthkarItem[] };

/** Moments présents dans la liste, dans l'ordre du site. */
export const catsPresent = (items: AthkarItem[]): AthkarCat[] => ATHKAR_CATS.filter((c) => items.some((i) => i.category === c));

/** Catégorie valide (lien ?cat=morning) ou '' (tous). */
export const pickCat = (v: unknown): AthkarCat | '' => (typeof v === 'string' && (ATHKAR_CATS as readonly string[]).includes(v) ? v as AthkarCat : '');

/** Un toucher : +1 sur ce dhikr (affichage immédiat, avant l'envoi au serveur). */
export const applyTap = (items: AthkarItem[], id: number): AthkarItem[] => items.map((x) => (x.id === id ? { ...x, count: x.count + 1 } : x));

/** Touchers rapprochés : on les additionne et on les envoie ensemble (au plus 1000 par envoi, comme l'API). */
export function addPending(pending: Map<number, number>, id: number): Map<number, number> {
  pending.set(id, Math.min(1000, (pending.get(id) || 0) + 1));
  return pending;
}

/** Le toucher qui atteint l'objectif d'un dhikr (pour le signaler). */
export const reachesTarget = (it: AthkarItem): boolean => it.count + 1 === it.target;

/** Objectif du jour saisi : entier de 1 à 100. */
export const clampGoal = (v: unknown): number => Math.min(100, Math.max(1, Math.round(Number(v)) || 1));

// --- Vendredi et saisons -----------------------------------------------------------------------------------------------
export type Friday = { active: false } | {
  active: true; date: string; kahf: { n: number; name: string; ready: boolean } | null; ghusl: string | null; salawat: string | null;
  collection: { id: string; title: string } | null; talks: Card[];
};
export type Season = {
  id: string; name: string; title: string; text: string; daysToStart: number; daysLeft: number; startsOn?: string; endsOn?: string;
  collection: { id: string; title: string } | null; talks: Card[]; theme: boolean;
} | null;

export const SEASON_ICON: Record<string, string> = { ramadan: '🌙', hajj: '🕋', mawlid: '✨', ashura: '🌅', eid_fitr: '🎉', rajab: '🌟', dhulqada: '🌟' };

type T = (key: Key, vars?: Record<string, string | number>) => string;
/** « Dans 3 jour(s) » / « Encore 5 jour(s) » / « Dernier jour ». */
export function seasonWhen(s: NonNullable<Season>, t: T): string {
  if (s.daysToStart > 0) return t('seasonIn', { n: s.daysToStart });
  return s.daysLeft === 0 ? t('seasonLast') : t('seasonLeft', { n: s.daysLeft });
}
