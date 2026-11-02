// Étape B1 — ligne « Aujourd'hui » du plan de lecture : juz du jour (fait / à faire), ou invitation à commencer.
import { featureOn } from '../../features.js';
import { planOf } from './lib.js';

export async function quranToday(items, { userId, now }) {
  if (!(await featureOn('quranplan'))) return;
  const plan = await planOf(userId, now);
  if (!plan) { items.push({ kind: 'quranStart', order: 10, done: false, href: '/coran' }); return; }
  if (!plan.todayJuz) return; // plan terminé ou hors des 30 jours
  items.push({ kind: 'quranJuz', order: 10, juz: plan.todayJuz, done: plan.reads.includes(plan.todayJuz), href: '/coran' });
}
