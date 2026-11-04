// Série de jours et objectif de la semaine (palier « Apprentissage »).
// Jour actif (fuseau Europe/Paris) : au moins une vidéo regardée jusqu'à 1 minute, un quiz, une révision espacée ou une carte mémoire.
// Série = jours actifs consécutifs. Un jour sans activité par semaine (lundi → dimanche) est pardonné et ne casse pas la série.
// Aujourd'hui ne casse jamais la série : la journée n'est pas finie. Aucun badge pour les adultes (décision d'Epok, 04/11).
import { pool } from './db.js';

const DAY = 86400000;
export const TZ = 'Europe/Paris';
export const GOAL_DEFAULT = 3;
export const WATCH_MIN_MS = 60_000;

const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => iso(ms(d) + n * DAY);
/** Lundi de la semaine qui contient le jour (semaine lundi → dimanche). */
export const mondayOf = (d) => { const wd = new Date(ms(d)).getUTCDay(); return addDays(d, -((wd + 6) % 7)); };

/**
 * Série actuelle et meilleure série, à partir de l'ensemble des jours actifs ('YYYY-MM-DD').
 * Parcours du premier jour actif jusqu'à aujourd'hui ; un jour manqué est pardonné s'il est le premier de sa semaine ; sinon la série retombe à zéro.
 */
export function streakOf(activeDays, today) {
  const set = activeDays instanceof Set ? activeDays : new Set(activeDays);
  const first = [...set].filter((d) => d <= today).sort()[0];
  if (!first) return { current: 0, best: 0, activeToday: false, graceUsedThisWeek: false };
  let cur = 0; let best = 0; let graceWeek = null; // semaine (lundi) dont le jour de repos est déjà consommé
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (set.has(d)) { cur += 1; if (cur > best) best = cur; continue; }
    if (d === today) continue; // la journée n'est pas finie
    const wk = mondayOf(d);
    if (cur > 0 && graceWeek !== wk) graceWeek = wk; // jour de repos pardonné
    else cur = 0;
  }
  return { current: cur, best, activeToday: set.has(today), graceUsedThisWeek: graceWeek === mondayOf(today) };
}

/** Les 7 jours de la semaine en cours (lundi → dimanche) et l'avancement vers l'objectif. */
export function weekOf(activeDays, today, goal = GOAL_DEFAULT) {
  const set = activeDays instanceof Set ? activeDays : new Set(activeDays);
  const start = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, active: set.has(date), today: date === today, future: date > today }; });
  const done = days.filter((d) => d.active).length;
  return { start, days, done, goal, reached: done >= goal };
}

/** Aujourd'hui (Europe/Paris) au format 'YYYY-MM-DD'. */
export async function parisToday(db = pool) {
  return (await db.query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`, [TZ])).rows[0].d;
}

/** Jours actifs d'un membre (au plus 400 derniers jours). */
export async function activeDaysOf(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT DISTINCT to_char(d, 'YYYY-MM-DD') AS day FROM (
       SELECT (updated_at AT TIME ZONE $2)::date AS d FROM watch_progress WHERE user_id = $1 AND position_ms >= $3
       UNION ALL SELECT (created_at AT TIME ZONE $2)::date FROM quiz_attempts WHERE user_id = $1
       UNION ALL SELECT (updated_at AT TIME ZONE $2)::date FROM revision_items WHERE user_id = $1 AND reviews > 0
       UNION ALL SELECT last_on FROM memory_card_progress WHERE user_id = $1
     ) x WHERE d >= ((now() AT TIME ZONE $2)::date - 400)`, [userId, TZ, WATCH_MIN_MS]);
  return new Set(rows.map((r) => r.day));
}

export async function goalOf(userId, db = pool) {
  const r = (await db.query('SELECT weekly_goal, show FROM learning_goals WHERE user_id = $1', [userId])).rows[0];
  return { goal: r ? r.weekly_goal : GOAL_DEFAULT, show: r ? r.show : true };
}

/** Réponse complète de GET /me/learning/streak. */
export async function streakSummary(userId, db = pool) {
  const [days, today, g] = await Promise.all([activeDaysOf(userId, db), parisToday(db), goalOf(userId, db)]);
  const s = streakOf(days, today);
  return { show: g.show, ...s, atRisk: s.current > 0 && !s.activeToday, week: weekOf(days, today, g.goal) };
}
