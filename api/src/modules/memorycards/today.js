// Étape B1 — ligne « Aujourd'hui » des cartes mémoire : nombre de cartes à revoir aujourd'hui (formule Apprentissage).
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { hasLearningTier } from '../../access.js';

const TODAY = "(now() AT TIME ZONE 'Europe/Paris')::date";

export async function cardsToday(items, { userId }) {
  if (!(await featureOn('memorycards')) || !(await hasLearningTier(userId))) return;
  const { due, seen } = (await pool.query(
    `SELECT count(*) FILTER (WHERE p.due_on IS NOT NULL AND p.due_on <= ${TODAY})::int AS due,
            count(*) FILTER (WHERE p.last_on = ${TODAY})::int AS seen
       FROM memory_card_progress p JOIN quiz_questions q ON q.id = p.question_id WHERE p.user_id = $1 AND q.status = 'approved'`, [userId])).rows[0];
  if (due > 0) items.push({ kind: 'cards', order: 30, n: due, done: false, href: '/learning?tab=cards' });
  else if (seen > 0) items.push({ kind: 'cards', order: 30, n: 0, done: true, href: '/learning?tab=cards' });
}
