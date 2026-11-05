// Amélioration 4.1 — Corrections des sous-titres proposées par les membres.
//  • Membre connecté (avec le jeton de lecture de la vidéo) : propose un nouveau texte pour UNE phrase, dans la langue qu'il lit ; il voit l'état de ses suggestions.
//  • Studio (organisateur de la vidéo, éditeurs de sa chaîne, modérateur, administrateur) : relit, ajuste, accepte ou refuse.
//  • Accepter applique le texte à la phrase (comme une correction faite à la main) ; une suggestion n'est JAMAIS appliquée sans relecture humaine.
//  • L'auteur n'est pas montré au relecteur (anonyme) : on juge la correction, pas la personne.
import { z } from 'zod';
import { pool } from '../../db.js';
import { checkPlaybackToken } from '../../playback.js';
import { viaChannel, managedSpeakers } from '../../channelAccess.js';
import { getNumber } from '../../settings.js';
import { cleanSuggestion, wordDiff } from './lib.js';

const idSchema = z.object({ id: z.string().uuid() });
const cidSchema = z.object({ cid: z.string().uuid() });
const langRe = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const STAFF = new Set(['admin', 'moderator']);

export default async function correctionRoutes(app) {
  const member = { preHandler: app.authenticate };
  const reviewer = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const sourceOf = (t) => t.transcript_language || t.language;

  // ------------------------------------------------------------------ Membre
  app.post('/talks/:id/corrections', member, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({
      t: z.string().min(1).max(2000), lang: z.string().regex(langRe), idx: z.number().int().min(0).max(200000),
      text: z.string().max(5000), comment: z.string().trim().max(500).default(''),
    }).parse(req.body ?? {});
    if (!checkPlaybackToken(id, b.t)) return reply.code(403).send({ error: 'Accès refusé' });
    const seg = (await pool.query('SELECT start_ms, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 AND idx = $3', [id, b.lang, b.idx])).rows[0];
    if (!seg) return reply.code(404).send({ error: 'Phrase introuvable' });
    const clean = cleanSuggestion(seg.text, b.text);
    if (clean.error) return reply.code(400).send({ error: clean.error, code: clean.code });
    const max = Math.max(1, await getNumber('mod_corrections_daily_max'));
    const today = (await pool.query("SELECT count(*)::int AS n FROM subtitle_corrections WHERE user_id = $1 AND created_at > now() - interval '24 hours'", [req.user.sub])).rows[0].n;
    if (today >= max) return reply.code(429).send({ error: 'Vous avez atteint le nombre de suggestions du jour. Merci, revenez demain.', code: 'daily_limit' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO subtitle_corrections(talk_id, lang, idx, start_ms, original_text, suggested_text, comment, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [id, b.lang, b.idx, seg.start_ms, seg.text, clean.text, b.comment, req.user.sub]);
      return reply.code(201).send({ id: rows[0].id, status: 'pending' });
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Vous avez déjà proposé une correction pour cette phrase : elle attend sa relecture.', code: 'already_pending' });
      throw e;
    }
  });

  // Mes suggestions pour cette vidéo : { idx, lang, status } (le site marque les phrases déjà proposées).
  app.get('/talks/:id/corrections/mine', member, async (req) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(
      `SELECT id, lang, idx, status, suggested_text AS "suggestedText", created_at AS "createdAt" FROM subtitle_corrections
        WHERE talk_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 200`, [id, req.user.sub]);
    return { items: rows };
  });

  // ------------------------------------------------------------------ Studio
  async function canReview(req, talkId) {
    if (STAFF.has(req.user.role)) return true;
    const t = (await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [talkId])).rows[0];
    return !!t && (t.organizer_id === req.user.sub || (await viaChannel(req.user, talkId)));
  }

  app.get('/studio/corrections', reviewer, async (req) => {
    const q = z.object({ status: z.enum(['pending', 'accepted', 'rejected']).default('pending'), talk: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const staff = STAFF.has(req.user.role);
    const speakers = staff ? [] : await managedSpeakers(req.user.sub);
    const scope = staff ? 'true' : `(t.organizer_id = $4 OR lower(trim(t.speaker)) = ANY($5::text[]))`;
    const args = [q.status, q.talk || null, q.limit];
    if (!staff) args.push(req.user.sub, speakers);
    const where = `c.status = $1 AND ($2::uuid IS NULL OR c.talk_id = $2) AND ${scope}`;
    const [list, counts] = await Promise.all([
      pool.query(
        `SELECT c.id, c.talk_id AS "talkId", t.title AS "talkTitle", c.lang, c.idx, c.start_ms AS "startMs", c.original_text AS "originalText",
                c.suggested_text AS "suggestedText", c.comment, c.status, c.final_text AS "finalText", c.reviewed_at AS "reviewedAt", c.created_at AS "createdAt",
                s.text AS "currentText", (t.transcript_language = c.lang OR t.language = c.lang AND t.transcript_language IS NULL) AS "isSource"
           FROM subtitle_corrections c JOIN talks t ON t.id = c.talk_id
           LEFT JOIN transcript_segments s ON s.talk_id = c.talk_id AND s.lang = c.lang AND s.idx = c.idx
          WHERE ${where} ORDER BY ${q.status === 'pending' ? 'c.created_at' : 'c.reviewed_at DESC NULLS LAST'} LIMIT $3`, args),
      pool.query(
        `SELECT c.status, count(*)::int AS n FROM subtitle_corrections c JOIN talks t ON t.id = c.talk_id
          WHERE ($1::uuid IS NULL OR c.talk_id = $1) AND ${staff ? 'true' : '(t.organizer_id = $2 OR lower(trim(t.speaker)) = ANY($3::text[]))'} GROUP BY c.status`,
        staff ? [q.talk || null] : [q.talk || null, req.user.sub, speakers]),
    ]);
    const count = { pending: 0, accepted: 0, rejected: 0 };
    for (const r of counts.rows) count[r.status] = r.n;
    return {
      counts: count,
      items: list.rows.map((r) => ({ ...r, changed: r.currentText != null && r.currentText !== r.originalText, diff: wordDiff(r.currentText ?? r.originalText, r.finalText || r.suggestedText) })),
    };
  });

  async function loadForReview(req, reply, cid) {
    const c = (await pool.query('SELECT * FROM subtitle_corrections WHERE id = $1', [cid])).rows[0];
    if (!c || !(await canReview(req, c.talk_id))) { reply.code(404).send({ error: 'Suggestion introuvable' }); return null; }
    if (c.status !== 'pending') { reply.code(409).send({ error: 'Cette suggestion a déjà été traitée', code: 'done' }); return null; }
    return c;
  }

  app.post('/studio/corrections/:cid/accept', reviewer, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const body = z.object({ text: z.string().max(5000).optional() }).parse(req.body ?? {});
    const c = await loadForReview(req, reply, cid);
    if (!c) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const seg = (await client.query('SELECT text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 AND idx = $3 FOR UPDATE', [c.talk_id, c.lang, c.idx])).rows[0];
      if (!seg) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Cette phrase n\'existe plus (la vidéo a été retranscrite ou remplacée)', code: 'gone' }); }
      const clean = cleanSuggestion(seg.text, body.text ?? c.suggested_text);
      if (clean.error) { await client.query('ROLLBACK'); return reply.code(400).send({ error: clean.error, code: clean.code }); }
      const talk = (await client.query('SELECT transcript_language, language FROM talks WHERE id = $1', [c.talk_id])).rows[0];
      const source = sourceOf(talk);
      const isSource = c.lang === source;
      const snap = isSource ? null : (await client.query('SELECT text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 AND idx = $3', [c.talk_id, source, c.idx])).rows[0]?.text ?? null;
      await client.query('UPDATE transcript_segments SET text = $4 WHERE talk_id = $1 AND lang = $2 AND idx = $3', [c.talk_id, c.lang, c.idx, clean.text]);
      if (isSource) {
        await client.query(
          `UPDATE talks SET transcript_text = (SELECT string_agg(text, ' ' ORDER BY idx) FROM transcript_segments WHERE talk_id = $1 AND lang = $2), transcript_edited_at = now() WHERE id = $1`, [c.talk_id, c.lang]);
      } else {
        await client.query('UPDATE talks SET transcript_edited_at = now() WHERE id = $1', [c.talk_id]);
      }
      await client.query(
        `UPDATE subtitle_corrections SET status = 'accepted', final_text = $2, source_snapshot = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
        [cid, clean.text, snap, req.user.sub]);
      await client.query('COMMIT');
      req.auditSummary = `Correction de sous-titre acceptée (vidéo ${c.talk_id}, langue ${c.lang}, phrase ${c.idx})`;
      return { ok: true, text: clean.text };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/studio/corrections/:cid/reject', reviewer, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const c = await loadForReview(req, reply, cid);
    if (!c) return;
    await pool.query(`UPDATE subtitle_corrections SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [cid, req.user.sub]);
    req.auditSummary = `Correction de sous-titre refusée (vidéo ${c.talk_id}, langue ${c.lang}, phrase ${c.idx})`;
    return { ok: true };
  });
}
