// Mon planning (Apprentissage) — fonctions pures de l'application (même logique que web/components/PlanningClient.js).
// Dates au format AAAA-MM-JJ ; calculs en UTC pour éviter tout décalage d'heure d'été.
import type { PlanAuto, PlanItem } from './types';

const DAY = 86400000;
const ms = (d: string): number => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number): string => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const mondayOf = (d: string): string => addDays(d, -((new Date(ms(d)).getUTCDay() + 6) % 7));
export const monthStart = (d: string): string => `${d.slice(0, 7)}-01`;
export function addMonths(d: string, n: number): string {
  const x = new Date(ms(monthStart(d))); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10);
}
export type PlanView = 'day' | 'week' | 'month';
/** Fenêtre de dates à charger pour une vue (mois : 6 semaines complètes, comme le site). */
export function windowOf(view: PlanView, cursor: string): { from: string; to: string } {
  if (view === 'day') return { from: cursor, to: cursor };
  if (view === 'week') { const m = mondayOf(cursor); return { from: m, to: addDays(m, 6) }; }
  const m = mondayOf(monthStart(cursor)); return { from: m, to: addDays(m, 41) };
}
/** Pas des flèches ‹ › selon la vue. */
export const stepCursor = (view: PlanView, cursor: string, n: number): string =>
  (view === 'day' ? addDays(cursor, n) : view === 'week' ? addDays(cursor, 7 * n) : addMonths(cursor, n));

export type DayBucket = { auto: PlanAuto[]; mine: PlanItem[] };
/** Regroupe révisions automatiques et séances du membre par jour. */
export function groupByDay(auto: PlanAuto[], items: PlanItem[]): Map<string, DayBucket> {
  const m = new Map<string, DayBucket>();
  const at = (d: string): DayBucket => { let b = m.get(d); if (!b) { b = { auto: [], mine: [] }; m.set(d, b); } return b; };
  for (const a of auto) at(a.day).auto.push(a);
  for (const i of items) at(i.day).mine.push(i);
  return m;
}
/** Nombre de choses à faire un jour donné (pastille). */
export const todoCount = (b: DayBucket | undefined): number => (b ? b.auto.filter((a) => !a.done).length + b.mine.filter((i) => !i.done).length : 0);
/** Onglet d'Apprendre ouvert par un type de séance (null = rien à ouvrir). */
export function sectionOfKind(kind: string): 'cards' | 'quran' | 'athkar' | 'commit' | 'bilan' | null {
  return ({ cards: 'cards', quran: 'quran', athkar: 'athkar', action: 'commit', bilan: 'bilan' } as const)[kind as 'cards'] ?? null;
}
/** Le jour peut-il recevoir une séance ? (aujourd'hui ou plus tard). */
export const canPlan = (day: string, today: string): boolean => day >= today;
