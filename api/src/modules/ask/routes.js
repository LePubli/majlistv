// « Pose une question sur cette conférence » (palier Apprentissage).
//   GET  /talks/:id/ask   { available, reason?, remaining, dailyMax }  état pour le panneau
//   POST /talks/:id/ask   { question } → { status, answer, sources: [{ startMs, text }], remaining }
// L'IA ne voit que des passages de la transcription ; toute réponse sans passage cité est refusée (voir askLib.js).
// Plafonds réglables dans Admin → Paramètres → « Questions sur la conférence » : par membre et par jour, et global par jour.
import { z } from 'zod';
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { hasLearningTier } from '../../access.js';
import { visibleSql } from '../../visibility.js';
import { askConfig, askModel } from '../../askLlm.js';
import { MAX_QUESTION, buildPassages, buildPrompt, lang, selectPassages, validateAnswer } from '../../askLib.js';

const TZ = 'Europe/Paris';
const DAY_START = `(date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
const idSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ question: z.string().trim().min(3).max(MAX_QUESTION) });

export async function purgeAsk() {
  const days = Math.max(1, (await getNumber('ask_keep_days')) || 90);
  const r = await pool.query('DELETE FROM ask_log WHERE created_at < now() - ($1 || \' days\')::interval', [String(days)]);
  return r.rowCount;
}

export default async function askRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });

  const usage = async (uid) => {
    const dailyMax = Math.max(1, await getNumber('ask_daily_max'));
    const used = (await pool.query(`SELECT count(*)::int AS n FROM ask_log WHERE user_id = $1 AND created_at >= ${DAY_START}`, [uid])).rows[0].n;
    return { dailyMax, remaining: Math.max(0, dailyMax - used) };
  };

  const loadTalk = async (id) => (await pool.query(
    `SELECT t.id, t.title, t.speaker, t.transcript_language, t.transcript_status FROM talks t
      WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [id])).rows[0];

  app.get('/talks/:id/ask', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const talk = await loadTalk(id);
    if (!talk) return reply.code(404).send({ error: 'Conférence introuvable' });
    const u = await usage(req.user.sub);
    const cfg = await askConfig();
    let reason = null;
    if (talk.transcript_status !== 'ready') reason = 'no_transcript';
    else if (!cfg.key) reason = 'ask_unavailable';
    return { available: !reason, reason, ...u };
  });

  app.post('/talks/:id/ask', { preHandler: app.authenticate, config: { rateLimit: { max: Number(process.env.ASK_RATE_MAX) || 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { question } = bodySchema.parse(req.body ?? {});
    const uid = req.user.sub;
    if (!(await hasLearningTier(uid))) return required(reply);
    const talk = await loadTalk(id);
    if (!talk) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (talk.transcript_status !== 'ready') return reply.code(409).send({ error: "La transcription de cette conférence n'est pas encore prête", code: 'no_transcript' });
    const cfg = await askConfig();
    if (!cfg.key) return reply.code(503).send({ error: "L'assistant n'est pas disponible pour le moment", code: 'ask_unavailable' });

    const u = await usage(uid);
    if (u.remaining <= 0) return reply.code(429).send({ error: `Limite de ${u.dailyMax} questions par jour atteinte. Revenez demain.`, code: 'ask_quota', ...u });
    const globalMax = await getNumber('ask_global_daily_max');
    const today = (await pool.query(`SELECT count(*)::int AS n FROM ask_log WHERE created_at >= ${DAY_START}`)).rows[0].n;
    if (today >= globalMax) return reply.code(429).send({ error: "L'assistant a atteint sa limite du jour. Réessayez demain.", code: 'ask_busy', ...u });

    // Langue du texte : celle du membre si la transcription existe dans cette langue, sinon la langue d'origine, sinon la première trouvée.
    const wanted = lang((await pool.query('SELECT locale FROM users WHERE id = $1', [uid])).rows[0]?.locale);
    const langs = (await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1', [id])).rows.map((r) => r.lang);
    const useLang = langs.includes(wanted) ? wanted : langs.includes(talk.transcript_language) ? talk.transcript_language : langs[0];
    if (!useLang) return reply.code(409).send({ error: "La transcription de cette conférence n'est pas encore prête", code: 'no_transcript' });
    const segs = (await pool.query('SELECT start_ms, end_ms, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx', [id, useLang])).rows;
    const passages = buildPassages(segs);
    if (!passages.length) return reply.code(409).send({ error: "La transcription de cette conférence est vide", code: 'no_transcript' });
    const budget = Math.max(2000, await getNumber('ask_context_chars'));
    const chosen = selectPassages(passages, question, budget).passages;

    const { system, user } = buildPrompt({ title: talk.title, speaker: talk.speaker, locale: wanted, passages: chosen, question, json: cfg.provider === 'deepseek' });
    let out;
    try {
      out = await askModel({ provider: cfg.provider, key: cfg.key, model: cfg.model, system, user });
    } catch (err) {
      req.log.warn(`Assistant de conférence (${cfg.provider}) : ${err.message}`);
      return reply.code(502).send({ error: "L'assistant n'a pas pu répondre. Réessayez dans un instant (cette question n'est pas décomptée).", code: 'ask_failed' });
    }
    const res = validateAnswer(out.input, chosen, wanted);
    await pool.query(
      `INSERT INTO ask_log(user_id, talk_id, question, status, answer, sources, lang, model, tokens_in, tokens_out) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
      [uid, id, question, res.status, res.answer, JSON.stringify(res.sources), wanted, cfg.model, out.tokensIn, out.tokensOut]);
    return { ...res, remaining: Math.max(0, u.remaining - 1), dailyMax: u.dailyMax };
  });
}
