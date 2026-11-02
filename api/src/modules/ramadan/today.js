// Étapes B1 et B3 — lignes « Aujourd'hui » du circuit de Ramadan (adultes) :
//  - pendant Ramadan : actions du jour cochées / total ;
//  - après Ramadan (jusqu'à 60 jours) : « Votre bilan de Ramadan », faite quand la note personnelle est écrite.
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { itemsOfDay, publishedItems, ramadanStatus } from './lib.js';
import { bilanYear } from './bilan.js';

export async function ramadanToday(items, { userId, now }) {
  if (!(await featureOn('ramadan'))) return;
  const st = await ramadanStatus(now);
  if (!st.active) {
    const y = await bilanYear(now);
    if (!y) return;
    const noted = (await pool.query('SELECT 1 FROM ramadan_notes WHERE user_id = $1 AND hyear = $2', [userId, y])).rowCount > 0;
    items.push({ kind: 'ramadanBilan', order: 5, year: y, done: noted, href: '/ramadan#rb-t' });
    return;
  }
  const want = itemsOfDay(await publishedItems('adult'), st.day).map((i) => i.id);
  if (!want.length) return;
  const n = (await pool.query('SELECT count(*)::int AS n FROM ramadan_marks WHERE user_id = $1 AND hyear = $2 AND day = $3 AND item_id = ANY($4)', [userId, st.hyear, st.day, want])).rows[0].n;
  items.push({ kind: 'ramadan', order: 5, day: st.day, n, total: want.length, done: n >= want.length, href: '/ramadan' });
}
