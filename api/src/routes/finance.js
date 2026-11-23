// Administration → « Revenus & abonnements » : vue d'ensemble de l'argent encaissé, sans rien inventer.
//   GET /admin/finance   administrateur seulement.
// Sources réelles :
//   • abonnements : abonnés par état (table subscriptions) + revenu mensuel ESTIMÉ (prix des formules chez Stripe × abonnés payants) ;
//   • factures d'abonnement encaissées (revenue_invoices, montant HORS TAXES, remboursements déduits) — enregistrées seulement
//     quand le module « Rémunération des chaînes » est actif : `invoicesRecorded` dit si l'historique existe et depuis quand ;
//   • ventes à l'unité (sale_purchases, montant payé) ; cartes cadeaux achetées par Stripe (gift_cards, montant payé).
// Les montants ne sont additionnés que dans la devise principale (réglage plan_currency) ; les autres sont comptés à part.
import { pool } from '../db.js';
import { getSetting } from '../settings.js';
import { planAmounts } from './dashboard.js';

const MONTHS = 12;

export default async function financeRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  const rows = async (sql, params = []) => (await pool.query(sql, params)).rows;

  app.get('/admin/finance', adminOnly, async () => {
    const cur = String((await getSetting('plan_currency')) || 'eur').toLowerCase();

    // --- Abonnés (états réels) et revenu mensuel estimé ---
    const subs = await rows(`SELECT status, billing_interval AS interval, cancel_at_period_end AS cancelling, count(*)::int AS n FROM subscriptions GROUP BY 1, 2, 3`);
    const count = (pred) => subs.filter(pred).reduce((a, s) => a + s.n, 0);
    const paying = count((s) => ['active', 'past_due'].includes(s.status));
    const subscribers = {
      paying,
      trialing: count((s) => s.status === 'trialing'),
      pastDue: count((s) => s.status === 'past_due'),
      cancelling: count((s) => ['active', 'trialing'].includes(s.status) && s.cancelling),
      monthly: count((s) => ['active', 'past_due'].includes(s.status) && s.interval !== 'year'),
      yearly: count((s) => ['active', 'past_due'].includes(s.status) && s.interval === 'year'),
    };
    let mrr = null;
    const plans = await planAmounts();
    if (plans) {
      const m = (i) => plans[i]?.amount ?? 0;
      const cents = subs.filter((s) => ['active', 'past_due'].includes(s.status))
        .reduce((a, s) => a + s.n * (s.interval === 'year' ? m('year') / 12 : m('month')), 0);
      mrr = { amount: Math.round(cents), currency: plans.month?.currency || plans.year?.currency || cur };
    }

    // --- Argent encaissé, mois par mois, par source ---
    const series = await rows(
      `WITH m AS (SELECT generate_series(date_trunc('month', now()) - interval '${MONTHS - 1} months', date_trunc('month', now()), interval '1 month') AS d),
            inv AS (SELECT date_trunc('month', paid_at) AS d, sum(amount_cents - refunded_cents)::bigint AS c FROM revenue_invoices WHERE currency = $1 GROUP BY 1),
            sal AS (SELECT date_trunc('month', paid_at) AS d, sum(amount)::bigint AS c FROM sale_purchases WHERE status = 'paid' AND currency = $1 AND paid_at IS NOT NULL GROUP BY 1),
            gif AS (SELECT date_trunc('month', paid_at) AS d, sum(amount)::bigint AS c FROM gift_cards WHERE source = 'stripe' AND status IN ('paid', 'redeemed') AND refunded_at IS NULL AND currency = $1 AND amount > 0 AND paid_at IS NOT NULL GROUP BY 1)
       SELECT to_char(m.d, 'YYYY-MM') AS month, coalesce(inv.c, 0)::int AS subscriptions, coalesce(sal.c, 0)::int AS sales, coalesce(gif.c, 0)::int AS gifts
         FROM m LEFT JOIN inv ON inv.d = m.d LEFT JOIN sal ON sal.d = m.d LEFT JOIN gif ON gif.d = m.d ORDER BY m.d`, [cur]);
    const sum = (k) => series.reduce((a, r) => a + r[k], 0);

    // --- 30 derniers jours contre les 30 d'avant ---
    const win = async (a, b) => (await rows(
      `SELECT (SELECT coalesce(sum(amount_cents - refunded_cents), 0) FROM revenue_invoices WHERE currency = $1 AND paid_at >= now() - $2::interval AND paid_at < now() - $3::interval)::int
            + (SELECT coalesce(sum(amount), 0) FROM sale_purchases WHERE status = 'paid' AND currency = $1 AND paid_at >= now() - $2::interval AND paid_at < now() - $3::interval)::int
            + (SELECT coalesce(sum(amount), 0) FROM gift_cards WHERE source = 'stripe' AND status IN ('paid', 'redeemed') AND refunded_at IS NULL AND currency = $1 AND amount > 0 AND paid_at >= now() - $2::interval AND paid_at < now() - $3::interval)::int AS c`,
      [cur, a, b]))[0].c;
    const last30 = await win('30 days', '0 days');
    const prev30 = await win('60 days', '30 days');

    // --- Historique des factures d'abonnement : existe-t-il ? ---
    const inv = (await rows(`SELECT count(*)::int AS n, min(paid_at) AS since FROM revenue_invoices`))[0];
    const others = (await rows(
      `SELECT (SELECT count(*) FROM revenue_invoices WHERE currency <> $1)::int + (SELECT count(*) FROM sale_purchases WHERE status = 'paid' AND currency <> $1)::int AS n`, [cur]))[0].n;

    // --- Opérations récentes (les 12 dernières, toutes sources) ---
    const tx = await rows(
      `SELECT * FROM (
         SELECT i.id AS ref, 'subscription' AS kind, coalesce(u.name, u.email, '') AS account, i.amount_cents AS amount, i.currency, i.paid_at AS at,
                CASE WHEN i.refunded_cents >= i.amount_cents AND i.amount_cents > 0 THEN 'refunded' WHEN i.refunded_cents > 0 THEN 'partial' ELSE 'paid' END AS state
           FROM revenue_invoices i LEFT JOIN users u ON u.id = i.user_id
         UNION ALL
         SELECT 'VENTE-' || upper(left(p.id::text, 8)), 'sale', coalesce(u.name, p.email), p.amount, p.currency, p.paid_at,
                CASE WHEN p.status = 'refunded' THEN 'refunded' ELSE 'paid' END
           FROM sale_purchases p LEFT JOIN users u ON u.id = p.user_id WHERE p.status IN ('paid', 'refunded') AND p.paid_at IS NOT NULL
         UNION ALL
         SELECT 'CARTE-' || upper(left(g.id::text, 8)), 'gift', coalesce(g.purchaser_name, u.name, ''), g.amount, g.currency, g.paid_at,
                CASE WHEN g.refunded_at IS NOT NULL THEN 'refunded' ELSE 'paid' END
           FROM gift_cards g LEFT JOIN users u ON u.id = g.purchaser_id WHERE g.source = 'stripe' AND g.status IN ('paid', 'redeemed') AND g.amount > 0 AND g.paid_at IS NOT NULL
       ) t ORDER BY at DESC LIMIT 12`);

    return {
      currency: cur, subscribers, mrr, series,
      totals: { subscriptions: sum('subscriptions'), sales: sum('sales'), gifts: sum('gifts'), all: sum('subscriptions') + sum('sales') + sum('gifts'), last30, prev30 },
      invoicesRecorded: { count: inv.n, since: inv.since },
      otherCurrencyCount: others,
      transactions: tx,
    };
  });
}
