// Planning de révisions (palier « Apprentissage »), étape 1.
// Un jour du planning rassemble : les révisions automatiques (quiz espacés J+1/3/7/21 et cartes mémoire à revoir, calculées à la volée),
// les séances choisies par le membre (table learning_plan_items) et, pour les jours passés, la marque « activité » déjà utilisée par la série.
// Une révision en retard est regroupée sur aujourd'hui (rien n'est perdu, rien n'est reproché).
import { pool } from './db.js';
import { visibleSql } from './visibility.js';
import { TZ, addDays, mondayOf, parisToday, activeDaysOf, goalOf, weekOf } from './learningStreak.js';

export const MAX_DAYS = 62; // fenêtre maximale d'une requête (vue mois : 6 semaines = 42 jours)
export const MAX_AHEAD = 366; // on ne planifie pas au-delà d'un an
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Fenêtre valide ? (from ≤ to, au plus MAX_DAYS jours) */
export function windowOk(from, to) {
  if (!isDay(from) || !isDay(to) || from > to) return false;
  return Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) <= (MAX_DAYS - 1) * 86400000;
}

/** Une date peut-elle recevoir une séance ? (aujourd'hui → dans un an) */
export const dayAllowed = (day, today) => isDay(day) && day >= today && day <= addDays(today, MAX_AHEAD);

/** Révisions automatiques de quiz entre from et to (les retards sont ramenés à aujourd'hui). */
async function autoRevisions(userId, from, to, today) {
  const { rows } = await pool.query(
    `SELECT t.id AS "talkId", t.title, r.stage, GREATEST(r.due_on, $4::date)::text AS day
       FROM revision_items r JOIN talks t ON t.id = r.talk_id
      WHERE r.user_id = $1 AND r.due_on IS NOT NULL AND t.video_status = 'ready' AND ${visibleSql('t')}
        AND EXISTS (SELECT 1 FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved')
        AND GREATEST(r.due_on, $4::date) BETWEEN $2::date AND $3::date
      ORDER BY day, t.title`, [userId, from, to, today]);
  return rows.map((r) => ({ type: 'revision', day: r.day, talkId: r.talkId, title: r.title, stage: r.stage }));
}

/** Cartes mémoire à revoir : un seul bloc par jour avec le nombre de cartes. */
async function autoCards(userId, from, to, today) {
  const { rows } = await pool.query(
    `SELECT GREATEST(p.due_on, $4::date)::text AS day, count(*)::int AS n
       FROM memory_card_progress p JOIN quiz_questions q ON q.id = p.question_id AND q.status = 'approved'
      WHERE p.user_id = $1 AND p.due_on IS NOT NULL AND GREATEST(p.due_on, $4::date) BETWEEN $2::date AND $3::date
      GROUP BY 1 ORDER BY 1`, [userId, from, to, today]);
  return rows.map((r) => ({ type: 'cards', day: r.day, count: r.n }));
}

/** Séances choisies par le membre. */
async function ownItems(userId, from, to) {
  const { rows } = await pool.query(
    `SELECT i.id, i.day::text AS day, i.kind, i.talk_id AS "talkId", COALESCE(t.title, '') AS title, i.note, (i.done_at IS NOT NULL) AS done
       FROM learning_plan_items i LEFT JOIN talks t ON t.id = i.talk_id
      WHERE i.user_id = $1 AND i.day BETWEEN $2::date AND $3::date
      ORDER BY i.day, i.created_at`, [userId, from, to]);
  return rows;
}

/** Réponse complète de GET /me/learning/plan. */
export async function planWindow(userId, from, to) {
  const today = await parisToday();
  const [auto1, auto2, items, rest, active, g] = await Promise.all([
    autoRevisions(userId, from, to, today), autoCards(userId, from, to, today), ownItems(userId, from, to),
    pool.query('SELECT day::text AS day FROM learning_rest_days WHERE user_id = $1 AND day BETWEEN $2::date AND $3::date ORDER BY day', [userId, from, to]),
    activeDaysOf(userId), goalOf(userId),
  ]);
  const act = [...active].filter((d) => d >= from && d <= to).sort();
  return {
    today, from, to,
    auto: [...auto1, ...auto2],
    items,
    rest: rest.rows.map((r) => r.day),
    active: act, // jours où le membre a réellement appris (déjà fait)
    week: weekOf(active, today, g.goal),
    goal: g.goal,
    monday: mondayOf(today),
  };
}

export { TZ };
