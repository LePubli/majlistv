// Planning de révisions (palier « Apprentissage »), étape 1.
// Un jour du planning rassemble : les révisions automatiques (quiz espacés J+1/3/7/21 et cartes mémoire à revoir, calculées à la volée),
// les séances choisies par le membre (table learning_plan_items) et, pour les jours passés, la marque « activité » déjà utilisée par la série.
// Une révision en retard est regroupée sur aujourd'hui (rien n'est perdu, rien n'est reproché).
import { pool } from './db.js';
import { featureOn } from './features.js';
import { openText, practiceKeyReady } from './practiceCrypto.js';
import { visibleSql } from './visibility.js';
import { TZ, addDays, mondayOf, parisToday, activeDaysOf, goalOf, weekOf } from './learningStreak.js';

export const KINDS = ['video', 'quiz', 'custom', 'cards', 'quran', 'athkar', 'action', 'bilan'];
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

/** Lecture du Coran en 30 jours : un juz par jour, à partir du jour de départ choisi par le membre. */
async function autoQuran(userId, from, to) {
  if (!(await featureOn('quran')) || !(await featureOn('quranplan'))) return [];
  const p = (await pool.query(`SELECT to_char(started_on, 'YYYY-MM-DD') AS s FROM quran_plans WHERE user_id = $1`, [userId])).rows[0];
  if (!p) return [];
  const reads = new Set((await pool.query('SELECT juz FROM quran_plan_reads WHERE user_id = $1', [userId])).rows.map((r) => r.juz));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const n = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${p.s}T12:00:00Z`)) / 86400000) + 1;
    if (n >= 1 && n <= 30) out.push({ type: 'quran', day: d, juz: n, done: reads.has(n) });
  }
  return out;
}

/** Adhkar : un repère par jour pour les membres qui ont réglé leur objectif quotidien ; « fait » si l'objectif du jour est atteint. */
async function autoAthkar(userId, from, to) {
  if (!(await featureOn('athkar'))) return [];
  const pref = (await pool.query('SELECT daily_goal FROM athkar_prefs WHERE user_id = $1', [userId])).rows[0];
  if (!pref) return [];
  const { rows } = await pool.query(
    `SELECT to_char(c.day, 'YYYY-MM-DD') AS day, count(*)::int AS done
       FROM athkar_counts c JOIN athkar_items i ON i.id = c.item_id
      WHERE c.user_id = $1 AND i.enabled AND i.reviewed_at IS NOT NULL AND c.count >= i.target AND c.day BETWEEN $2::date AND $3::date
      GROUP BY c.day`, [userId, from, to]);
  const by = new Map(rows.map((r) => [r.day, r.done]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ type: 'athkar', day: d, goal: pref.daily_goal, done: (by.get(d) || 0) >= pref.daily_goal });
  return out;
}

/** Mise en pratique : mes engagements à faire ou en cours qui ont une échéance (les retards sont ramenés à aujourd'hui). */
async function autoActions(userId, from, to, today) {
  if (!(await featureOn('practice')) || !practiceKeyReady()) return [];
  const { rows } = await pool.query(
    `SELECT id, text_enc, GREATEST(due_on, $4::date)::text AS day FROM practice_commitments
      WHERE user_id = $1 AND status IN ('todo', 'doing') AND due_on IS NOT NULL AND GREATEST(due_on, $4::date) BETWEEN $2::date AND $3::date
      ORDER BY day, created_at`, [userId, from, to, today]);
  return rows.map((r) => ({ type: 'action', day: r.day, id: r.id, title: openText(r.text_enc) || '' }));
}

/** Bilan personnel : un repère le jour de la semaine choisi par le membre (vendredi par défaut), s'il a au moins un objectif actif. */
async function autoBilan(userId, from, to) {
  if (!(await featureOn('selfcheck')) || !practiceKeyReady()) return [];
  const u = (await pool.query('SELECT practice_weekday AS wd FROM users WHERE id = $1', [userId])).rows[0];
  const goals = (await pool.query('SELECT id FROM self_goals WHERE user_id = $1 AND archived_at IS NULL', [userId])).rows.map((r) => r.id);
  if (!u || !goals.length) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT to_char(week, 'YYYY-MM-DD') AS w FROM self_checkins WHERE goal_id = ANY($1::uuid[]) AND week BETWEEN $2::date AND $3::date`,
    [goals, mondayOf(from), to]);
  const doneWeeks = new Set(rows.map((r) => r.w));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 === u.wd) out.push({ type: 'bilan', day: d, done: doneWeeks.has(mondayOf(d)) });
  }
  return out;
}

/** Séances choisies par le membre. */
async function ownItems(userId, from, to) {
  const { rows } = await pool.query(
    `SELECT i.id, i.day::text AS day, i.kind, i.talk_id AS "talkId", COALESCE(t.title, '') AS title, i.note, (i.done_at IS NOT NULL) AS done, i.deadline_id AS "deadlineId"
       FROM learning_plan_items i LEFT JOIN talks t ON t.id = i.talk_id
      WHERE i.user_id = $1 AND i.day BETWEEN $2::date AND $3::date
      ORDER BY i.day, i.created_at`, [userId, from, to]);
  return rows;
}

/** Ce qui reste à faire un jour donné (aujourd'hui) : sert aux rappels. Les textes d'engagements et de bilan ne sortent jamais d'ici : seulement des nombres. */
export async function agendaOf(userId, day) {
  const [rev, cards, quran, athkar, actions, bilan, mine] = await Promise.all([
    autoRevisions(userId, day, day, day), autoCards(userId, day, day, day), autoQuran(userId, day, day), autoAthkar(userId, day, day),
    autoActions(userId, day, day, day), autoBilan(userId, day, day), ownItems(userId, day, day),
  ]);
  const todo = mine.filter((i) => !i.done);
  const cardsN = cards.reduce((n, c) => n + c.count, 0);
  return {
    revisions: rev.map((r) => r.title), cards: cardsN, quran: quran.filter((q) => !q.done).length, athkar: athkar.filter((a) => !a.done).length,
    actions: actions.length, bilan: bilan.filter((b) => !b.done).length, mine: todo.length, mineTitles: todo.filter((i) => i.title).map((i) => i.title),
    total: rev.length + (cardsN ? 1 : 0) + quran.filter((q) => !q.done).length + athkar.filter((a) => !a.done).length + actions.length + bilan.filter((b) => !b.done).length + todo.length,
  };
}

/**
 * Objectif de la semaine et plan : combien de jours actifs (au sens de la série : vidéo, quiz, révision ou carte) sont encore PRÉVUS
 * d'aujourd'hui à dimanche. Les adhkar, le Coran, les actions et le bilan ne comptent pas comme « jour actif » : on ne les compte donc pas ici.
 */
export async function weekOutlook(userId, today, active, goal) {
  const monday = mondayOf(today); const sunday = addDays(monday, 6);
  const done = [...active].filter((d) => d >= monday && d <= today).length;
  const [rev, cards, mine] = await Promise.all([autoRevisions(userId, today, sunday, today), autoCards(userId, today, sunday, today), ownItems(userId, today, sunday)]);
  const days = new Set([...rev.map((x) => x.day), ...cards.map((x) => x.day), ...mine.filter((i) => !i.done && ['video', 'quiz', 'cards'].includes(i.kind)).map((i) => i.day)]);
  for (const d of [...days]) if (active.has(d)) days.delete(d); // un jour déjà actif est déjà compté dans « done »
  const planned = days.size;
  return { done, goal, planned, reachable: done + planned >= goal, missing: Math.max(0, goal - done - planned) };
}

/** Échéances à venir (aujourd'hui ou plus tard) avec leur avancement : séances faites / séances prévues. */
export async function deadlinesOf(userId, today) {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.due_on::text AS "dueOn", d.pace, (d.due_on - $2::date)::int AS "daysLeft",
            count(i.id)::int AS total, (count(i.id) FILTER (WHERE i.done_at IS NOT NULL))::int AS done
       FROM learning_deadlines d LEFT JOIN learning_plan_items i ON i.deadline_id = d.id
      WHERE d.user_id = $1 AND d.due_on >= $2::date
      GROUP BY d.id ORDER BY d.due_on, d.created_at`, [userId, today]);
  return rows;
}

/** Réponse complète de GET /me/learning/plan. */
export async function planWindow(userId, from, to) {
  const today = await parisToday();
  const [autos, items, rest, active, g, deadlines] = await Promise.all([
    Promise.all([autoRevisions(userId, from, to, today), autoCards(userId, from, to, today), autoQuran(userId, from, to), autoAthkar(userId, from, to), autoActions(userId, from, to, today), autoBilan(userId, from, to)]),
    ownItems(userId, from, to),
    pool.query('SELECT day::text AS day FROM learning_rest_days WHERE user_id = $1 AND day BETWEEN $2::date AND $3::date ORDER BY day', [userId, from, to]),
    activeDaysOf(userId), goalOf(userId), deadlinesOf(userId, today),
  ]);
  const act = [...active].filter((d) => d >= from && d <= to).sort();
  return {
    today, from, to,
    auto: autos.flat(),
    items,
    deadlines, // toutes les échéances à venir : le site en tire le bandeau « J-n » et les drapeaux des vues
    rest: rest.rows.map((r) => r.day),
    active: act, // jours où le membre a réellement appris (déjà fait)
    week: weekOf(active, today, g.goal),
    outlook: await weekOutlook(userId, today, active, g.goal), // l'objectif de la semaine sera-t-il atteint si le plan est suivi ?
    goal: g.goal,
    monday: mondayOf(today),
  };
}

export { TZ };
