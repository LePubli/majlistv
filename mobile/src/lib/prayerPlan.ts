// Planning des rappels de prière : les horaires des prochains jours, prêts à être programmés dans le téléphone.
// Pur (sans appel natif) : testé avec Node (tests/prayer.test.ts).
import { buildSchedule } from './prayer/prayerLogic';
import { PRAYERS } from './prayer/prayerTimes';

type Prefs = Parameters<typeof buildSchedule>[1];
export type PlannedPrayer = { id: string; at: number; key: string };

const DAY = 86_400_000;
/** iOS accepte au plus 64 notifications programmées ; 7 jours × 5 prières = 35, de la marge pour les autres. */
export const PLAN_DAYS = 7;

/**
 * Les prières cochées des `days` prochains jours, dans l'ordre, sans doublon, toutes dans le futur.
 * L'application la reprogramme à chaque ouverture : le planning reste donc toujours plein tant qu'on l'ouvre au moins une fois par semaine.
 */
export function planPrayers(nowMs: number, prefs: Prefs, days = PLAN_DAYS): PlannedPrayer[] {
  const seen = new Map<string, PlannedPrayer>();
  for (let k = 0; k <= days; k += 1) {
    for (const p of buildSchedule(nowMs + k * DAY, prefs)) {
      if (!(PRAYERS as readonly string[]).includes(p.id) || !prefs.prayers[p.id] || p.at <= nowMs) continue;
      seen.set(`${p.id}@${Math.floor(p.at / 60_000)}`, { id: p.id, at: p.at, key: `${p.id}@${Math.floor(p.at / 60_000)}` });
    }
  }
  return [...seen.values()].sort((a, b) => a.at - b.at).slice(0, days * 5);
}
