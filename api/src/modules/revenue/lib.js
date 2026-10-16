// Rémunération des chaînes (étape D) : crédit du temps de visionnage, factures encaissées, calcul et clôture mensuels.
//
// Principe (« comme YouTube ») : chaque mois, une part (rev_share_pct) des abonnements encaissés hors taxes, après frais de paiement,
// forme une cagnotte répartie entre les chaînes au prorata du temps de visionnage de leurs conférences.
//   cagnotte = encaissé net × (1 − frais %) × part %
//   chaîne   = cagnotte × temps de la chaîne / temps total
// Le temps est compté côté serveur (reprise de lecture), plafonné par membre et par jour. Les cartes cadeaux ne sont pas dans la base.
import { pool } from '../../db.js';
import { speakerSlug } from '../../speakers.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { featureOn } from '../../features.js';

const MAX_STEP_MS = 60_000; // une reprise de lecture arrive toutes les ~10 s ; au-delà, on ne crédite pas plus d'une minute d'un coup

// Enregistre une facture d'abonnement encaissée (montant hors taxes). Idempotent. Les montants nuls (essai) sont ignorés.
export async function recordInvoicePaid(client, inv) {
  const gross = Number(inv.amount_paid) || 0;
  if (gross <= 0) return;
  const net = Number.isFinite(Number(inv.total_excluding_tax)) && inv.total_excluding_tax != null ? Number(inv.total_excluding_tax) : gross;
  const when = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : new Date();
  const user = inv.customer
    ? (await client.query('SELECT id FROM users WHERE stripe_customer_id = $1 LIMIT 1', [inv.customer])).rows[0]?.id || null
    : null;
  await client.query(
    `INSERT INTO revenue_invoices(id, user_id, amount_cents, currency, charge_id, paid_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [inv.id, user, Math.max(0, Math.round(net)), String(inv.currency || 'eur').toLowerCase(), typeof inv.charge === 'string' ? inv.charge : null, when]);
}

// Remboursement (charge.refunded) : réduit la facture concernée au prorata de la somme remboursée. Sans effet sur une période déjà clôturée.
export async function recordChargeRefund(client, charge) {
  const total = Number(charge.amount) || 0;
  const refunded = Number(charge.amount_refunded) || 0;
  if (!total || !refunded) return;
  const { rows } = await client.query(
    'SELECT id, amount_cents FROM revenue_invoices WHERE charge_id = $1 OR ($2::text IS NOT NULL AND id = $2) LIMIT 1',
    [charge.id, typeof charge.invoice === 'string' ? charge.invoice : null]);
  if (!rows[0]) return;
  const cents = Math.min(rows[0].amount_cents, Math.round(rows[0].amount_cents * Math.min(1, refunded / total)));
  await client.query('UPDATE revenue_invoices SET refunded_cents = $2, charge_id = COALESCE(charge_id, $3) WHERE id = $1', [rows[0].id, cents, charge.id]);
}

// Crédite le temps de visionnage entre deux reprises de lecture. prev = ligne watch_progress AVANT la mise à jour (ou undefined).
export async function creditWatch({ userId, talkId, speaker, positionMs, prev, paid }) {
  if (!prev || !speaker || !String(speaker).trim() || !(await featureOn('revenue'))) return 0;
  const advanced = positionMs - prev.position_ms;
  const wall = Date.now() - new Date(prev.updated_at).getTime();
  const ms = Math.min(advanced, wall + 2000, MAX_STEP_MS); // la lecture ne peut pas avancer plus vite que le temps réel
  if (!(ms >= 1000)) return 0;
  const sec = Math.round(ms / 1000);
  await pool.query(
    `INSERT INTO watch_credit(day, user_id, talk_id, channel_slug, paid, seconds)
     VALUES ((now() AT TIME ZONE 'utc')::date, $1, $2, $3, $4, $5)
     ON CONFLICT (day, user_id, talk_id) DO UPDATE SET seconds = watch_credit.seconds + EXCLUDED.seconds, paid = watch_credit.paid OR EXCLUDED.paid`,
    [userId, talkId, speakerSlug(speaker), paid, sec]);
  return sec;
}

// « 2026-10 » → { month: Date UTC (1er du mois), key, startIso, endIso } ; null si invalide.
export function parseMonth(m) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m))) return null;
  const [y, mo] = m.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1)), end = new Date(Date.UTC(y, mo, 1));
  return { key: m, start, end, startDay: start.toISOString().slice(0, 10), endDay: end.toISOString().slice(0, 10) };
}
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);

export async function revenueSettings() {
  return {
    sharePct: await getNumber('rev_share_pct'), costsPct: await getNumber('rev_costs_pct'),
    minPayoutCents: Math.round((await getNumber('rev_min_payout')) * 100),
    countFree: isOn(await getSetting('rev_count_free')), dayCapSec: (await getNumber('rev_user_day_cap')) * 60,
    showEstimate: isOn(await getSetting('rev_show_estimate')),
    currency: String(await getSetting('plan_currency') || 'eur').toLowerCase(),
  };
}

// Calcul d'un mois (sans rien écrire) : cagnotte et part de chaque chaîne.
export async function computeMonth(monthKey, cfg) {
  const m = parseMonth(monthKey);
  const net = Number((await pool.query(
    `SELECT COALESCE(sum(amount_cents - refunded_cents), 0)::bigint AS n FROM revenue_invoices WHERE paid_at >= $1 AND paid_at < $2 AND currency = $3`,
    [m.start, m.end, cfg.currency])).rows[0].n);
  const poolCents = Math.floor(net * (100 - cfg.costsPct) * cfg.sharePct / 10000 + 1e-9);
  const { rows } = await pool.query(
    `SELECT channel_slug AS slug, sum(seconds * LEAST(1.0, $3::float / NULLIF(tot, 0)))::float AS secs
       FROM (SELECT *, sum(seconds) OVER (PARTITION BY day, user_id) AS tot
               FROM watch_credit WHERE day >= $1 AND day < $2 AND ($4 OR paid)) w
      GROUP BY 1`, [m.startDay, m.endDay, cfg.dayCapSec, cfg.countFree]);
  const total = rows.reduce((s, r) => s + r.secs, 0);
  const names = new Map((await pool.query('SELECT s.slug, s.name, s.owner_id, u.name AS owner_name, u.email AS owner_email FROM speakers s LEFT JOIN users u ON u.id = s.owner_id WHERE s.slug = ANY($1)', [rows.map((r) => r.slug)])).rows.map((r) => [r.slug, r]));
  const lines = rows.map((r) => {
    const c = names.get(r.slug) || {};
    return { slug: r.slug, name: c.name || r.slug, ownerId: c.owner_id || null, ownerName: c.owner_name || null, ownerEmail: c.owner_email || null,
      seconds: Math.round(r.secs), amountCents: total > 0 ? Math.floor(poolCents * r.secs / total + 1e-9) : 0 };
  }).sort((a, b) => b.amountCents - a.amountCents || b.seconds - a.seconds);
  return { month: monthKey, netCents: net, poolCents, totalSeconds: Math.round(total), lines };
}

// Montant déjà gagné mais reporté (sous le seuil ou sans propriétaire), par chaîne, pour les mois avant `before`.
export async function carriedByChannel(beforeDay) {
  const { rows } = await pool.query(
    "SELECT channel_slug AS slug, sum(amount_cents + carried_in_cents)::int AS c FROM payout_lines WHERE status = 'carried' AND month < $1 GROUP BY 1", [beforeDay]);
  return new Map(rows.map((r) => [r.slug, r.c]));
}

// Clôture un mois terminé : fige le calcul, applique le seuil et le report. Renvoie la période, ou null si déjà clôturée.
export async function closeMonth(monthKey, adminId) {
  const m = parseMonth(monthKey);
  const cfg = await revenueSettings();
  const calc = await computeMonth(monthKey, cfg);
  const carried = await carriedByChannel(m.startDay);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO payout_periods(month, currency, net_cents, costs_pct, share_pct, pool_cents, total_seconds, closed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (month) DO NOTHING`,
      [m.startDay, cfg.currency, calc.netCents, cfg.costsPct, cfg.sharePct, calc.poolCents, calc.totalSeconds, adminId]);
    if (!ins.rowCount) { await client.query('ROLLBACK'); return null; }
    // Chaînes avec du report mais sans visionnage ce mois-ci : elles reçoivent aussi une ligne (report éventuellement payable).
    const slugs = new Set(calc.lines.map((l) => l.slug));
    const extra = [...carried.keys()].filter((s) => !slugs.has(s));
    const extraInfo = extra.length ? (await client.query('SELECT slug, name, owner_id FROM speakers WHERE slug = ANY($1)', [extra])).rows : [];
    const all = [...calc.lines.map((l) => ({ slug: l.slug, name: l.name, ownerId: l.ownerId, seconds: l.seconds, amountCents: l.amountCents })),
      ...extraInfo.map((c) => ({ slug: c.slug, name: c.name || c.slug, ownerId: c.owner_id, seconds: 0, amountCents: 0 }))];
    for (const l of all) {
      const back = carried.get(l.slug) || 0;
      const total = l.amountCents + back;
      if (total <= 0 && l.seconds <= 0) continue;
      const due = Boolean(l.ownerId) && total > 0 && total >= cfg.minPayoutCents;
      await client.query(
        `INSERT INTO payout_lines(month, channel_slug, channel_name, owner_id, seconds, amount_cents, carried_in_cents, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [m.startDay, l.slug, l.name, l.ownerId, l.seconds, l.amountCents, back, due ? 'due' : 'carried']);
      if (back) await client.query("UPDATE payout_lines SET status = 'rolled' WHERE channel_slug = $1 AND status = 'carried' AND month < $2", [l.slug, m.startDay]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  return calc;
}
