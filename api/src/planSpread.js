// Planning, étape 2 : répartition automatique des séances de révision avant une échéance (calcul pur, sans base de données).
// Chaque vidéo choisie reçoit 3 séances : « revoir la vidéo », puis « quiz », puis « quiz final » (dans cet ordre, du plus tôt au plus tard).
// Les jours d'étude dépendent du rythme : léger = 3 jours par semaine, normal = 4, intensif = 6. Les jours de repos sont évités.
// On étudie du jour de départ jusqu'à la VEILLE de l'échéance. Les séances sont étalées régulièrement sur les jours d'étude retenus.
import { addDays, mondayOf } from './learningStreak.js';

export const PACES = { light: 3, normal: 4, intense: 6 };
export const SESSIONS_PER_TALK = 3;
export const BUSY_PER_DAY = 3; // au-delà, on prévient le membre que la journée sera chargée

/** Choisit k indices bien répartis parmi n (n ≥ k ≥ 1). */
const spreadIdx = (n, k) => Array.from({ length: k }, (_, i) => Math.min(n - 1, Math.floor((i * n) / k + n / (2 * k))));

/** Jours d'étude entre `from` et `to` inclus : `perWeek` jours par semaine (lundi → dimanche), hors jours de repos. */
export function studyDays(from, to, perWeek, rest = new Set()) {
  if (from > to) return [];
  const all = []; for (let d = from; d <= to; d = addDays(d, 1)) all.push(d);
  const weeks = new Map();
  for (const d of all) { const w = mondayOf(d); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(d); }
  const out = [];
  for (const days of weeks.values()) {
    const free = days.filter((d) => !rest.has(d));
    const pool = free.length ? free : days; // semaine entièrement au repos : on ne bloque pas le membre
    const k = Math.min(perWeek, pool.length);
    for (const i of spreadIdx(pool.length, k)) out.push(pool[i]);
  }
  return [...new Set(out)].sort();
}

/**
 * Répartit les séances. Entrées : today, dueOn (au plus tôt demain), pace, talkIds (ordre conservé), rest (jours de repos).
 * Sortie : { items: [{ day, kind: 'video'|'quiz', talkId, phase: 1|2|3 }], days, perDayMax, busy } ou { error }.
 */
export function spread({ today, dueOn, pace, talkIds, rest = new Set() }) {
  if (!PACES[pace]) return { error: 'pace' };
  if (!talkIds.length) return { error: 'talks' };
  if (dueOn <= today) return { error: 'date' };
  const days = studyDays(today, addDays(dueOn, -1), PACES[pace], rest);
  if (!days.length) return { error: 'date' };
  const order = [];
  for (let phase = 1; phase <= SESSIONS_PER_TALK; phase += 1) for (const talkId of talkIds) order.push({ phase, talkId, kind: phase === 1 ? 'video' : 'quiz' });
  const items = order.map((s, j) => ({ ...s, day: days[Math.min(days.length - 1, Math.floor((j * days.length) / order.length))] }));
  const per = new Map(); for (const it of items) per.set(it.day, (per.get(it.day) || 0) + 1);
  const perDayMax = Math.max(...per.values());
  return { items, days: days.length, perDayMax, busy: perDayMax > BUSY_PER_DAY };
}
