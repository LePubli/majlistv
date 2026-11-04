// Apprentissage : tableau de bord du membre (palier « Apprentissage ») et attestations de suivi.
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';
import { hasLearningTier } from '../../access.js';
import { getSetting } from '../../settings.js';
import { FLOOR, DECAY_DAYS, attemptsOf, seriesProgress, scoreAt, curveOf } from '../../learning.js';
import { streakSummary, goalOf, parisToday } from '../../learningStreak.js';
import { planWindow, windowOk, dayAllowed, isDay } from '../../learningPlan.js';

export default async function learningRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });

  app.get('/me/learning', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const attempts = await attemptsOf(req.user.sub);
    const series = await seriesProgress(req.user.sub, attempts);
    const { score, quizzes } = scoreAt(attempts);
    const att = (await pool.query('SELECT series_id, code, issued_at FROM attestations WHERE user_id = $1', [req.user.sub])).rows;
    const passedTalks = new Set(attempts.filter((a) => a.passed).map((a) => a.talk_id));
    return {
      score, quizzesTaken: quizzes, quizzesPassed: passedTalks.size,
      decay: { floor: FLOOR, days: DECAY_DAYS },
      curve: curveOf(attempts),
      series: await Promise.all(series.map(async (s) => ({
        id: s.id, title: s.title, speaker: s.speaker, posterUrl: s.poster_key ? await presignGet(s.poster_key) : null,
        total: s.total, passed: s.passed, complete: s.complete, average: s.average,
        attestation: att.find((x) => x.series_id === s.id) ? { code: att.find((x) => x.series_id === s.id).code, issuedAt: att.find((x) => x.series_id === s.id).issued_at } : null,
      }))),
      recent: attempts.slice(-8).reverse().map((a) => ({ talkId: a.talk_id, title: a.title, percent: a.percent, passed: a.passed, at: a.created_at })),
    };
  });

  // ─── Planning de révisions (étape 1) ───
  const dayS = z.string().refine(isDay, 'Date invalide (AAAA-MM-JJ)');
  const MAX_ITEMS_PER_DAY = 20;

  // Fenêtre de planning : révisions automatiques + séances choisies + jours de repos + jours déjà faits.
  app.get('/me/learning/plan', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const q = z.object({ from: dayS, to: dayS }).parse(req.query);
    if (!windowOk(q.from, q.to)) return reply.code(400).send({ error: 'Fenêtre de dates invalide (62 jours au plus)' });
    return planWindow(req.user.sub, q.from, q.to);
  });

  // Ajoute une séance : une vidéo à regarder, un quiz à passer, ou une note libre.
  app.post('/me/learning/plan', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const b = z.object({
      day: dayS, kind: z.enum(['video', 'quiz', 'custom']), talkId: z.string().uuid().optional(), note: z.string().trim().max(120).optional(),
    }).parse(req.body ?? {});
    const today = await parisToday();
    if (!dayAllowed(b.day, today)) return reply.code(400).send({ error: "Choisissez un jour entre aujourd'hui et dans un an" });
    if (b.kind === 'custom' && !b.note) return reply.code(400).send({ error: 'Écrivez ce que vous voulez faire' });
    if (b.kind !== 'custom') {
      if (!b.talkId) return reply.code(400).send({ error: 'Choisissez une vidéo' });
      const ok = (await pool.query(`SELECT 1 FROM talks WHERE id = $1 AND video_status = 'ready'`, [b.talkId])).rowCount;
      if (!ok) return reply.code(404).send({ error: 'Vidéo introuvable' });
    }
    const n = (await pool.query('SELECT count(*)::int AS n FROM learning_plan_items WHERE user_id = $1 AND day = $2', [req.user.sub, b.day])).rows[0].n;
    if (n >= MAX_ITEMS_PER_DAY) return reply.code(409).send({ error: 'Cette journée est déjà bien remplie', code: 'day_full' });
    const { rows } = await pool.query(
      `INSERT INTO learning_plan_items(user_id, day, kind, talk_id, note) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, day::text AS day, kind, talk_id AS "talkId", note, false AS done`,
      [req.user.sub, b.day, b.kind, b.kind === 'custom' ? null : b.talkId, b.note ?? '']);
    // Une séance posée sur un jour de repos annule ce repos : le membre a changé d'avis.
    await pool.query('DELETE FROM learning_rest_days WHERE user_id = $1 AND day = $2', [req.user.sub, b.day]);
    return reply.code(201).send(rows[0]);
  });

  // Déplace une séance, la coche comme faite (ou la décoche), ou change sa note.
  app.patch('/me/learning/plan/:id', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ day: dayS.optional(), done: z.boolean().optional(), note: z.string().trim().max(120).optional() })
      .refine((x) => x.day !== undefined || x.done !== undefined || x.note !== undefined, 'Rien à modifier').parse(req.body ?? {});
    const cur = (await pool.query('SELECT kind FROM learning_plan_items WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Séance introuvable' });
    if (b.day !== undefined) {
      const today = await parisToday();
      if (!dayAllowed(b.day, today)) return reply.code(400).send({ error: "Choisissez un jour entre aujourd'hui et dans un an" });
    }
    if (b.note !== undefined && cur.kind === 'custom' && !b.note) return reply.code(400).send({ error: 'La note ne peut pas être vide' });
    const { rows } = await pool.query(
      `UPDATE learning_plan_items SET day = COALESCE($3::date, day), note = COALESCE($4, note),
              done_at = CASE WHEN $5::boolean IS NULL THEN done_at WHEN $5 THEN COALESCE(done_at, now()) ELSE NULL END
        WHERE id = $1 AND user_id = $2
        RETURNING id, day::text AS day, kind, talk_id AS "talkId", note, (done_at IS NOT NULL) AS done`,
      [id, req.user.sub, b.day ?? null, b.note ?? null, b.done ?? null]);
    if (b.day !== undefined) await pool.query('DELETE FROM learning_rest_days WHERE user_id = $1 AND day = $2', [req.user.sub, b.day]);
    return rows[0];
  });

  app.delete('/me/learning/plan/:id', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await pool.query('DELETE FROM learning_plan_items WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    return reply.code(204).send();
  });

  // Marque (ou retire) un jour de repos. Un jour de repos n'efface pas les séances déjà posées ce jour-là : on refuse plutôt.
  app.put('/me/learning/plan/rest', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const b = z.object({ day: dayS, rest: z.boolean() }).parse(req.body ?? {});
    const today = await parisToday();
    if (!dayAllowed(b.day, today)) return reply.code(400).send({ error: "Choisissez un jour entre aujourd'hui et dans un an" });
    if (b.rest) {
      const n = (await pool.query('SELECT count(*)::int AS n FROM learning_plan_items WHERE user_id = $1 AND day = $2', [req.user.sub, b.day])).rows[0].n;
      if (n > 0) return reply.code(409).send({ error: 'Il y a déjà des séances ce jour-là : déplacez-les ou supprimez-les d\'abord', code: 'day_not_empty' });
      await pool.query('INSERT INTO learning_rest_days(user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.sub, b.day]);
    } else {
      await pool.query('DELETE FROM learning_rest_days WHERE user_id = $1 AND day = $2', [req.user.sub, b.day]);
    }
    return { day: b.day, rest: b.rest };
  });

  // Délivre l'attestation d'une série dont tous les quiz sont réussis (une seule par série et par membre).
  // Série de jours et objectif de la semaine (aucun badge pour les adultes).
  app.get('/me/learning/streak', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    return streakSummary(req.user.sub);
  });

  // Réglage de l'objectif (jours actifs visés par semaine, 1 à 7) et affichage de la série (masquable).
  app.put('/me/learning/goal', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const b = z.object({ goal: z.number().int().min(1).max(7).optional(), show: z.boolean().optional() }).refine((x) => x.goal !== undefined || x.show !== undefined, 'Rien à modifier').parse(req.body);
    const cur = await goalOf(req.user.sub);
    await pool.query(
      `INSERT INTO learning_goals(user_id, weekly_goal, show) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET weekly_goal = EXCLUDED.weekly_goal, show = EXCLUDED.show, updated_at = now()`,
      [req.user.sub, b.goal ?? cur.goal, b.show ?? cur.show]);
    return streakSummary(req.user.sub);
  });

  app.post('/me/learning/attestations', auth, async (req, reply) => {
    const { seriesId } = z.object({ seriesId: z.string().uuid() }).parse(req.body ?? {});
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const attempts = await attemptsOf(req.user.sub);
    const s = (await seriesProgress(req.user.sub, attempts)).find((x) => x.id === seriesId);
    if (!s) return reply.code(404).send({ error: 'Série introuvable' });
    if (!s.complete) return reply.code(409).send({ error: `Il reste ${s.total - s.passed} quiz à réussir dans cette série`, code: 'incomplete' });
    const exist = (await pool.query('SELECT code FROM attestations WHERE user_id = $1 AND series_id = $2', [req.user.sub, seriesId])).rows[0];
    const web = await getSetting('web_url');
    if (exist) return { code: exist.code, url: `${web}/attestation/${exist.code}`, created: false };
    const u = (await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const holder = (u.name || '').trim() || u.email.split('@')[0];
    const code = crypto.randomBytes(9).toString('base64url'); // 12 caractères, impossible à deviner
    await pool.query(
      `INSERT INTO attestations(code, user_id, series_id, holder, snapshot) VALUES ($1, $2, $3, $4, $5)`,
      [code, req.user.sub, seriesId, holder, JSON.stringify({ seriesTitle: s.title, speaker: s.speaker, quizzes: s.total, average: s.average })]);
    return reply.code(201).send({ code, url: `${web}/attestation/${code}`, created: true });
  });

  // Le membre peut retirer son attestation (la page publique disparaît).
  app.delete('/me/learning/attestations/:code', auth, async (req, reply) => {
    const { code } = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/) }).parse(req.params);
    await pool.query('DELETE FROM attestations WHERE code = $1 AND user_id = $2', [code, req.user.sub]);
    return reply.code(204).send();
  });

  // Page publique de vérification : ni e-mail ni identifiant interne, seulement ce qui figure sur l'attestation.
  app.get('/attestations/:code', async (req, reply) => {
    const { code } = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/) }).parse(req.params);
    const { rows } = await pool.query('SELECT holder, snapshot, issued_at FROM attestations WHERE code = $1', [code]);
    if (!rows[0]) return reply.code(404).send({ error: 'Attestation introuvable' });
    return { code, holder: rows[0].holder, seriesTitle: rows[0].snapshot.seriesTitle, speaker: rows[0].snapshot.speaker || '',
      quizzes: rows[0].snapshot.quizzes, average: rows[0].snapshot.average, issuedAt: rows[0].issued_at };
  });
}
