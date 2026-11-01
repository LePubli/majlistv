// Circuit de Ramadan : jour du mois (calendrier hégirien, décalage réglé dans Admin → Paramètres → Saisons), actions publiées, rappel.
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { featureOn } from '../../features.js';
import { anyPushChannel, pushToUser } from '../../push.js';
import { hijriOf, seasonDef, seasonState } from '../../hijri.js';
import { parisDay } from '../../parisTime.js';

export const LANGS = ['fr', 'en', 'ar'];
export const lang = (l) => (LANGS.includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');
// Instant courant ; RAMADAN_NOW (date ISO) ne sert qu'aux tests.
export const nowDate = () => (process.env.RAMADAN_NOW ? new Date(process.env.RAMADAN_NOW) : new Date());
const offset = async () => Math.max(-2, Math.min(2, Math.round(await getNumber('hijri_offset_days')) || 0));

// { active, day (1-30, pendant Ramadan), hyear, startsOn, endsOn, daysToStart }
export async function ramadanStatus(now = nowDate()) {
  const off = await offset();
  const h = hijriOf(now, off);
  const st = seasonState(seasonDef('ramadan'), now, { lead: 0, offsetDays: off });
  if (h.month === 9) return { active: true, day: h.day, hyear: h.year, startsOn: st.startsOn, endsOn: st.endsOn, daysToStart: 0 };
  return { active: false, day: null, hyear: st.hijriYear ?? null, startsOn: st.startsOn ?? null, endsOn: st.endsOn ?? null, daysToStart: st.daysToStart ?? null };
}

// Actions montrées : activées ET validées.
export const publishedItems = async (audience = 'adult') => (await pool.query(
  'SELECT * FROM ramadan_items WHERE audience = $1 AND enabled AND reviewed_at IS NOT NULL ORDER BY day, position, id', [audience])).rows;
const pick = (r, k, l) => (r[`${k}_${l}`] || '').trim() || (r[`${k}_fr`] || '').trim();
export const publicItem = (r, l) => ({ id: r.id, day: r.day, title: pick(r, 'title', l), text: pick(r, 'text', l), link: r.link, reference: r.reference });

// Actions attendues un jour donné : celles du jour + celles de chaque jour.
export const itemsOfDay = (items, day) => items.filter((i) => i.day === day || i.day === 0);

// Rappel : pendant Ramadan, à partir de l'heure choisie (Paris), une fois par jour, si les actions du jour ne sont pas toutes cochées ;
// jamais plus de 3 h après l'heure choisie ; aux membres qui ont activé les notifications.
export async function runRamadan(log, now = nowDate(), { send = pushToUser, hasChannel = anyPushChannel } = {}) {
  if (!(await featureOn('ramadan'))) return 0;
  const st = await ramadanStatus(now);
  if (!st.active) return 0;
  if (!(await hasChannel())) return 0;
  const want = itemsOfDay(await publishedItems(), st.day).map((i) => i.id);
  if (!want.length) return 0;
  const d = parisDay(now);
  const { rows } = await pool.query(
    `SELECT p.user_id FROM ramadan_prefs p JOIN users u ON u.id = p.user_id
      WHERE p.remind_hour IS NOT NULL AND p.remind_hour <= $1 AND $1 < p.remind_hour + 3
        AND p.last_reminded_on IS DISTINCT FROM $2::date AND u.notify_push AND u.disabled_at IS NULL`, [d.hour, d.date]);
  let n = 0;
  for (const r of rows) {
    const claim = await pool.query('UPDATE ramadan_prefs SET last_reminded_on = $2 WHERE user_id = $1 AND last_reminded_on IS DISTINCT FROM $2::date RETURNING user_id', [r.user_id, d.date]);
    if (!claim.rowCount) continue;
    const done = (await pool.query('SELECT count(*)::int AS n FROM ramadan_marks WHERE user_id = $1 AND hyear = $2 AND day = $3 AND item_id = ANY($4)', [r.user_id, st.hyear, st.day, want])).rows[0].n;
    if (done >= want.length) continue;
    n += (await send(r.user_id, 'ramadan', { day: st.day, done, total: want.length }, '/ramadan', log)) > 0 ? 1 : 0;
  }
  if (n) log?.info(`Ramadan : ${n} rappel(s) envoyé(s).`);
  return n;
}

export function startRamadan(log, everyMs = 15 * 60 * 1000) {
  const tick = () => runRamadan(log).catch((err) => log?.warn(`Ramadan : ${err.message}`));
  setTimeout(tick, 65000);
  return setInterval(tick, everyMs);
}
