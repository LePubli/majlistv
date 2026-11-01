// Lecture en 30 jours : jour du programme (heure de Paris), juz du jour, rappel quotidien.
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { anyPushChannel, pushToUser } from '../../push.js';
import { parisDay } from '../../parisTime.js';
import { JUZS } from '../quran/juz.js';
import { suraOf } from '../quran/suras.js';

export const DAYS = 30;
// Instant courant ; PLAN_NOW (date ISO) ne sert qu'aux tests.
export const nowDate = () => (process.env.PLAN_NOW ? new Date(process.env.PLAN_NOW) : new Date());
export const today = (now = nowDate()) => parisDay(now).date;
// Jour du programme : 1 le jour du début ; peut dépasser 30 (programme en retard) ; 0 ou moins = pas encore commencé.
export const dayOf = (startedOn, day) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${startedOn}T12:00:00Z`)) / 86400000) + 1;

const named = (p) => ({ ...p, name: suraOf(p.sura).en, ar: suraOf(p.sura).ar });
export const juzList = () => JUZS.map((j) => ({ n: j.n, start: named(j.start), end: named(j.end) }));

export async function planOf(userId, now = nowDate()) {
  const p = (await pool.query("SELECT to_char(started_on, 'YYYY-MM-DD') AS started_on, remind_hour, completed_count FROM quran_plans WHERE user_id = $1", [userId])).rows[0];
  if (!p) return null;
  const reads = (await pool.query('SELECT juz FROM quran_plan_reads WHERE user_id = $1 ORDER BY juz', [userId])).rows.map((r) => r.juz);
  const day = dayOf(p.started_on, today(now));
  return {
    startedOn: p.started_on, day, todayJuz: day >= 1 && day <= DAYS ? day : null, reads, remindHour: p.remind_hour,
    completed: p.completed_count, finished: reads.length === DAYS,
  };
}

// Rappel : à partir de l'heure choisie (Paris), une fois par jour, pendant les 30 jours, si le juz du jour n'est pas coché ;
// jamais plus de 3 h après l'heure choisie ; aux membres qui ont activé les notifications.
export async function runPlan(log, now = nowDate(), { send = pushToUser, hasChannel = anyPushChannel } = {}) {
  if (!(await featureOn('quranplan')) || !(await featureOn('quran'))) return 0;
  if (!(await hasChannel())) return 0;
  const d = parisDay(now);
  const { rows } = await pool.query(
    `SELECT p.user_id, to_char(p.started_on, 'YYYY-MM-DD') AS started_on FROM quran_plans p JOIN users u ON u.id = p.user_id
      WHERE p.remind_hour IS NOT NULL AND p.remind_hour <= $1 AND $1 < p.remind_hour + 3
        AND p.last_reminded_on IS DISTINCT FROM $2::date AND u.notify_push AND u.disabled_at IS NULL`, [d.hour, d.date]);
  let n = 0;
  for (const r of rows) {
    const juz = dayOf(r.started_on, d.date);
    if (juz < 1 || juz > DAYS) continue;
    const claim = await pool.query('UPDATE quran_plans SET last_reminded_on = $2 WHERE user_id = $1 AND last_reminded_on IS DISTINCT FROM $2::date RETURNING user_id', [r.user_id, d.date]);
    if (!claim.rowCount) continue;
    if ((await pool.query('SELECT 1 FROM quran_plan_reads WHERE user_id = $1 AND juz = $2', [r.user_id, juz])).rowCount) continue;
    const j = JUZS[juz - 1];
    n += (await send(r.user_id, 'quranplan', { juz, sura: suraOf(j.start.sura).en, aya: j.start.aya }, `/coran/${j.start.sura}#v${j.start.aya}`, log)) > 0 ? 1 : 0;
  }
  if (n) log?.info(`Lecture en 30 jours : ${n} rappel(s) envoyé(s).`);
  return n;
}

export function startPlan(log, everyMs = 15 * 60 * 1000) {
  const tick = () => runPlan(log).catch((err) => log?.warn(`Lecture en 30 jours : ${err.message}`));
  setTimeout(tick, 60000);
  return setInterval(tick, everyMs);
}
