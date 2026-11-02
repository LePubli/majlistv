// Étape B1 — ligne « Aujourd'hui » du circuit de Ramadan (adultes) : actions du jour cochées / total, pendant Ramadan seulement.
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { itemsOfDay, publishedItems, ramadanStatus } from './lib.js';

export async function ramadanToday(items, { userId, now }) {
  if (!(await featureOn('ramadan'))) return;
  const st = await ramadanStatus(now);
  if (!st.active) return;
  const want = itemsOfDay(await publishedItems('adult'), st.day).map((i) => i.id);
  if (!want.length) return;
  const n = (await pool.query('SELECT count(*)::int AS n FROM ramadan_marks WHERE user_id = $1 AND hyear = $2 AND day = $3 AND item_id = ANY($4)', [userId, st.hyear, st.day, want])).rows[0].n;
  items.push({ kind: 'ramadan', order: 5, day: st.day, n, total: want.length, done: n >= want.length, href: '/ramadan' });
}
