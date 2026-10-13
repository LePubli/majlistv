// Révision espacée (palier « Apprentissage ») : calendrier fixe J+1 / J+3 / J+7 / J+21 après un quiz.
// Réviser = refaire le quiz de la conférence. Un quiz refait ALORS QU'IL EST À ÉCHÉANCE (ou en retard) fait avancer d'un cran s'il est réussi,
// et ramène au début (J+1) s'il est raté. Refaire un quiz avant l'échéance ne change pas le calendrier.
// Le score d'apprentissage profite de chaque tentative (fraîcheur remise à 100 %).
import { pool } from './db.js';
import { visibleSql } from './visibility.js';
import { getNumber } from './settings.js';

export const INTERVALS = [1, 3, 7, 21]; // jours depuis la date d'ancrage
export const TZ = 'Europe/Paris';
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;

// Enregistre une tentative de quiz dans le calendrier de révision. Renvoie { nextReviewOn, stage, mastered, advanced }.
export async function recordAttempt(userId, talkId, passed, percent, db = pool) {
  const { rows } = await db.query('SELECT stage, anchor_on, due_on FROM revision_items WHERE user_id = $1 AND talk_id = $2', [userId, talkId]);
  const cur = rows[0];
  const reset = `INSERT INTO revision_items(user_id, talk_id, stage, anchor_on, due_on, last_percent)
                 VALUES ($1, $2, 0, ${TODAY}, ${TODAY} + 1, $3)
                 ON CONFLICT (user_id, talk_id) DO UPDATE SET stage = 0, anchor_on = ${TODAY}, due_on = ${TODAY} + 1, last_percent = $3, updated_at = now()
                 RETURNING stage, due_on::text AS "dueOn"`;
  let advanced = false;
  let res;
  if (!cur || !passed) {
    res = (await db.query(reset, [userId, talkId, percent])).rows[0];
  } else if (cur.due_on && (await db.query(`SELECT ${TODAY} >= $1::date AS due`, [cur.due_on])).rows[0].due) {
    const stage = cur.stage + 1;
    res = (await db.query(
      `UPDATE revision_items SET stage = $3, last_percent = $4, reviews = reviews + 1, updated_at = now(),
              due_on = CASE WHEN $3 >= 4 THEN NULL ELSE GREATEST(anchor_on + ($5::int[])[$3 + 1], ${TODAY} + 1) END
        WHERE user_id = $1 AND talk_id = $2 RETURNING stage, due_on::text AS "dueOn"`,
      [userId, talkId, stage, percent, INTERVALS])).rows[0];
    advanced = true;
  } else {
    res = (await db.query('UPDATE revision_items SET last_percent = $3, updated_at = now() WHERE user_id = $1 AND talk_id = $2 RETURNING stage, due_on::text AS "dueOn"', [userId, talkId, percent])).rows[0];
  }
  return { nextReviewOn: res.dueOn, stage: res.stage, mastered: res.stage >= 4, advanced };
}

// Membre qui passe à l'Apprentissage : ses anciens quiz entrent dans le calendrier (première échéance : aujourd'hui, jamais dans le passé).
async function backfill(userId) {
  await pool.query(
    `INSERT INTO revision_items(user_id, talk_id, stage, anchor_on, due_on, last_percent)
     SELECT a.user_id, a.talk_id, 0, (max(a.created_at) AT TIME ZONE '${TZ}')::date,
            GREATEST((max(a.created_at) AT TIME ZONE '${TZ}')::date + 1, ${TODAY}), max(a.percent)
       FROM quiz_attempts a WHERE a.user_id = $1 GROUP BY a.user_id, a.talk_id
     ON CONFLICT DO NOTHING`, [userId]);
}

// Révisions à faire aujourd'hui (conférences encore visibles, dans la limite quotidienne), les plus en retard d'abord.
export async function dueTalks(userId, { limit } = {}) {
  await backfill(userId);
  const max = limit ?? (await getNumber('revision_daily_max'));
  const { rows } = await pool.query(
    `SELECT t.id, r.stage, r.due_on::text AS "dueOn", (${TODAY} - r.due_on)::int AS "lateDays", r.last_percent AS "lastPercent"
       FROM revision_items r JOIN talks t ON t.id = r.talk_id
      WHERE r.user_id = $1 AND r.due_on IS NOT NULL AND r.due_on <= ${TODAY} AND t.video_status = 'ready' AND ${visibleSql('t')}
        AND EXISTS (SELECT 1 FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved')
      ORDER BY r.due_on, t.title LIMIT $2`, [userId, max]);
  const total = (await pool.query(
    `SELECT count(*)::int AS n FROM revision_items r JOIN talks t ON t.id = r.talk_id
      WHERE r.user_id = $1 AND r.due_on IS NOT NULL AND r.due_on <= ${TODAY} AND t.video_status = 'ready' AND ${visibleSql('t')}`, [userId])).rows[0].n;
  return { items: rows, total };
}

export async function upcoming(userId) {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE due_on > ${TODAY} AND due_on <= ${TODAY} + 7)::int AS week,
            count(*) FILTER (WHERE due_on IS NULL)::int AS mastered,
            min(due_on) FILTER (WHERE due_on > ${TODAY})::text AS "nextOn"
       FROM revision_items WHERE user_id = $1`, [userId]);
  return rows[0];
}

// Rappel du jour : un passage validé, tiré parmi les conférences que le membre a déjà passées au quiz (un seul par jour, stable toute la journée).
export async function reminderOfTheDay(userId) {
  const { rows } = await pool.query(
    `SELECT m.id, m.text, m.start_ms AS "startMs", m.attribution, m.origin, t.id AS "talkId", t.title AS "talkTitle", t.speaker
       FROM reminders m JOIN talks t ON t.id = m.talk_id
      WHERE m.status = 'approved' AND t.video_status = 'ready' AND ${visibleSql('t')}
        AND EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.user_id = $1 AND a.talk_id = t.id)
      ORDER BY md5(m.id::text || $1::text || ${TODAY}::text) LIMIT 1`, [userId]);
  return rows[0] || null;
}

// Heure actuelle à Paris (pour l'envoi quotidien).
export async function parisHour() {
  return (await pool.query(`SELECT extract(hour from now() AT TIME ZONE '${TZ}')::int AS h`)).rows[0].h;
}
export const todayParis = async () => (await pool.query(`SELECT ${TODAY}::text AS d`)).rows[0].d;
