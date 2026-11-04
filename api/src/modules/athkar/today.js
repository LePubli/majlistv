// Étape B1 — ligne « Aujourd'hui » des adhkar : matin avant 14 h (Paris), soir ensuite ; faite quand chaque dhikr du moment
// a atteint son nombre de répétitions. Réservée à la formule Apprentissage, et seulement s'il existe des dhikr publiés.
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { hasLearningTier } from '../../access.js';
import { parisDay } from '../../parisTime.js';
import { published, today } from './lib.js';

export const momentOf = (now) => (parisDay(now).hour < 14 ? 'morning' : 'evening');

export async function athkarToday(items, { userId, now }) {
  if (!(await featureOn('athkar')) || !(await hasLearningTier(userId))) return;
  const moment = momentOf(now);
  const list = (await published()).filter((i) => i.category === moment);
  if (!list.length) return;
  const counts = new Map((await pool.query('SELECT item_id, count FROM athkar_counts WHERE user_id = $1 AND day = $2', [userId, today(now)])).rows.map((r) => [r.item_id, r.count]));
  const n = list.filter((i) => (counts.get(i.id) || 0) >= i.target).length;
  items.push({ kind: 'athkar', order: 20, moment, n, total: list.length, done: n >= list.length, href: '/learning?tab=athkar' });
}
