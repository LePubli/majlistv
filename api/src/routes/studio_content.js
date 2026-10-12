// Studio : correction de la transcription (texte des segments), du résumé, des points clés et des chapitres.
// Les sous-titres traduits et le résumé des autres langues se refont en remettant leur statut à 'pending' :
// le service translator les reprend tout seul. La recherche se réindexe seule (signature d'indexation).
import { z } from 'zod';
import { pool } from '../db.js';

const idSchema = z.object({ id: z.string().uuid() });
const langRe = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export default async function studioContentRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  // Conférence appartenant à l'utilisateur (ou n'importe laquelle pour un admin).
  async function owned(req, reply, id) {
    const { rows } = await pool.query(
      `SELECT id, organizer_id, transcript_status, transcript_language, language, duration_seconds FROM talks WHERE id = $1`, [id]);
    const t = rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub)) {
      reply.code(404).send({ error: 'Conférence introuvable' });
      return null;
    }
    return t;
  }
  const sourceOf = (t) => t.transcript_language || t.language;

  // ------------------------------------------------------------------ Transcription
  app.get('/talks/:id/studio/transcript', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lang } = z.object({ lang: z.string().regex(langRe).optional() }).parse(req.query);
    const t = await owned(req, reply, id);
    if (!t) return;
    if (t.transcript_status !== 'ready') return reply.code(409).send({ error: "La transcription n'est pas encore prête", code: 'not_ready' });
    const code = lang || sourceOf(t);
    const [seg, langs] = await Promise.all([
      pool.query('SELECT idx, start_ms AS s, end_ms AS e, text AS t FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx', [id, code]),
      pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [id]),
    ]);
    return { lang: code, sourceLang: sourceOf(t), languages: langs.rows.map((r) => r.lang), segments: seg.rows };
  });

  const putTranscript = z.object({
    lang: z.string().regex(langRe),
    changes: z.array(z.object({ idx: z.number().int().min(0), text: z.string().trim().min(1).max(2000) })).min(1).max(20000),
    // Seulement pour la langue d'origine : refaire les sous-titres traduits / le résumé à partir du texte corrigé.
    retranslate: z.boolean().default(false),
    regenerateInsights: z.boolean().default(false),
  });

  app.put('/talks/:id/studio/transcript', { preHandler: organizer.preHandler, bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = putTranscript.parse(req.body ?? {});
    const t = await owned(req, reply, id);
    if (!t) return;
    if (t.transcript_status !== 'ready') return reply.code(409).send({ error: "La transcription n'est pas encore prête", code: 'not_ready' });
    const isSource = b.lang === sourceOf(t);
    const idxs = [...new Set(b.changes.map((c) => c.idx))];
    if (idxs.length !== b.changes.length) return reply.code(400).send({ error: 'Segment en double dans la demande' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT idx, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 AND idx = ANY($3)', [id, b.lang, idxs]);
      if (cur.rowCount !== idxs.length) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Segment introuvable' }); }
      const old = new Map(cur.rows.map((r) => [r.idx, r.text]));
      const real = b.changes.filter((c) => old.get(c.idx) !== c.text);
      if (real.length) {
        await client.query(
          `UPDATE transcript_segments s SET text = v.text
             FROM unnest($3::int[], $4::text[]) AS v(idx, text)
            WHERE s.talk_id = $1 AND s.lang = $2 AND s.idx = v.idx`,
          [id, b.lang, real.map((c) => c.idx), real.map((c) => c.text)]);
        if (isSource) {
          // Texte complet (recherche) reconstruit depuis les segments corrigés.
          await client.query(
            `UPDATE talks SET transcript_text = (SELECT string_agg(text, ' ' ORDER BY idx) FROM transcript_segments WHERE talk_id = $1 AND lang = $2),
                    transcript_edited_at = now() WHERE id = $1`, [id, b.lang]);
        } else {
          await client.query('UPDATE talks SET transcript_edited_at = now() WHERE id = $1', [id]);
        }
      }
      let retranslating = 0;
      let regenerating = false;
      if (isSource && real.length) {
        if (b.retranslate) {
          const r = await client.query(
            `UPDATE transcript_translations SET status = 'pending', progress = 0, error = NULL, attempts = 0, updated_at = now()
              WHERE talk_id = $1 AND status IN ('ready', 'failed')`, [id]);
          retranslating = r.rowCount;
        }
        if (b.regenerateInsights) {
          const r = await client.query(
            `UPDATE talk_insights SET status = 'pending', error = NULL, attempts = 0, edited = false, updated_at = now()
              WHERE talk_id = $1 AND lang = $2 AND status IN ('ready', 'failed')`, [id, b.lang]);
          regenerating = r.rowCount > 0;
        }
      }
      await client.query('COMMIT');
      return { changed: real.length, retranslating, regenerating };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // ------------------------------------------------------------------ Résumé, points clés, chapitres
  app.get('/talks/:id/studio/insights', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await owned(req, reply, id);
    if (!t) return;
    const { rows } = await pool.query(
      `SELECT lang, status, summary, key_points AS "keyPoints", chapters, edited, error FROM talk_insights WHERE talk_id = $1 ORDER BY lang`, [id]);
    return {
      sourceLang: sourceOf(t), durationSeconds: t.duration_seconds,
      insights: rows.map((r) => ({ ...r, chapters: (r.chapters || []).map((c) => ({ ms: c.ms, title: c.title })) })),
    };
  });

  const putInsights = z.object({
    summary: z.string().trim().max(4000),
    keyPoints: z.array(z.string().trim().min(1).max(400)).max(20),
    chapters: z.array(z.object({ ms: z.number().int().min(0).max(48 * 3600 * 1000), title: z.string().trim().min(1).max(120) })).max(60),
    // Langue d'origine : refaire la traduction du résumé dans les autres langues à partir de cette version.
    translateOthers: z.boolean().default(false),
  });

  app.put('/talks/:id/studio/insights/:lang', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const lang = z.string().regex(langRe).parse(req.params.lang);
    const b = putInsights.parse(req.body ?? {});
    const t = await owned(req, reply, id);
    if (!t) return;
    const cur = (await pool.query('SELECT status FROM talk_insights WHERE talk_id = $1 AND lang = $2', [id, lang])).rows[0];
    if (cur && ['pending', 'processing'].includes(cur.status)) {
      return reply.code(409).send({ error: 'Ce résumé est en cours de génération : attendez la fin, puis modifiez-le', code: 'busy' });
    }
    if (!cur && lang !== sourceOf(t)) return reply.code(404).send({ error: 'Résumé introuvable pour cette langue' });
    if (!b.summary && !b.keyPoints.length && !b.chapters.length) return reply.code(400).send({ error: 'Le résumé est vide' });
    const chapters = [...b.chapters].sort((x, y) => x.ms - y.ms);
    if (t.duration_seconds && chapters.some((c) => c.ms > (t.duration_seconds + 5) * 1000)) {
      return reply.code(400).send({ error: 'Un chapitre commence après la fin de la vidéo' });
    }
    await pool.query(
      `INSERT INTO talk_insights(talk_id, lang, status, summary, key_points, chapters, edited)
       VALUES ($1, $2, 'ready', $3, $4, $5, true)
       ON CONFLICT (talk_id, lang) DO UPDATE SET status = 'ready', summary = EXCLUDED.summary, key_points = EXCLUDED.key_points,
         chapters = EXCLUDED.chapters, edited = true, error = NULL, updated_at = now()`,
      [id, lang, b.summary, JSON.stringify(b.keyPoints), JSON.stringify(chapters.map((c) => ({ ms: c.ms, title: c.title })))]);
    let translating = 0;
    if (b.translateOthers && lang === sourceOf(t)) {
      const r = await pool.query(
        `UPDATE talk_insights SET status = 'pending', error = NULL, attempts = 0, edited = false, updated_at = now()
          WHERE talk_id = $1 AND lang <> $2 AND status IN ('ready', 'failed')`, [id, lang]);
      translating = r.rowCount;
    }
    return { ok: true, translating };
  });
}
