// Quiz de compréhension : côté Studio (étape 24.2).
// Les questions sont proposées par l'IA (service translator, à partir de la transcription) ou saisies à la main,
// puis relues et validées par un humain : seules les questions « validées » seront proposées au public (étape 24.3).
// Chaque question est rattachée à un passage précis : minute, chapitre et extrait mot pour mot de la transcription.
import { z } from 'zod';
import { pool } from '../../db.js';
import { getSetting, getNumber, isOn } from '../../settings.js';
import { visibleSql } from '../../visibility.js';
import { hasLearningTier } from '../../access.js';
import { viaChannel } from '../../channelAccess.js'; // droits par chaîne (propriétaire et éditeurs)
import { learningBrief } from '../../learning.js';
import { recordAttempt } from '../../revision.js';
import { featureOn } from '../../features.js';

const idSchema = z.object({ id: z.string().uuid() });
const qidSchema = z.object({ qid: z.string().uuid() });
const MAX_MS = 48 * 3600 * 1000;

const optionsSchema = z.array(z.string().trim().min(1).max(300)).min(3).max(4);
const baseQuestion = {
  question: z.string().trim().min(5).max(500),
  options: optionsSchema,
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(1000),
  evidenceMs: z.number().int().min(0).max(MAX_MS).nullable(),
  evidenceQuote: z.string().trim().max(1500),
};
const createBody = z.object({ ...baseQuestion, explanation: baseQuestion.explanation.default(''), evidenceMs: baseQuestion.evidenceMs.default(null), evidenceQuote: baseQuestion.evidenceQuote.default('') });
const patchBody = z.object({
  ...Object.fromEntries(Object.entries(baseQuestion).map(([k, v]) => [k, v.optional()])),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });

// Réponses cohérentes : pas de doublon, bonne réponse présente.
function checkOptions(options, correctIndex) {
  const norm = options.map((o) => o.toLowerCase().replace(/\s+/g, ' '));
  if (new Set(norm).size !== norm.length) return 'Deux réponses sont identiques';
  if (correctIndex >= options.length) return 'La bonne réponse doit faire partie des réponses proposées';
  return null;
}

const shape = (r) => ({
  id: r.id, talkId: r.talk_id, lang: r.lang, question: r.question, options: r.options, correctIndex: r.correct_index,
  explanation: r.explanation, evidenceMs: r.evidence_ms, evidenceQuote: r.evidence_quote,
  chapterMs: r.chapter_ms, chapterTitle: r.chapter_title, origin: r.origin, status: r.status,
  reviewedAt: r.reviewed_at, createdAt: r.created_at,
  reports: r.reports ?? 0, reportReasons: r.report_reasons ?? [],
  ...(r.talk_title !== undefined ? { talkTitle: r.talk_title } : {}),
});


// Quiz proposé au public pour cette conférence ? (activé + assez de questions validées). Sert aussi à la fiche conférence.
export async function quizInfo(talkId) {
  const min = await getNumber('quiz_min_questions');
  const { rows } = await pool.query(
    `SELECT t.quiz_enabled, (SELECT count(*)::int FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved') AS n FROM talks t WHERE t.id = $1`, [talkId]);
  const r = rows[0];
  if (!r) return { available: false, count: 0 };
  if (!(await featureOn('quiz'))) return { available: false, count: r.n }; // fonction coupée dans Admin → Fonctions
  const enabled = r.quiz_enabled ?? isOn(await getSetting('quiz_default_enabled'));
  return { available: enabled && r.n >= min, count: r.n };
}

export default async function quizRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const sourceOf = (t) => t.transcript_language || t.language;

  async function ownedTalk(req, reply, id) {
    const { rows } = await pool.query(
      `SELECT id, organizer_id, title, transcript_status, transcript_language, language, quiz_enabled FROM talks WHERE id = $1`, [id]);
    const t = rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) {
      reply.code(404).send({ error: 'Conférence introuvable' });
      return null;
    }
    return t;
  }

  // Question appartenant à l'utilisateur (ou n'importe laquelle pour un admin).
  async function ownedQuestion(req, reply, qid) {
    const { rows } = await pool.query(
      `SELECT q.*, t.organizer_id, t.transcript_language, t.language AS talk_language FROM quiz_questions q JOIN talks t ON t.id = q.talk_id WHERE q.id = $1`, [qid]);
    const q = rows[0];
    if (!q || (req.user.role !== 'admin' && q.organizer_id !== req.user.sub && !(await viaChannel(req.user, q.talk_id)))) {
      reply.code(404).send({ error: 'Question introuvable' });
      return null;
    }
    return q;
  }

  // Chapitre qui contient cette minute (résumé de la langue de la conférence).
  async function chapterAt(talkId, lang, ms) {
    if (ms == null) return { ms: null, title: '' };
    const { rows } = await pool.query(
      `SELECT chapters FROM talk_insights WHERE talk_id = $1 AND status = 'ready' ORDER BY (lang = $2) DESC, lang LIMIT 1`, [talkId, lang]);
    let found = null;
    for (const c of rows[0]?.chapters || []) if (c.ms <= ms && (!found || c.ms >= found.ms)) found = c;
    return found ? { ms: found.ms, title: found.title } : { ms: null, title: '' };
  }

  async function limits() {
    return {
      min: await getNumber('quiz_min_questions'), max: await getNumber('quiz_max_questions'),
      passPercent: await getNumber('quiz_pass_percent'), generateCount: await getNumber('quiz_generate_count'),
    };
  }

  const approvedCount = async (talkId, exceptId = null) =>
    (await pool.query(`SELECT count(*)::int AS n FROM quiz_questions WHERE talk_id = $1 AND status = 'approved' AND ($2::uuid IS NULL OR id <> $2)`, [talkId, exceptId])).rows[0].n;

  // Une question n'est validable que complète : réponse justifiée par l'intervenant, à une minute précise.
  function approvable(q, max, approved) {
    if (!q.explanation?.trim()) return "Ajoutez l'explication : pourquoi c'est la bonne réponse, d'après l'intervenant";
    if (q.evidence_ms == null) return 'Indiquez la minute de la vidéo où la réponse est donnée';
    if (approved >= max) return `Un quiz contient ${max} questions au maximum`;
    return null;
  }

  // ------------------------------------------------------------------ État du quiz d'une conférence
  app.get('/talks/:id/studio/quiz', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const [qs, job, lim, def] = await Promise.all([
      pool.query(`SELECT q.*, (SELECT count(*)::int FROM quiz_reports r WHERE r.question_id = q.id AND r.resolved_at IS NULL) AS reports, (SELECT COALESCE(array_agg(r.reason) FILTER (WHERE r.reason <> ''), '{}') FROM quiz_reports r WHERE r.question_id = q.id AND r.resolved_at IS NULL) AS report_reasons FROM quiz_questions q WHERE q.talk_id = $1 ORDER BY q.evidence_ms NULLS LAST, q.created_at, q.id`, [id]),
      pool.query('SELECT status, wanted, produced, dropped, error, updated_at FROM quiz_jobs WHERE talk_id = $1', [id]),
      limits(), getSetting('quiz_default_enabled'),
    ]);
    const questions = qs.rows.map(shape);
    const approved = questions.filter((q) => q.status === 'approved').length;
    const j = job.rows[0];
    return {
      lang: sourceOf(t), transcriptReady: t.transcript_status === 'ready',
      override: t.quiz_enabled, defaultEnabled: isOn(def), enabled: t.quiz_enabled ?? isOn(def),
      ...lim, approved, drafts: questions.filter((q) => q.status === 'draft').length,
      ready: approved >= lim.min,
      job: j ? { status: j.status, wanted: j.wanted, produced: j.produced, dropped: j.dropped, error: j.error, updatedAt: j.updated_at } : null,
      questions,
    };
  });

  // Activer / désactiver le quiz pour cette conférence (null = suivre le réglage du site).
  app.put('/talks/:id/studio/quiz/settings', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean().nullable() }).parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    await pool.query('UPDATE talks SET quiz_enabled = $2 WHERE id = $1', [id, enabled]);
    return { ok: true, override: enabled, enabled: enabled ?? isOn(await getSetting('quiz_default_enabled')) };
  });

  // ------------------------------------------------------------------ Génération (reprise par le service translator)
  app.post('/talks/:id/studio/quiz/generate', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ count: z.number().int().min(3).max(15).optional() }).parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    if (t.transcript_status !== 'ready') return reply.code(409).send({ error: "La transcription n'est pas encore prête", code: 'not_ready' });
    const lim = await limits();
    if ((await approvedCount(id)) >= lim.max) return reply.code(409).send({ error: `Le quiz a déjà ${lim.max} questions validées`, code: 'full' });
    const cur = (await pool.query('SELECT status FROM quiz_jobs WHERE talk_id = $1', [id])).rows[0];
    if (cur && ['pending', 'processing'].includes(cur.status)) return reply.code(409).send({ error: 'Une génération est déjà en cours', code: 'busy' });
    await pool.query(
      `INSERT INTO quiz_jobs(talk_id, lang, status, wanted) VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (talk_id) DO UPDATE SET lang = EXCLUDED.lang, status = 'pending', wanted = EXCLUDED.wanted, produced = 0, dropped = 0,
         error = NULL, attempts = 0, created_at = now(), updated_at = now()`,
      [id, sourceOf(t), b.count ?? lim.generateCount]);
    return reply.code(202).send({ ok: true });
  });

  // ------------------------------------------------------------------ Questions
  app.post('/talks/:id/studio/quiz/questions', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = createBody.parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const bad = checkOptions(b.options, b.correctIndex);
    if (bad) return reply.code(400).send({ error: bad });
    const lang = sourceOf(t);
    const ch = await chapterAt(id, lang, b.evidenceMs);
    const { rows } = await pool.query(
      `INSERT INTO quiz_questions(talk_id, lang, question, options, correct_index, explanation, evidence_ms, evidence_quote, chapter_ms, chapter_title, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual') RETURNING *`,
      [id, lang, b.question, JSON.stringify(b.options), b.correctIndex, b.explanation, b.evidenceMs, b.evidenceQuote, ch.ms, ch.title]);
    return reply.code(201).send(shape(rows[0]));
  });

  app.patch('/studio/quiz/questions/:qid', organizer, async (req, reply) => {
    const { qid } = qidSchema.parse(req.params);
    const b = patchBody.parse(req.body ?? {});
    const q = await ownedQuestion(req, reply, qid);
    if (!q) return;
    const next = {
      question: b.question ?? q.question, options: b.options ?? q.options, correct_index: b.correctIndex ?? q.correct_index,
      explanation: b.explanation ?? q.explanation, evidence_ms: b.evidenceMs !== undefined ? b.evidenceMs : q.evidence_ms,
      evidence_quote: b.evidenceQuote ?? q.evidence_quote, status: b.status ?? q.status,
    };
    const bad = checkOptions(next.options, next.correct_index);
    if (bad) return reply.code(400).send({ error: bad });
    const lim = await limits();
    if (next.status === 'approved') {
      const why = approvable(next, lim.max, q.status === 'approved' ? 0 : await approvedCount(q.talk_id, qid));
      if (why) return reply.code(why.startsWith('Un quiz contient') ? 409 : 400).send({ error: why });
    }
    const ch = b.evidenceMs !== undefined ? await chapterAt(q.talk_id, q.lang, next.evidence_ms) : { ms: q.chapter_ms, title: q.chapter_title };
    const reviewed = next.status !== q.status;
    await pool.query('UPDATE quiz_reports SET resolved_at = now() WHERE question_id = $1 AND resolved_at IS NULL', [qid]); // la question a été relue
    const { rows } = await pool.query(
      `UPDATE quiz_questions SET question = $2, options = $3, correct_index = $4, explanation = $5, evidence_ms = $6, evidence_quote = $7,
              chapter_ms = $8, chapter_title = $9, status = $10,
              reviewed_by = CASE WHEN $11 THEN $12::uuid ELSE reviewed_by END, reviewed_at = CASE WHEN $11 THEN now() ELSE reviewed_at END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [qid, next.question, JSON.stringify(next.options), next.correct_index, next.explanation, next.evidence_ms, next.evidence_quote, ch.ms, ch.title, next.status, reviewed, req.user.sub]);
    return shape(rows[0]);
  });

  app.delete('/studio/quiz/questions/:qid', organizer, async (req, reply) => {
    const { qid } = qidSchema.parse(req.params);
    const q = await ownedQuestion(req, reply, qid);
    if (!q) return;
    await pool.query('DELETE FROM quiz_questions WHERE id = $1', [qid]);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ File de relecture : toutes les questions à valider
  app.get('/studio/quiz/review', organizer, async (req) => {
    const { rows } = await pool.query(
      `SELECT q.*, t.title AS talk_title, (SELECT count(*)::int FROM quiz_reports r WHERE r.question_id = q.id AND r.resolved_at IS NULL) AS reports, (SELECT COALESCE(array_agg(r.reason) FILTER (WHERE r.reason <> ''), '{}') FROM quiz_reports r WHERE r.question_id = q.id AND r.resolved_at IS NULL) AS report_reasons
         FROM quiz_questions q JOIN talks t ON t.id = q.talk_id
        WHERE (q.status = 'draft' OR (q.status = 'approved' AND EXISTS (SELECT 1 FROM quiz_reports r WHERE r.question_id = q.id AND r.resolved_at IS NULL)))
          AND ($1::boolean OR t.organizer_id = $2)
        ORDER BY t.title, q.talk_id, q.evidence_ms NULLS LAST, q.created_at LIMIT 300`, [req.user.role === 'admin', req.user.sub]);
    return { questions: rows.map(shape), ...(await limits()) };
  });

  // Signalement jugé sans suite : il disparaît de la file de relecture.
  app.post('/studio/quiz/questions/:qid/reports/dismiss', organizer, async (req, reply) => {
    const { qid } = qidSchema.parse(req.params);
    const q = await ownedQuestion(req, reply, qid);
    if (!q) return;
    await pool.query('UPDATE quiz_reports SET resolved_at = now() WHERE question_id = $1 AND resolved_at IS NULL', [qid]);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Public : passer le quiz (étape 24.3)
  // Conférence visible par le public dont le quiz est proposé ; sinon 404 (les réponses ne sont jamais envoyées avant la correction).
  async function publicQuiz(talkId) {
    const ok = (await pool.query(`SELECT 1 FROM talks t WHERE t.id = $1 AND ${visibleSql('t')}`, [talkId])).rowCount;
    if (!ok || !(await quizInfo(talkId)).available) return null;
    const { rows } = await pool.query(
      `SELECT id, question, options, correct_index, explanation, evidence_ms, chapter_ms, chapter_title
         FROM quiz_questions WHERE talk_id = $1 AND status = 'approved' ORDER BY evidence_ms NULLS LAST, created_at, id`, [talkId]);
    return rows;
  }
  const lastAttempt = async (userId, talkId) => {
    const { rows } = await pool.query(
      `SELECT percent, passed, created_at AS "at", (SELECT max(percent) FROM quiz_attempts WHERE user_id = $1 AND talk_id = $2) AS best,
              EXISTS (SELECT 1 FROM quiz_attempts WHERE user_id = $1 AND talk_id = $2 AND passed) AS "everPassed"
         FROM quiz_attempts WHERE user_id = $1 AND talk_id = $2 ORDER BY created_at DESC LIMIT 1`, [userId, talkId]);
    return rows[0] || null;
  };

  app.get('/talks/:id/quiz', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const qs = await publicQuiz(id);
    if (!qs) return reply.code(404).send({ error: "Cette conférence n'a pas de quiz" });
    const viewer = await app.optionalUser(req);
    return {
      passPercent: await getNumber('quiz_pass_percent'),
      questions: qs.map((q) => ({ id: q.id, question: q.question, options: q.options, chapterMs: q.chapter_ms, chapterTitle: q.chapter_title })),
      last: viewer ? await lastAttempt(viewer.sub, id) : null,
    };
  });

  const submitBody = z.object({ answers: z.array(z.object({ questionId: z.string().uuid(), index: z.number().int().min(0).max(3) })).max(20) });
  app.post('/talks/:id/quiz/submit', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = submitBody.parse(req.body ?? {});
    const qs = await publicQuiz(id);
    if (!qs) return reply.code(404).send({ error: "Cette conférence n'a pas de quiz" });
    const chosen = new Map(b.answers.map((a) => [a.questionId, a.index]));
    const results = qs.map((q) => {
      const index = chosen.has(q.id) ? chosen.get(q.id) : null;
      return { questionId: q.id, chosen: index, correct: index === q.correct_index, correctIndex: q.correct_index, explanation: q.explanation, evidenceMs: q.evidence_ms, chapterTitle: q.chapter_title };
    });
    const score = results.filter((r) => r.correct).length;
    const total = qs.length;
    const percent = Math.round((100 * score) / total);
    const passPercent = await getNumber('quiz_pass_percent');
    const passed = percent >= passPercent;
    const viewer = await app.optionalUser(req);
    let best = null;
    let learning = null; // palier Apprentissage : score global et badges gagnés grâce à cette tentative
    if (viewer) {
      const tracked = await hasLearningTier(viewer.sub);
      const before = tracked ? await learningBrief(viewer.sub) : null;
      await pool.query(
        'INSERT INTO quiz_attempts(user_id, talk_id, score, total, percent, passed, answers) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [viewer.sub, id, score, total, percent, passed, JSON.stringify(results.map((r) => ({ questionId: r.questionId, index: r.chosen, correct: r.correct })))]);
      best = (await lastAttempt(viewer.sub, id))?.best ?? percent;
      if (tracked) {
        const after = await learningBrief(viewer.sub);
        const review = await recordAttempt(viewer.sub, id, passed, percent); // calendrier J+1 / J+3 / J+7 / J+21
        learning = { score: after.score, previousScore: before.score, newBadges: after.badges.filter((b) => !before.badges.includes(b)), review };
      }
    }
    return { score, total, percent, passed, passPercent, best, saved: Boolean(viewer), learning, results };
  });

  // « Signaler cette question » (membre ou visiteur).
  app.post('/talks/:id/quiz/questions/:qid/report', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { qid } = qidSchema.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().max(300).default('') }).parse(req.body ?? {});
    const qs = await publicQuiz(id);
    if (!qs || !qs.some((q) => q.id === qid)) return reply.code(404).send({ error: 'Question introuvable' });
    const viewer = await app.optionalUser(req);
    await pool.query('INSERT INTO quiz_reports(question_id, user_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [qid, viewer?.sub ?? null, reason]);
    return reply.code(204).send();
  });
}
