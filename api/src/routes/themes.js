// Étape 31 — Thèmes, parcours et évolution.
//   GET  /themes, /themes/:id                    bibliothèque publique (quand la base est activée par l'administrateur)
//   GET/PUT /studio/talks/:id/themes             étiquettes posées par l'organisateur (3 au maximum)
//   POST /me/practice/themes/:themeId            s'engager sur un « petit pas » depuis la page d'un thème (Apprentissage)
//   GET  /me/evolution?month=AAAA-MM             « Mon évolution » : appris et mis en pratique, par thème, mois par mois
// Règles : tout ce qui est personnel est chiffré (PRACTICE_KEY) ; des nombres de faits, jamais de score ni de comparaison.
import { z } from 'zod';
import { pool } from '../db.js';
import { hasLearningTier } from '../access.js';
import { sealText, openText, practiceKeyReady } from '../practiceCrypto.js';
import { THEMES, THEME_BY_ID, MAX_TALK_THEMES, themesOn, themeCard, talksOfTheme } from '../themes.js';
import { dueOn, DUE_KINDS } from '../dueDates.js';
import { visibleSql } from '../visibility.js';
import { viaChannel, managedSpeakers } from '../channelAccess.js';

const idSchema = z.object({ id: z.string().uuid() });
const themeIdSchema = z.string().regex(/^[QDA]\d{1,2}$/);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function themesRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  // ------------------------------------------------------------------ Bibliothèque publique
  app.get('/themes', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    if (!(await themesOn())) return { enabled: false, themes: [] };
    const counts = new Map((await pool.query(
      `SELECT x.theme_id, count(*)::int AS n FROM talk_themes x JOIN talks t ON t.id = x.talk_id
        WHERE ${visibleSql('t')} GROUP BY x.theme_id`)).rows.map((r) => [r.theme_id, r.n]));
    return { enabled: true, themes: THEMES.map((t) => ({ ...themeCard(t), talks: counts.get(t.id) || 0 })) };
  });

  app.get('/themes/:id', async (req, reply) => {
    const id = themeIdSchema.parse(req.params.id);
    const th = THEME_BY_ID.get(id);
    if (!(await themesOn()) || !th) return reply.code(404).send({ error: 'Thème introuvable' });
    reply.header('cache-control', 'public, max-age=60');
    const talks = await talksOfTheme(id);
    return {
      ...themeCard(th),
      steps: th.steps.map((text, i) => ({ size: i + 1, text })), // 1 petit pas · 2 moyen · 3 ambitieux
      talks: talks.map((t) => ({ id: t.id, title: t.title, speaker: t.speaker, durationSeconds: t.duration_seconds, language: t.language })),
    };
  });

  // ------------------------------------------------------------------ Studio : étiquettes
  async function ownedTalk(req, reply, id) {
    const t = (await pool.query('SELECT id, organizer_id FROM talks WHERE id = $1', [id])).rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) { reply.code(404).send({ error: 'Conférence introuvable' }); return null; }
    return t;
  }
  app.get('/studio/talks/:id/themes', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await ownedTalk(req, reply, id))) return;
    const rows = (await pool.query('SELECT theme_id FROM talk_themes WHERE talk_id = $1 ORDER BY theme_id', [id])).rows;
    return { enabled: await themesOn(), max: MAX_TALK_THEMES, selected: rows.map((r) => r.theme_id), themes: THEMES.map(themeCard) };
  });
  app.put('/studio/talks/:id/themes', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { themeIds } = z.object({ themeIds: z.array(themeIdSchema).max(MAX_TALK_THEMES) }).parse(req.body ?? {});
    if (!(await ownedTalk(req, reply, id))) return;
    const ids = [...new Set(themeIds)];
    if (ids.some((x) => !THEME_BY_ID.has(x))) return reply.code(400).send({ error: 'Thème inconnu' });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM talk_themes WHERE talk_id = $1', [id]);
      for (const x of ids) await c.query('INSERT INTO talk_themes(talk_id, theme_id) VALUES ($1, $2)', [id, x]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    return { selected: ids.sort() };
  });

  // ------------------------------------------------------------------ S'engager depuis un thème
  const gateLearning = async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) { reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' }); return false; }
    if (!practiceKeyReady()) { reply.code(503).send({ error: 'Chiffrement non configuré (PRACTICE_KEY)', code: 'no_key' }); return false; }
    return true;
  };
  const commitBody = z.object({
    size: z.number().int().min(1).max(3),
    niyya: z.string().trim().max(500).default(''),
    due: z.enum(DUE_KINDS).nullable().default('week'),
    consent: z.boolean().optional(),
  });
  app.post('/me/practice/themes/:themeId', auth, async (req, reply) => {
    const themeId = themeIdSchema.parse(req.params.themeId);
    const b = commitBody.parse(req.body ?? {});
    const th = THEME_BY_ID.get(themeId);
    if (!(await themesOn()) || !th) return reply.code(404).send({ error: 'Thème introuvable' });
    if (!(await gateLearning(req, reply))) return;
    const u = (await pool.query('SELECT practice_consent_at FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (!u.practice_consent_at) {
      if (b.consent !== true) return reply.code(409).send({ error: 'Votre accord est nécessaire pour enregistrer des notes personnelles', code: 'consent_required' });
      await pool.query('UPDATE users SET practice_consent_at = now() WHERE id = $1', [req.user.sub]);
    }
    const { rows } = await pool.query(
      `INSERT INTO practice_commitments(user_id, talk_id, size, text_enc, niyya_enc, theme_enc, due_kind, due_on)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7) RETURNING id, size, due_kind, to_char(due_on, 'YYYY-MM-DD') AS due_on, status`,
      [req.user.sub, b.size, sealText(th.steps[b.size - 1]), sealText(b.niyya), sealText(themeId), b.due, await dueOn(b.due)]);
    return reply.code(201).send({ id: rows[0].id, size: rows[0].size, text: th.steps[b.size - 1], dueKind: rows[0].due_kind, dueOn: rows[0].due_on, status: rows[0].status });
  });

  // ------------------------------------------------------------------ Mon évolution
  app.get('/me/evolution', auth, async (req, reply) => {
    if (!(await gateLearning(req, reply))) return;
    const q = z.object({ month: z.string().regex(MONTH_RE).optional() }).parse(req.query);
    const cur = (await pool.query(`SELECT to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM') AS m`)).rows[0].m;
    const month = q.month || cur;
    const months = (await pool.query(
      `SELECT to_char((date_trunc('month', now() AT TIME ZONE 'Europe/Paris') - (n || ' months')::interval), 'YYYY-MM') AS m FROM generate_series(0, 11) n ORDER BY n`)).rows.map((r) => r.m);
    if (!months.includes(month)) return reply.code(400).send({ error: 'Mois non disponible', code: 'month' });
    // Bornes du mois en heure de Paris.
    const range = (await pool.query(
      `SELECT (($1 || '-01')::date)::timestamp AT TIME ZONE 'Europe/Paris' AS a,
              ((($1 || '-01')::date + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Paris' AS b,
              ($1 || '-01')::date AS da, (($1 || '-01')::date + interval '1 month')::date AS db`, [month])).rows[0];
    const uid = req.user.sub;
    const acc = new Map(); // thème → compteurs
    const row = (id) => { if (!acc.has(id)) acc.set(id, { watched: 0, quizzes: 0, made: 0, done: 0, goals: 0, achieved: 0, progress: 0, notYet: 0 }); return acc.get(id); };

    // Appris : conférences terminées et quiz réussis dans le mois, par thème de la conférence.
    for (const r of (await pool.query(
      `SELECT x.theme_id, count(*)::int AS n FROM watch_progress w JOIN talk_themes x ON x.talk_id = w.talk_id
        WHERE w.user_id = $1 AND w.completed AND w.updated_at >= $2 AND w.updated_at < $3 GROUP BY x.theme_id`, [uid, range.a, range.b])).rows) row(r.theme_id).watched += r.n;
    for (const r of (await pool.query(
      `SELECT x.theme_id, count(DISTINCT a.talk_id)::int AS n FROM quiz_attempts a JOIN talk_themes x ON x.talk_id = a.talk_id
        WHERE a.user_id = $1 AND a.passed AND a.created_at >= $2 AND a.created_at < $3 GROUP BY x.theme_id`, [uid, range.a, range.b])).rows) row(r.theme_id).quizzes += r.n;

    // Mis en pratique : engagements (thème de la conférence, ou thème choisi directement), puis objectifs et bilans du mois.
    const commits = (await pool.query(
      `SELECT c.theme_enc, c.created_at, c.done_at, c.status, COALESCE(array_agg(x.theme_id) FILTER (WHERE x.theme_id IS NOT NULL), '{}') AS tagged
         FROM practice_commitments c LEFT JOIN talk_themes x ON x.talk_id = c.talk_id
        WHERE c.user_id = $1 AND ((c.created_at >= $2 AND c.created_at < $3) OR (c.done_at >= $2 AND c.done_at < $3))
        GROUP BY c.id`, [uid, range.a, range.b])).rows;
    for (const c of commits) {
      const own = openText(c.theme_enc);
      const ids = own ? [own] : c.tagged;
      const made = c.created_at >= range.a && c.created_at < range.b;
      const done = c.status === 'done' && c.done_at && c.done_at >= range.a && c.done_at < range.b;
      for (const id of ids) { const r = row(id); if (made) r.made += 1; if (done) r.done += 1; }
    }
    const goals = (await pool.query(`SELECT id, theme_enc FROM self_goals WHERE user_id = $1 AND archived_at IS NULL`, [uid])).rows;
    const themeOfGoal = new Map(goals.map((g) => [g.id, openText(g.theme_enc)]).filter(([, t]) => t));
    for (const t of themeOfGoal.values()) row(t).goals += 1;
    if (themeOfGoal.size) {
      for (const r of (await pool.query(
        `SELECT goal_id, status FROM self_checkins WHERE goal_id = ANY($1::uuid[]) AND week >= $2::date AND week < $3::date`, [[...themeOfGoal.keys()], range.da, range.db])).rows) {
        const t = row(themeOfGoal.get(r.goal_id));
        if (r.status === 'achieved') t.achieved += 1; else if (r.status === 'progress') t.progress += 1; else t.notYet += 1;
      }
    }
    const themes = [...acc.entries()]
      .filter(([id, v]) => THEME_BY_ID.has(id) && Object.entries(v).some(([k, n]) => k !== 'goals' && n > 0)) // « goals » seul ne suffit pas à ouvrir un mois
      .map(([id, v]) => ({ ...themeCard(THEME_BY_ID.get(id)), ...v }))
      .sort((a, b) => THEMES.findIndex((t) => t.id === a.id) - THEMES.findIndex((t) => t.id === b.id));
    return reply.header('cache-control', 'private, no-store').send({ month, months, themes, themesEnabled: await themesOn() });
  });
}
