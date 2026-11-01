// Athkar : dhikr publiés, compte du jour (heure de Paris), série de jours, rappel quotidien.
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { hasLearningTier } from '../../access.js';
import { anyPushChannel, pushToUser } from '../../push.js';
import { parisDay, prevDate } from '../../parisTime.js';

export const CATEGORIES = ['morning', 'evening', 'after_prayer', 'sleep', 'general'];
export const MAX_COUNT = 100000; // garde-fou par dhikr et par jour

// Instant courant ; ATHKAR_NOW (date ISO) ne sert qu'aux tests.
export const nowDate = () => (process.env.ATHKAR_NOW ? new Date(process.env.ATHKAR_NOW) : new Date());
export const today = (now = nowDate()) => parisDay(now).date;

// Dhikr montrés aux membres : activés ET validés.
export const published = async () => (await pool.query('SELECT * FROM athkar_items WHERE enabled AND reviewed_at IS NOT NULL ORDER BY position, id')).rows;

export async function prefsOf(userId) {
  const r = (await pool.query('SELECT daily_goal, remind_hour FROM athkar_prefs WHERE user_id = $1', [userId])).rows[0];
  return { goal: r?.daily_goal ?? 1, remindHour: r?.remind_hour ?? null };
}

// Nombre de dhikr terminés (compte ≥ objectif du dhikr) par jour, pour un membre, sur les dhikr publiés.
export async function doneByDay(userId, sinceDays = 400, now = nowDate()) {
  const { rows } = await pool.query(
    `SELECT to_char(c.day, 'YYYY-MM-DD') AS day, count(*)::int AS done
       FROM athkar_counts c JOIN athkar_items i ON i.id = c.item_id
      WHERE c.user_id = $1 AND i.enabled AND i.reviewed_at IS NOT NULL AND c.count >= i.target AND c.day > ($2::date - $3::int)
      GROUP BY c.day`, [userId, today(now), sinceDays]);
  return new Map(rows.map((r) => [r.day, r.done]));
}

// Série : jours consécutifs où l'objectif est atteint, en finissant aujourd'hui (ou hier si aujourd'hui n'est pas encore fait).
export function streakOf(byDay, goal, day) {
  let d = (byDay.get(day) || 0) >= goal ? day : prevDate(day);
  let n = 0;
  while ((byDay.get(d) || 0) >= goal) { n++; d = prevDate(d); }
  return n;
}

// Rappel quotidien : à partir de l'heure choisie (Paris), une fois par jour, seulement si l'objectif du jour n'est pas atteint,
// seulement aux membres de la formule Apprentissage qui ont activé les notifications ; pas de rappel plus de 3 h après l'heure choisie.
export async function runAthkar(log, now = nowDate(), { send = pushToUser, hasChannel = anyPushChannel, learning = hasLearningTier } = {}) {
  if (!(await featureOn('athkar'))) return 0;
  if (!(await hasChannel())) return 0;
  const day = parisDay(now);
  if (!(await published()).length) return 0;
  const { rows } = await pool.query(
    `SELECT p.user_id, p.daily_goal FROM athkar_prefs p JOIN users u ON u.id = p.user_id
      WHERE p.remind_hour IS NOT NULL AND p.remind_hour <= $1 AND $1 < p.remind_hour + 3
        AND p.last_reminded_on IS DISTINCT FROM $2::date AND u.notify_push AND u.disabled_at IS NULL`, [day.hour, day.date]);
  let n = 0;
  for (const r of rows) {
    const claim = await pool.query('UPDATE athkar_prefs SET last_reminded_on = $2 WHERE user_id = $1 AND last_reminded_on IS DISTINCT FROM $2::date RETURNING user_id', [r.user_id, day.date]);
    if (!claim.rowCount) continue;
    if (!(await learning(r.user_id))) continue;
    const done = (await doneByDay(r.user_id, 1, now)).get(day.date) || 0;
    if (done >= r.daily_goal) continue;
    n += (await send(r.user_id, 'athkar', { done, goal: r.daily_goal }, '/learning?tab=athkar', log)) > 0 ? 1 : 0;
  }
  if (n) log?.info(`Athkar : ${n} rappel(s) envoyé(s).`);
  return n;
}

export function startAthkar(log, everyMs = 15 * 60 * 1000) {
  const tick = () => runAthkar(log).catch((err) => log?.warn(`Athkar : ${err.message}`));
  setTimeout(tick, 55000);
  return setInterval(tick, everyMs);
}
