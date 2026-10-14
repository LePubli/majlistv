// Étape 20 — Modération.
//   POST /talks/:id/report                     signalement d'une conférence par un spectateur (compte facultatif)
//   GET  /moderation/summary                   compteurs (à relire, signalements ouverts)
//   GET  /moderation/queue                     conférences à relire (en attente) ou refusées
//   POST /moderation/talks/:id/decision        valider ou refuser une conférence (motif obligatoire en cas de refus)
//   GET  /moderation/reports                   signalements (ouverts ou traités)
//   POST /moderation/reports/:id/resolve       classer, régler ou retirer la conférence
//   POST /talks/:id/review/submit              l'organisateur renvoie sa conférence corrigée à la relecture
//   GET  /admin/audit                          journal des actions de l'équipe (administrateur)
// Rôles : « modérateur » et « administrateur » pour /moderation ; seul l'administrateur lit le journal.
import { z } from 'zod';
import { pool } from '../db.js';
import { enqueueForUser } from '../mailer.js';
import { visibleSql } from '../visibility.js';

const idSchema = z.object({ id: z.string().uuid() });
export const REASONS = ['copyright', 'inappropriate', 'misleading', 'doctrinal', 'technical', 'other'];
const csvCell = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default async function moderationRoutes(app) {
  const staff = { preHandler: app.requireRole('moderator', 'admin') };
  const adminOnly = { preHandler: app.requireRole('admin') };
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  // ------------------------------------------------------------------ Signalement (spectateurs)
  app.post('/talks/:id/report', { config: { rateLimit: { max: Number(process.env.REPORT_RATE_MAX) || 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ reason: z.enum(REASONS), details: z.string().trim().max(1000).default('') }).parse(req.body ?? {});
    const talk = (await pool.query(`SELECT t.id FROM talks t WHERE t.id = $1 AND ${visibleSql('t')}`, [id])).rows[0];
    if (!talk) return reply.code(404).send({ error: 'Conférence introuvable' });
    const viewer = await app.optionalUser(req); // visiteur sans compte : accepté, mais limité à 5 signalements par heure et par adresse
    try {
      await pool.query('INSERT INTO content_reports(talk_id, reporter_id, reason, details) VALUES ($1, $2, $3, $4)', [id, viewer?.sub ?? null, b.reason, b.details]);
    } catch (err) {
      if (err.code === '23505') return reply.code(200).send({ ok: true, duplicate: true }); // déjà signalée par ce compte, en attente de traitement
      throw err;
    }
    return reply.code(201).send({ ok: true });
  });

  // ------------------------------------------------------------------ File de relecture
  app.get('/moderation/summary', staff, async () => {
    const r = (await pool.query(
      `SELECT (SELECT count(*)::int FROM talks WHERE review_status = 'pending') AS pending,
              (SELECT count(*)::int FROM content_reports WHERE status = 'open') AS reports`)).rows[0];
    return r;
  });

  app.get('/moderation/queue', staff, async (req) => {
    const { status } = z.object({ status: z.enum(['pending', 'rejected']).default('pending') }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.language, t.source, t.access, t.duration_seconds AS "durationSeconds", t.publication, t.publish_at AS "publishAt",
              t.review_status AS "reviewStatus", t.review_note AS "reviewNote", t.submitted_at AS "submittedAt", t.reviewed_at AS "reviewedAt",
              u.name AS "organizerName", u.email AS "organizerEmail",
              (SELECT count(*)::int FROM content_reports r WHERE r.talk_id = t.id AND r.status = 'open') AS "openReports"
         FROM talks t LEFT JOIN users u ON u.id = t.organizer_id
        WHERE t.review_status = $1 ORDER BY COALESCE(t.submitted_at, t.created_at) LIMIT 200`, [status]);
    return { items: rows };
  });

  const decisionBody = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).default('') })
    .refine((b) => b.decision === 'approve' || b.note.length >= 5, { message: 'Expliquez le motif du refus (5 caractères au moins)', path: ['note'] });

  async function decide(req, reply, id, decision, note, { fromReport = false } = {}) {
    const t = (await pool.query('SELECT id, title, organizer_id, review_status FROM talks WHERE id = $1', [id])).rows[0];
    if (!t) { reply.code(404).send({ error: 'Conférence introuvable' }); return null; }
    if (decision === 'approve' && !['pending', 'rejected'].includes(t.review_status)) { reply.code(409).send({ error: "Cette conférence n'est pas en attente de relecture", code: 'not_pending' }); return null; }
    if (decision === 'reject' && t.review_status === 'rejected') { reply.code(409).send({ error: 'Cette conférence est déjà refusée', code: 'already_rejected' }); return null; }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await pool.query('UPDATE talks SET review_status = $2, review_note = $3, reviewed_at = now(), reviewed_by = $4 WHERE id = $1', [id, status, note, req.user.sub]);
    await enqueueForUser(pool, t.organizer_id, decision === 'approve' ? 'review_approved' : 'review_rejected', { title: t.title, note, path: '/studio' }).catch(() => {});
    req.auditSummary = `${decision === 'approve' ? 'Conférence validée' : fromReport ? 'Conférence retirée après signalement' : 'Conférence refusée'} : « ${t.title} »${note ? ` — ${note}` : ''}`;
    return { id, reviewStatus: status, reviewNote: note };
  }

  app.post('/moderation/talks/:id/decision', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = decisionBody.parse(req.body ?? {});
    const out = await decide(req, reply, id, b.decision, b.note);
    return out ?? reply;
  });

  // L'organisateur corrige puis renvoie sa conférence refusée.
  app.post('/talks/:id/review/submit', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = (await pool.query('SELECT organizer_id, review_status, publication FROM talks WHERE id = $1', [id])).rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub)) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (t.review_status !== 'rejected') return reply.code(409).send({ error: "Cette conférence n'a pas été refusée", code: 'not_rejected' });
    if (t.publication === 'draft') return reply.code(409).send({ error: "Publiez ou programmez la conférence : elle sera relue à ce moment-là", code: 'draft' });
    await pool.query(`UPDATE talks SET review_status = 'pending', submitted_at = now() WHERE id = $1`, [id]);
    return { reviewStatus: 'pending' };
  });

  // ------------------------------------------------------------------ Signalements
  app.get('/moderation/reports', staff, async (req) => {
    const q = z.object({ status: z.enum(['open', 'handled']).default('open'), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT r.id, r.talk_id AS "talkId", r.reason, r.details, r.status, r.note, r.created_at AS "createdAt", r.handled_at AS "handledAt",
              t.title, t.review_status AS "reviewStatus", ru.email AS "reporterEmail", hu.name AS "handledBy",
              (SELECT count(*)::int FROM content_reports o WHERE o.talk_id = r.talk_id AND o.status = 'open') AS "openOnTalk"
         FROM content_reports r JOIN talks t ON t.id = r.talk_id
         LEFT JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users hu ON hu.id = r.handled_by
        WHERE ${q.status === 'open' ? "r.status = 'open'" : "r.status <> 'open'"}
        ORDER BY ${q.status === 'open' ? 'r.created_at' : 'r.handled_at DESC'} LIMIT $1`, [q.limit]);
    return { items: rows };
  });

  const resolveBody = z.object({ action: z.enum(['dismiss', 'resolve', 'unpublish']), note: z.string().trim().max(1000).default('') })
    .refine((b) => b.action !== 'unpublish' || b.note.length >= 5, { message: 'Expliquez le motif du retrait à l\'organisateur (5 caractères au moins)', path: ['note'] });

  app.post('/moderation/reports/:id/resolve', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = resolveBody.parse(req.body ?? {});
    const r = (await pool.query(`SELECT id, talk_id, status FROM content_reports WHERE id = $1`, [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Signalement introuvable' });
    if (r.status !== 'open') return reply.code(409).send({ error: 'Ce signalement est déjà traité', code: 'handled' });
    if (b.action === 'unpublish') {
      // Retrait : la conférence repasse en « refusée » avec le motif, tous les signalements ouverts à son sujet sont réglés d'un coup.
      const t = (await pool.query('SELECT review_status FROM talks WHERE id = $1', [r.talk_id])).rows[0];
      if (t.review_status !== 'rejected') { const out = await decide(req, reply, r.talk_id, 'reject', b.note, { fromReport: true }); if (!out) return reply; }
      await pool.query(`UPDATE content_reports SET status = 'actioned', handled_by = $2, handled_at = now(), note = $3 WHERE talk_id = $1 AND status = 'open'`, [r.talk_id, req.user.sub, b.note]);
      return { status: 'actioned' };
    }
    const status = b.action === 'dismiss' ? 'dismissed' : 'resolved';
    await pool.query('UPDATE content_reports SET status = $2, handled_by = $3, handled_at = now(), note = $4 WHERE id = $1', [id, status, req.user.sub, b.note]);
    req.auditSummary = `Signalement ${status === 'dismissed' ? 'classé sans suite' : 'réglé'}${b.note ? ` — ${b.note}` : ''}`;
    return { status };
  });

  // ------------------------------------------------------------------ Journal (administrateur)
  app.get('/admin/audit', adminOnly, async (req, reply) => {
    const q = z.object({
      days: z.coerce.number().int().min(1).max(730).default(30),
      actor: z.string().uuid().optional(),
      role: z.enum(['admin', 'moderator']).optional(),
      q: z.string().trim().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
      format: z.enum(['json', 'csv']).default('json'),
    }).parse(req.query);
    const where = ['a.at >= now() - ($1 || \' days\')::interval'];
    const params = [String(q.days)];
    if (q.actor) { params.push(q.actor); where.push(`a.actor_id = $${params.length}`); }
    if (q.role) { params.push(q.role); where.push(`a.actor_role = $${params.length}`); }
    if (q.q) { params.push(`%${q.q.replace(/[%_]/g, '\\$&')}%`); where.push(`(a.route ILIKE $${params.length} OR a.summary ILIKE $${params.length} OR a.target ILIKE $${params.length} OR a.actor_name ILIKE $${params.length})`); }
    const clause = where.join(' AND ');
    const total = (await pool.query(`SELECT count(*)::int AS n FROM audit_log a WHERE ${clause}`, params)).rows[0].n;
    const csv = q.format === 'csv';
    const { rows } = await pool.query(
      `SELECT a.id, a.at, a.actor_id AS "actorId", a.actor_name AS "actorName", a.actor_role AS "actorRole", a.method, a.route, a.target, a.fields, a.summary, a.status
         FROM audit_log a WHERE ${clause} ORDER BY a.at DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, csv ? 5000 : q.limit, csv ? 0 : q.offset]);
    if (csv) {
      const lines = [['Date', 'Qui', 'Rôle', 'Action', 'Cible', 'Champs', 'Détail'].join(';')];
      for (const r of rows) lines.push([new Date(r.at).toISOString(), r.actorName, r.actorRole, `${r.method} ${r.route}`, r.target, r.fields.join(', '), r.summary].map(csvCell).join(';'));
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="journal-actions.csv"').header('cache-control', 'private, no-store').send('﻿' + lines.join('\r\n') + '\r\n');
    }
    return reply.header('cache-control', 'private, no-store').send({ total, items: rows });
  });
}
