// Contrôle parental (étape 26.3) : temps quotidien, catalogue autorisé, rapport de progression.
// Rien ici ne compare les enfants entre eux : chaque profil est présenté seul.
import { pool } from './db.js';
import { TZ } from './revision.js';
import { starTotal } from './kidsLearning.js';

const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;
export const MIN_LIMIT = 5, MAX_LIMIT = 480;

// Condition SQL « ce profil a le droit de voir cette conférence » ($p = id du profil, $m = mode du catalogue).
export const catalogSql = (alias, p, m) => `(CASE $${m}::text
  WHEN 'selected' THEN EXISTS (SELECT 1 FROM kid_catalog kc WHERE kc.profile_id = $${p} AND kc.talk_id = ${alias}.id AND kc.allowed)
  ELSE NOT EXISTS (SELECT 1 FROM kid_catalog kc WHERE kc.profile_id = $${p} AND kc.talk_id = ${alias}.id AND NOT kc.allowed) END)`;

// Temps du jour : { limitMin, usedSec, leftSec, timeUp }. leftSec = null sans limite.
export async function timeState(profile, db = pool) {
  const used = (await db.query(`SELECT COALESCE(sum(seconds), 0)::int AS s FROM kid_usage WHERE profile_id = $1 AND day = ${TODAY}`, [profile.id])).rows[0].s;
  const limit = profile.daily_limit_min ?? null;
  const left = limit == null ? null : Math.max(0, limit * 60 - used);
  return { limitMin: limit, usedSec: used, leftSec: left, timeUp: left === 0 };
}

// « Ping » de la page enfant (toutes les 30 s environ) : on ajoute le temps réellement écoulé depuis le ping précédent
// (jamais plus de 60 s d'un coup). Après 2 min sans ping, une nouvelle séance démarre et compte 10 s.
export async function addPing(profile, db = pool) {
  await db.query(
    `INSERT INTO kid_usage(profile_id, day, seconds, last_ping) VALUES ($1, ${TODAY}, 10, now())
     ON CONFLICT (profile_id, day) DO UPDATE SET
       seconds = kid_usage.seconds + CASE WHEN now() - kid_usage.last_ping <= interval '120 seconds'
                                          THEN LEAST(EXTRACT(EPOCH FROM now() - kid_usage.last_ping), 60)::int ELSE 10 END,
       last_ping = now()`, [profile.id]);
  return timeState(profile, db);
}

// Rapport d'un parent sur les `days` derniers jours (jour en cours inclus), un bloc par enfant, par ordre de création.
export async function kidReport(parentId, days = 7, learning = false, db = pool) {
  const d = Math.min(90, Math.max(1, Number(days) || 7));
  const since = (await db.query(`SELECT (${TODAY} - ($1::int - 1))::text AS d`, [d])).rows[0].d;
  const profiles = (await db.query('SELECT * FROM kid_profiles WHERE user_id = $1 ORDER BY created_at', [parentId])).rows;
  const out = [];
  for (const p of profiles) {
    const usage = (await db.query(
      `SELECT g::date::text AS day, COALESCE(u.seconds, 0)::int AS seconds
         FROM generate_series($2::date, ${TODAY}, interval '1 day') g LEFT JOIN kid_usage u ON u.profile_id = $1 AND u.day = g::date ORDER BY g`, [p.id, since])).rows;
    const watched = (await db.query(
      `SELECT t.id, t.title FROM kid_progress k JOIN talks t ON t.id = k.talk_id
        WHERE k.profile_id = $1 AND k.completed AND (k.updated_at AT TIME ZONE '${TZ}')::date >= $2::date ORDER BY k.updated_at DESC`, [p.id, since])).rows;
    const q = (await db.query(
      `SELECT count(*)::int AS n, COALESCE(round(avg(percent)), 0)::int AS avg FROM kid_quiz_attempts
        WHERE profile_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date >= $2::date`, [p.id, since])).rows[0];
    const before = (await db.query(
      `SELECT COALESCE(sum(s), 0)::int AS n FROM (SELECT max(stars) AS s FROM kid_quiz_attempts
         WHERE profile_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date < $2::date GROUP BY talk_id) x`, [p.id, since])).rows[0].n;
    const total = await starTotal(p.id, db);
    // Vidéos dont le dernier quiz est à reprendre (moins de 60 %) : de quoi encourager l'enfant à rejouer, sans note.
    const retry = (await db.query(
      `SELECT t.id, t.title FROM (SELECT DISTINCT ON (talk_id) talk_id, percent FROM kid_quiz_attempts
                WHERE profile_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date >= $2::date ORDER BY talk_id, created_at DESC) a
         JOIN talks t ON t.id = a.talk_id WHERE a.percent < 60 LIMIT 5`, [p.id, since])).rows;
    const badges = learning ? (await db.query(
      `SELECT code FROM kid_badges WHERE profile_id = $1 AND (earned_at AT TIME ZONE '${TZ}')::date >= $2::date ORDER BY earned_at`, [p.id, since])).rows.map((r) => r.code) : [];
    const seconds = usage.reduce((s, x) => s + x.seconds, 0);
    out.push({ id: p.id, name: p.name, avatar: p.avatar, band: p.band, dailyLimitMin: p.daily_limit_min, catalogMode: p.catalog_mode,
      usage, minutes: Math.round(seconds / 60), activeDays: usage.filter((x) => x.seconds > 0).length,
      watched: watched.length, watchedTitles: watched.slice(0, 5).map((x) => x.title), quizzes: q.n, avgPercent: q.n ? q.avg : null,
      starsGained: Math.max(0, total - before), stars: total, badges, retry: retry.map((x) => x.title), active: seconds > 0 || watched.length > 0 || q.n > 0 });
  }
  return { days: d, since, profiles: out, learning };
}
