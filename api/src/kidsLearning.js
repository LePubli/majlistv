// Étoiles, badges et révision des enfants (étape 26.2). Palier Apprentissage : badges et révision ; tous les paliers : étoiles.
import { pool } from './db.js';
import { TZ } from './revision.js';

const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;
export const KID_INTERVALS = [1, 3, 7]; // jours : première, deuxième, troisième révision
export const KID_BADGES = ['first_quiz', 'three_stars', 'quizzes_5', 'explorer', 'watcher_3', 'retry_better', 'stars_10'];
export const KID_QUESTIONS = 5; // questions posées à un enfant

// Étoiles : 1 pour avoir essayé, 2 à partir de 60 %, 3 à partir de 90 %.
export const starsOf = (percent) => 1 + (percent >= 60 ? 1 : 0) + (percent >= 90 ? 1 : 0);

// Total d'étoiles : la meilleure note de chaque conférence (rejouer ne fait jamais baisser).
export async function starTotal(profileId, db = pool) {
  return (await db.query(
    `SELECT COALESCE(sum(s), 0)::int AS n FROM (SELECT max(stars) AS s FROM kid_quiz_attempts WHERE profile_id = $1 GROUP BY talk_id) x`, [profileId])).rows[0].n;
}

// Badges mérités d'après l'activité de l'enfant.
export async function earnedBadges(profileId, db = pool) {
  const a = (await db.query(
    `SELECT count(*)::int AS attempts, count(DISTINCT talk_id)::int AS talks, COALESCE(max(stars), 0)::int AS best,
            EXISTS (SELECT 1 FROM kid_quiz_attempts x JOIN kid_quiz_attempts y ON y.profile_id = x.profile_id AND y.talk_id = x.talk_id AND y.created_at > x.created_at AND y.percent > x.percent
                     WHERE x.profile_id = $1) AS better
       FROM kid_quiz_attempts WHERE profile_id = $1`, [profileId])).rows[0];
  const watched = (await db.query('SELECT count(*)::int AS n FROM kid_progress WHERE profile_id = $1 AND completed', [profileId])).rows[0].n;
  const stars = await starTotal(profileId, db);
  const out = [];
  if (a.attempts >= 1) out.push('first_quiz');
  if (a.best === 3) out.push('three_stars');
  if (a.attempts >= 5) out.push('quizzes_5');
  if (a.talks >= 3) out.push('explorer');
  if (watched >= 3) out.push('watcher_3');
  if (a.better) out.push('retry_better');
  if (stars >= 10) out.push('stars_10');
  return out;
}

// Enregistre les badges mérités ; renvoie ceux qui sont nouveaux.
export async function awardBadges(profileId, db = pool) {
  const have = new Set((await db.query('SELECT code FROM kid_badges WHERE profile_id = $1', [profileId])).rows.map((r) => r.code));
  const fresh = (await earnedBadges(profileId, db)).filter((c) => !have.has(c));
  for (const c of fresh) await db.query('INSERT INTO kid_badges(profile_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [profileId, c]);
  return fresh;
}

// Révision : un bon essai (≥ 60 %) à l'échéance fait avancer d'un cran, jusqu'à « retenu » ; un essai moyen repart de J+1.
export async function recordKidAttempt(profileId, talkId, percent, db = pool) {
  const cur = (await db.query(`SELECT stage, due_on, (due_on IS NOT NULL AND due_on <= ${TODAY}) AS due FROM kid_revision WHERE profile_id = $1 AND talk_id = $2`, [profileId, talkId])).rows[0];
  const set = (stage, interval) => db.query(
    `INSERT INTO kid_revision(profile_id, talk_id, stage, due_on) VALUES ($1, $2, $3, ${interval == null ? 'NULL' : `${TODAY} + ${interval}`})
     ON CONFLICT (profile_id, talk_id) DO UPDATE SET stage = EXCLUDED.stage, due_on = EXCLUDED.due_on`, [profileId, talkId, stage]);
  if (percent < 60) return set(0, KID_INTERVALS[0]);
  if (!cur) return set(0, KID_INTERVALS[0]);
  if (!cur.due) return undefined; // essai libre avant l'échéance : le calendrier ne bouge pas
  const next = cur.stage + 1;
  return next >= KID_INTERVALS.length ? set(3, null) : set(next, KID_INTERVALS[next]);
}
