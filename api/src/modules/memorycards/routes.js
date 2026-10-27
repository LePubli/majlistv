// Cartes mémoire (palier « Apprentissage »).
//   GET  /me/cards               compteurs + séance du jour (cartes à échéance puis nouvelles, dans la limite du jour)
//   GET  /me/cards?free=1        séance libre : cartes déjà vues, même non échues (n'avance pas le calendrier)
//   POST /me/cards/:qid/answer   { known: boolean } → nouvel état de la carte
// Une carte = une question de quiz VALIDÉE (jamais de texte généré en plus). Une carte n'est proposée que pour les conférences dont le membre a déjà passé le quiz.
import { z } from 'zod';
import { pool } from '../../db.js';
import { hasLearningTier } from '../../access.js';
import { visibleSql } from '../../visibility.js';
import { getNumber } from '../../settings.js';
import { cardOf, clampInt, nextState, planSession } from '../../memoryCardsLib.js';

const TZ = 'Europe/Paris';
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;
const qidSchema = z.object({ qid: z.string().uuid() });

export default async function memoryCardsRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });

  // Questions validées des conférences visibles dont le membre a passé le quiz.
  const POOL = `FROM quiz_questions q JOIN talks t ON t.id = q.talk_id
                 WHERE q.status = 'approved' AND t.video_status = 'ready' AND ${visibleSql('t')}
                   AND EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.talk_id = q.talk_id AND a.user_id = $1)`;

  app.get('/me/cards', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const uid = req.user.sub;
    const free = req.query?.free === '1';
    const dailyMax = clampInt(await getNumber('cards_daily_max'), 1, 100, 20);
    const newMax = clampInt(await getNumber('cards_new_per_day'), 0, 50, 5);
    const cols = 'q.id, q.talk_id, q.lang, q.question, q.options, q.correct_index, q.explanation, q.evidence_quote, q.evidence_ms, q.chapter_title, t.title AS talk_title';

    const [due, fresh, counts, introduced] = await Promise.all([
      pool.query(`SELECT ${cols}, p.stage ${POOL.replace('FROM quiz_questions q', 'FROM quiz_questions q JOIN memory_card_progress p ON p.question_id = q.id AND p.user_id = $1')}
                   AND p.due_on IS NOT NULL AND ${free ? 'true' : `p.due_on <= ${TODAY}`}
                 ORDER BY p.due_on, q.created_at LIMIT $2`, [uid, free ? dailyMax : 500]),
      pool.query(`SELECT ${cols}, 0 AS stage ${POOL}
                    AND NOT EXISTS (SELECT 1 FROM memory_card_progress p WHERE p.user_id = $1 AND p.question_id = q.id)
                  ORDER BY (SELECT max(a.created_at) FROM quiz_attempts a WHERE a.talk_id = q.talk_id AND a.user_id = $1) DESC, q.created_at LIMIT 200`, [uid]),
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE p.stage >= 5)::int AS mastered,
                         count(*) FILTER (WHERE p.stage < 5)::int AS learning,
                         count(*) FILTER (WHERE p.due_on IS NOT NULL AND p.due_on <= ${TODAY})::int AS due
                    FROM memory_card_progress p JOIN quiz_questions q ON q.id = p.question_id WHERE p.user_id = $1 AND q.status = 'approved'`, [uid]),
      pool.query(`SELECT count(*)::int AS n FROM memory_card_progress WHERE user_id = $1 AND first_on = ${TODAY}`, [uid]),
    ]);
    const newLeft = Math.max(0, newMax - introduced.rows[0].n);
    const plan = planSession(due.rows.map((r) => ({ ...cardOf(r), talkTitle: r.talk_title, stage: r.stage })),
      fresh.rows.map((r) => ({ ...cardOf(r), talkTitle: r.talk_title, stage: 0, isNew: true })), { dailyMax, newLeft: free ? 0 : newLeft });
    const c = counts.rows[0];
    return {
      free,
      counts: { total: c.total + fresh.rows.length, mastered: c.mastered, learning: c.learning, due: c.due, newAvailable: Math.min(fresh.rows.length, newLeft) },
      session: { cards: plan.cards, due: plan.due, fresh: plan.fresh, remaining: Math.max(0, plan.dueTotal - plan.due) },
      limits: { dailyMax, newPerDay: newMax },
    };
  });

  app.post('/me/cards/:qid/answer', { preHandler: app.authenticate, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const { qid } = qidSchema.parse(req.params);
    const { known } = z.object({ known: z.boolean() }).parse(req.body ?? {});
    const uid = req.user.sub;
    const ok = await pool.query(`SELECT q.id ${POOL} AND q.id = $2`, [uid, qid]);
    if (!ok.rows.length) return reply.code(404).send({ error: 'Carte introuvable' });
    const cur = (await pool.query(`SELECT stage, (due_on - ${TODAY})::int AS off, (due_on IS NULL) AS acquired FROM memory_card_progress WHERE user_id = $1 AND question_id = $2`, [uid, qid])).rows[0];
    const st = nextState(cur ? { stage: cur.stage, dueOffsetDays: cur.acquired ? null : cur.off } : null, known);
    const { rows } = await pool.query(
      `INSERT INTO memory_card_progress(user_id, question_id, stage, due_on, seen, known, first_on, last_on)
       VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE ${TODAY} + $4::int END, 1, $5, ${TODAY}, ${TODAY})
       ON CONFLICT (user_id, question_id) DO UPDATE SET stage = $3, due_on = CASE WHEN $4::int IS NULL THEN NULL ELSE ${TODAY} + $4::int END,
         seen = memory_card_progress.seen + 1, known = memory_card_progress.known + $5, last_on = ${TODAY}
       RETURNING stage, due_on::text AS "dueOn"`, [uid, qid, st.stage, st.addDays, known ? 1 : 0]);
    return { stage: rows[0].stage, dueOn: rows[0].dueOn, mastered: rows[0].stage >= 5, advanced: st.advanced };
  });
}
