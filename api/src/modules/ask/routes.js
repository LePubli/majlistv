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
const entrySchema = z.object({ id: z.string().uuid(), qid: z.string().uuid() });
const HISTORY = 30; // derniers échanges d'un membre sur une conférence

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
    const saved = (await pool.query(
      `INSERT INTO ask_log(user_id, talk_id, question, status, answer, sources, lang, model, tokens_in, tokens_out) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10) RETURNING id`,
      [uid, id, question, res.status, res.answer, JSON.stringify(res.sources), wanted, cfg.model, out.tokensIn, out.tokensOut])).rows[0];
    return { ...res, id: saved.id, remaining: Math.max(0, u.remaining - 1), dailyMax: u.dailyMax };
  });

  // --- Historique du membre sur cette conférence (ses 30 derniers échanges, du plus ancien au plus récent)
  app.get('/talks/:id/ask/history', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const { rows } = await pool.query(
      `SELECT id, question, status, answer, sources, created_at AS "createdAt", (reported_at IS NOT NULL) AS reported FROM (
         SELECT * FROM ask_log WHERE user_id = $1 AND talk_id = $2 ORDER BY created_at DESC LIMIT ${HISTORY}) x ORDER BY created_at`, [req.user.sub, id]);
    return { items: rows };
  });

  // --- Signaler une réponse (la sienne seulement) : elle apparaît dans Admin → Questions IA
  app.post('/talks/:id/ask/:qid/report', { preHandler: app.authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id, qid } = entrySchema.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().max(300).default('') }).parse(req.body ?? {});
    const r = await pool.query(
      'UPDATE ask_log SET reported_at = COALESCE(reported_at, now()), report_reason = $4, reviewed_at = NULL, reviewed_by = NULL WHERE id = $1 AND user_id = $2 AND talk_id = $3',
      [qid, req.user.sub, id, reason]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Réponse introuvable' });
    return reply.code(204).send();
  });

  // --- Supprimer un de ses échanges
  app.delete('/talks/:id/ask/:qid', auth, async (req, reply) => {
    const { id, qid } = entrySchema.parse(req.params);
    await pool.query('DELETE FROM ask_log WHERE id = $1 AND user_id = $2 AND talk_id = $3', [qid, req.user.sub, id]);
    return reply.code(204).send();
  });

  // --- Équipe (administrateur) : file des réponses signalées, historique général, coût
  //   GET /admin/ask?filter=reported|all|refused|answered     liste (100 dernières)
  //   GET /admin/ask/stats                                    volumes, jetons, répartition
  //   PUT /admin/ask/:qid/review  { action: 'ok' | 'delete' }  « ok » = traité (sort de la file) ; « delete » = supprime l'échange
  const adminOnly = { preHandler: app.requireRole('admin') };
  const FILTERS = { reported: 'a.reported_at IS NOT NULL AND a.reviewed_at IS NULL', all: 'true', refused: "a.status <> 'answered'", answered: "a.status = 'answered'" };
  app.get('/admin/ask', adminOnly, async (req) => {
    const q = z.object({ filter: z.enum(['reported', 'all', 'refused', 'answered']).default('reported') }).parse(req.query ?? {});
    const { rows } = await pool.query(
      `SELECT a.id, a.question, a.status, a.answer, a.sources, a.model, a.tokens_in AS "tokensIn", a.tokens_out AS "tokensOut", a.created_at AS "createdAt",
              a.reported_at AS "reportedAt", a.report_reason AS "reportReason", a.reviewed_at AS "reviewedAt",
              a.talk_id AS "talkId", t.title AS "talkTitle", u.name AS "userName", u.email AS "userEmail"
         FROM ask_log a JOIN talks t ON t.id = a.talk_id JOIN users u ON u.id = a.user_id
        WHERE ${FILTERS[q.filter]} ORDER BY COALESCE(a.reported_at, a.created_at) DESC LIMIT 100`);
    const open = (await pool.query('SELECT count(*)::int AS n FROM ask_log WHERE reported_at IS NOT NULL AND reviewed_at IS NULL')).rows[0].n;
    return { filter: q.filter, items: rows, reportedOpen: open };
  });

  app.get('/admin/ask/stats', adminOnly, async () => {
    const win = async (interval) => {
      const r = (await pool.query(
        `SELECT count(*)::int AS questions, count(*) FILTER (WHERE status = 'answered')::int AS answered, count(*) FILTER (WHERE status <> 'answered')::int AS refused,
                count(DISTINCT user_id)::int AS members, COALESCE(sum(tokens_in), 0)::bigint AS tin, COALESCE(sum(tokens_out), 0)::bigint AS tout
           FROM ask_log WHERE created_at >= ${interval}`)).rows[0];
      return { questions: r.questions, answered: r.answered, refused: r.refused, members: r.members, tokensIn: Number(r.tin), tokensOut: Number(r.tout) };
    };
    const [today, week, month] = await Promise.all([win(DAY_START), win("now() - interval '7 days'"), win("now() - interval '30 days'")]);
    const [byModel, byStatus, topTalks, open, cfg, dailyMax, globalMax] = await Promise.all([
      pool.query("SELECT model, count(*)::int AS questions, COALESCE(sum(tokens_in), 0)::bigint AS tin, COALESCE(sum(tokens_out), 0)::bigint AS tout FROM ask_log WHERE created_at >= now() - interval '30 days' GROUP BY model ORDER BY questions DESC"),
      pool.query("SELECT status, count(*)::int AS n FROM ask_log WHERE created_at >= now() - interval '30 days' GROUP BY status"),
      pool.query("SELECT a.talk_id AS id, t.title, count(*)::int AS n FROM ask_log a JOIN talks t ON t.id = a.talk_id WHERE a.created_at >= now() - interval '30 days' GROUP BY a.talk_id, t.title ORDER BY n DESC LIMIT 5"),
      pool.query('SELECT count(*)::int AS n FROM ask_log WHERE reported_at IS NOT NULL AND reviewed_at IS NULL'),
      askConfig(), getNumber('ask_daily_max'), getNumber('ask_global_daily_max'),
    ]);
    return {
      today, week, month, reportedOpen: open.rows[0].n,
      engine: { provider: cfg.provider, model: cfg.model, ready: Boolean(cfg.key) },
      limits: { dailyMax, globalDailyMax: globalMax },
      byModel: byModel.rows.map((r) => ({ model: r.model, questions: r.questions, tokensIn: Number(r.tin), tokensOut: Number(r.tout) })),
      byStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, r.n])),
      topTalks: topTalks.rows,
    };
  });

  app.put('/admin/ask/:qid/review', adminOnly, async (req, reply) => {
    const { qid } = z.object({ qid: z.string().uuid() }).parse(req.params);
    const { action } = z.object({ action: z.enum(['ok', 'delete']) }).parse(req.body ?? {});
    if (action === 'delete') {
      const r = await pool.query('DELETE FROM ask_log WHERE id = $1', [qid]);
      return r.rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Échange introuvable' });
    }
    const r = await pool.query('UPDATE ask_log SET reviewed_at = now(), reviewed_by = $2 WHERE id = $1', [qid, req.user.sub]);
    return r.rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Échange introuvable' });
  });
}
