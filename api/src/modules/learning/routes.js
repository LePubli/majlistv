// Apprentissage : tableau de bord du membre (palier « Apprentissage ») et attestations de suivi.
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';
import { hasLearningTier } from '../../access.js';
import { getSetting } from '../../settings.js';
import { BADGES, FLOOR, DECAY_DAYS, attemptsOf, seriesProgress, badgesOf, scoreAt, curveOf } from '../../learning.js';

export default async function learningRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });

  app.get('/me/learning', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const attempts = await attemptsOf(req.user.sub);
    const series = await seriesProgress(req.user.sub, attempts);
    const got = badgesOf(attempts, series);
    const { score, quizzes } = scoreAt(attempts);
    const att = (await pool.query('SELECT series_id, code, issued_at FROM attestations WHERE user_id = $1', [req.user.sub])).rows;
    const passedTalks = new Set(attempts.filter((a) => a.passed).map((a) => a.talk_id));
    return {
      score, quizzesTaken: quizzes, quizzesPassed: passedTalks.size,
      decay: { floor: FLOOR, days: DECAY_DAYS },
      curve: curveOf(attempts),
      badges: BADGES.map((id) => ({ id, earned: Boolean(got[id]), earnedAt: got[id] || null })),
      series: await Promise.all(series.map(async (s) => ({
        id: s.id, title: s.title, speaker: s.speaker, posterUrl: s.poster_key ? await presignGet(s.poster_key) : null,
        total: s.total, passed: s.passed, complete: s.complete, average: s.average,
        attestation: att.find((x) => x.series_id === s.id) ? { code: att.find((x) => x.series_id === s.id).code, issuedAt: att.find((x) => x.series_id === s.id).issued_at } : null,
      }))),
      recent: attempts.slice(-8).reverse().map((a) => ({ talkId: a.talk_id, title: a.title, percent: a.percent, passed: a.passed, at: a.created_at })),
    };
  });

  // Délivre l'attestation d'une série dont tous les quiz sont réussis (une seule par série et par membre).
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
