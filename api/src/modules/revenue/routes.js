// Rémunération des chaînes (étape D). Toutes les routes sont fermées quand la fonction « revenue » est coupée (featuresList.js).
//   GET  /studio/revenue                       organisateur : estimation du mois en cours et relevés de SES chaînes
//   GET  /admin/revenue?month=YYYY-MM          administrateur : mois (calculé en direct ou clôturé), périodes, report
//   POST /admin/revenue/:month/close           administrateur : clôture un mois terminé (fige les montants)
//   POST /admin/revenue/lines/:id/paid         administrateur : marque une ligne payée (note facultative)
//   GET  /admin/revenue/:month/export.csv      administrateur : lignes du mois clôturé, pour le virement
import { z } from 'zod';
import { pool } from '../../db.js';
import { parseMonth, currentMonthKey, revenueSettings, computeMonth, carriedByChannel, closeMonth } from '../../revenue.js';

const monthParam = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const csvCell = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const eur = (c) => (c / 100).toFixed(2);

export default async function revenueRoutes(app) {
  const anyManager = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const admin = { preHandler: app.requireRole('admin') };

  app.get('/studio/revenue', anyManager, async (req) => {
    const cfg = await revenueSettings();
    const mine = new Set((await pool.query('SELECT slug FROM speakers WHERE owner_id = $1', [req.user.sub])).rows.map((r) => r.slug));
    const month = currentMonthKey();
    const calc = await computeMonth(month, cfg);
    const est = calc.lines.filter((l) => mine.has(l.slug)).map((l) => ({
      slug: l.slug, name: l.name, seconds: l.seconds, amountCents: cfg.showEstimate ? l.amountCents : null }));
    const carried = await carriedByChannel(parseMonth(month).startDay);
    const { rows: history } = await pool.query(
      `SELECT to_char(month, 'YYYY-MM') AS month, channel_slug AS slug, channel_name AS name, seconds, amount_cents AS "amountCents",
              carried_in_cents AS "carriedInCents", status, paid_at AS "paidAt"
         FROM payout_lines WHERE owner_id = $1 ORDER BY month DESC, channel_name LIMIT 120`, [req.user.sub]);
    return {
      currency: cfg.currency, month, showEstimate: cfg.showEstimate, minPayoutCents: cfg.minPayoutCents, sharePct: cfg.sharePct,
      channels: mine.size, estimate: est, totalSeconds: calc.totalSeconds,
      carriedCents: [...carried].filter(([s]) => mine.has(s)).reduce((a, [, c]) => a + c, 0), history,
    };
  });

  app.get('/admin/revenue', admin, async (req, reply) => {
    const q = z.object({ month: z.string().optional() }).parse(req.query);
    const key = q.month || currentMonthKey();
    const m = parseMonth(key);
    if (!m) return reply.code(400).send({ error: 'Mois invalide (AAAA-MM)' });
    const cfg = await revenueSettings();
    const period = (await pool.query(
      `SELECT to_char(month, 'YYYY-MM') AS month, currency, net_cents AS "netCents", costs_pct AS "costsPct", share_pct AS "sharePct", pool_cents AS "poolCents",
              total_seconds::int AS "totalSeconds", closed_at AS "closedAt" FROM payout_periods WHERE month = $1`, [m.startDay])).rows[0];
    const periods = (await pool.query(
      `SELECT to_char(month, 'YYYY-MM') AS month, pool_cents AS "poolCents",
              (SELECT COALESCE(sum(amount_cents + carried_in_cents), 0)::int FROM payout_lines l WHERE l.month = p.month AND l.status = 'due') AS "dueCents",
              (SELECT COALESCE(sum(amount_cents + carried_in_cents), 0)::int FROM payout_lines l WHERE l.month = p.month AND l.status = 'paid') AS "paidCents"
         FROM payout_periods p ORDER BY month DESC LIMIT 36`)).rows;
    let lines, draft = null;
    if (period) {
      lines = (await pool.query(
        `SELECT l.id, l.channel_slug AS slug, l.channel_name AS name, l.owner_id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail",
                l.seconds::int AS seconds, l.amount_cents AS "amountCents", l.carried_in_cents AS "carriedInCents", l.status, l.paid_at AS "paidAt", l.note
           FROM payout_lines l LEFT JOIN users u ON u.id = l.owner_id WHERE l.month = $1 ORDER BY (l.amount_cents + l.carried_in_cents) DESC, l.channel_name`, [m.startDay])).rows;
    } else {
      const calc = await computeMonth(key, cfg);
      const carried = await carriedByChannel(m.startDay);
      draft = calc;
      lines = calc.lines.map((l) => ({ id: null, slug: l.slug, name: l.name, ownerId: l.ownerId, ownerName: l.ownerName, ownerEmail: l.ownerEmail, seconds: l.seconds,
        amountCents: l.amountCents, carriedInCents: carried.get(l.slug) || 0, status: 'draft', paidAt: null, note: '' }));
    }
    const closable = !period && key < currentMonthKey();
    return {
      month: key, currency: period?.currency || cfg.currency, closed: Boolean(period), closable, settings: { sharePct: cfg.sharePct, costsPct: cfg.costsPct, minPayoutCents: cfg.minPayoutCents, countFree: cfg.countFree, dayCapMinutes: cfg.dayCapSec / 60 },
      netCents: period ? period.netCents : draft.netCents, poolCents: period ? period.poolCents : draft.poolCents,
      totalSeconds: period ? period.totalSeconds : draft.totalSeconds, closedAt: period?.closedAt || null,
      periods, lines,
      unassigned: lines.filter((l) => !l.ownerId).length,
    };
  });

  app.post('/admin/revenue/:month/close', admin, async (req, reply) => {
    const { month } = monthParam.parse(req.params);
    if (month >= currentMonthKey()) return reply.code(400).send({ error: 'Seul un mois terminé peut être clôturé.' });
    const r = await closeMonth(month, req.user.sub);
    if (!r) return reply.code(409).send({ error: 'Ce mois est déjà clôturé.' });
    req.auditSummary = `Rémunération ${month} clôturée (cagnotte ${eur(r.poolCents)}, ${r.lines.length} chaîne(s))`;
    return { month, poolCents: r.poolCents, lines: r.lines.length };
  });

  app.post('/admin/revenue/lines/:id/paid', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { note } = z.object({ note: z.string().max(300).optional() }).parse(req.body ?? {});
    const { rows } = await pool.query(
      "UPDATE payout_lines SET status = 'paid', paid_at = now(), note = COALESCE($2, note) WHERE id = $1 AND status = 'due' RETURNING channel_name, amount_cents + carried_in_cents AS total, to_char(month, 'YYYY-MM') AS month",
      [id, note === undefined ? null : note.trim()]);
    if (!rows[0]) return reply.code(409).send({ error: 'Cette ligne n\'est pas à payer (déjà payée, reportée ou introuvable).' });
    req.auditSummary = `Rémunération ${rows[0].month} : « ${rows[0].channel_name} » payée (${eur(rows[0].total)})`;
    return { ok: true };
  });

  app.get('/admin/revenue/:month/export.csv', admin, async (req, reply) => {
    const { month } = monthParam.parse(req.params);
    const m = parseMonth(month);
    const { rows } = await pool.query(
      `SELECT l.channel_name, u.name AS owner_name, u.email, l.seconds, l.amount_cents, l.carried_in_cents, l.status, l.paid_at, l.note, p.currency
         FROM payout_lines l JOIN payout_periods p ON p.month = l.month LEFT JOIN users u ON u.id = l.owner_id WHERE l.month = $1
        ORDER BY (l.amount_cents + l.carried_in_cents) DESC, l.channel_name`, [m.startDay]);
    if (!rows.length) return reply.code(404).send({ error: 'Aucun relevé clôturé pour ce mois.' });
    const head = ['chaine', 'proprietaire', 'email', 'heures_visionnage', 'gagne', 'report_precedent', 'total_a_payer', 'devise', 'statut', 'paye_le', 'note'];
    const out = [head.join(';')].concat(rows.map((r) => [r.channel_name, r.owner_name || '', r.email || '', (r.seconds / 3600).toFixed(2), eur(r.amount_cents), eur(r.carried_in_cents),
      eur(r.amount_cents + r.carried_in_cents), r.currency.toUpperCase(), r.status, r.paid_at ? new Date(r.paid_at).toISOString().slice(0, 10) : '', r.note].map(csvCell).join(';')));
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="remuneration-${month}.csv"`);
    return '﻿' + out.join('\r\n') + '\r\n';
  });
}
