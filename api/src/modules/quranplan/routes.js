// Lecture du Coran en 30 jours (étape 45E) — gratuit pour tout membre connecté.
//   GET    /quran/juzs                 public : les 30 juz (début et fin)
//   GET    /quran/plan                 membre : mon programme (jour, juz du jour, juz lus, rappel, lectures terminées) ou null
//   POST   /quran/plan/start {startedOn?}   membre : commencer (ou recommencer) ; une lecture complète (30 juz) est comptée
//   PUT    /quran/plan/juz/:n {read}   membre : cocher / décocher un juz
//   PUT    /quran/plan/prefs {remindHour|null}   membre : heure du rappel (Paris)
//   DELETE /quran/plan                 membre : arrêter le programme
import { z } from 'zod';
import { pool } from '../../db.js';
import { DAYS, juzList, planOf, today } from './lib.js';

export default async function planRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/quran/juzs', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return juzList();
  });

  app.get('/quran/plan', auth, async (req) => ({ plan: await planOf(req.user.sub) }));

  app.post('/quran/plan/start', auth, async (req, reply) => {
    const b = z.object({ startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body ?? {});
    const t = today();
    const start = b.startedOn || t;
    const diff = (Date.parse(`${start}T12:00:00Z`) - Date.parse(`${t}T12:00:00Z`)) / 86400000;
    if (Number.isNaN(diff) || diff < -29 || diff > 60) return reply.code(400).send({ error: 'Date de début : entre 29 jours avant et 60 jours après aujourd’hui.' });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const done = (await c.query('SELECT count(*)::int AS n FROM quran_plan_reads WHERE user_id = $1', [req.user.sub])).rows[0].n === DAYS;
      await c.query('DELETE FROM quran_plan_reads WHERE user_id = $1', [req.user.sub]);
      await c.query(
        `INSERT INTO quran_plans(user_id, started_on) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET started_on = $2, last_reminded_on = NULL, completed_count = quran_plans.completed_count + $3, updated_at = now()`,
        [req.user.sub, start, done ? 1 : 0]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    return { plan: await planOf(req.user.sub) };
  });

  app.put('/quran/plan/juz/:n', auth, async (req, reply) => {
    const { n } = z.object({ n: z.coerce.number().int().min(1).max(DAYS) }).parse(req.params);
    const { read } = z.object({ read: z.boolean() }).parse(req.body ?? {});
    if (!(await pool.query('SELECT 1 FROM quran_plans WHERE user_id = $1', [req.user.sub])).rowCount) return reply.code(404).send({ error: 'Commencez d’abord le programme.' });
    if (read) await pool.query('INSERT INTO quran_plan_reads(user_id, juz) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.sub, n]);
    else await pool.query('DELETE FROM quran_plan_reads WHERE user_id = $1 AND juz = $2', [req.user.sub, n]);
    return { plan: await planOf(req.user.sub) };
  });

  app.put('/quran/plan/prefs', auth, async (req, reply) => {
    const { remindHour } = z.object({ remindHour: z.number().int().min(0).max(23).nullable() }).parse(req.body ?? {});
    const r = await pool.query('UPDATE quran_plans SET remind_hour = $2, updated_at = now() WHERE user_id = $1', [req.user.sub, remindHour]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Commencez d’abord le programme.' });
    return { plan: await planOf(req.user.sub) };
  });

  app.delete('/quran/plan', auth, async (req) => {
    await pool.query('DELETE FROM quran_plan_reads WHERE user_id = $1', [req.user.sub]);
    await pool.query('DELETE FROM quran_plans WHERE user_id = $1', [req.user.sub]);
    return { plan: null };
  });
}
