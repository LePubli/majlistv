// Étape 21 — Cartes cadeaux (1, 3 ou 12 mois), payées par Stripe, activées avec un code.
//   GET  /gifts/options            public : durées et prix en vente
//   POST /gifts/checkout           connecté : crée la carte « en attente » et ouvre le paiement Stripe
//   GET  /me/gifts                 connecté : mes cartes achetées (code visible une fois payée)
//   POST /gifts/redeem             connecté : active un code → accès offert (users.premium_until)
//   GET/POST /admin/gifts…         administrateur : liste, génération de cartes offertes, annulation
import { z } from 'zod';
import { pool } from '../../db.js';
import { getSetting, isOn } from '../../settings.js';
import { enqueueForUser } from '../../mailer.js';
import { fmtDate } from '../../emails.js';
import { stripeClient } from '../../routes/billing.js';
import { GIFT_MONTHS, newCode, normalizeCode, monthsLabel } from './lib.js';

// Texte exact accepté à l'achat (conservé avec la date, l'adresse IP et le navigateur). Changer le texte = changer la version.
export const GIFT_TERMS_VERSION = '2026-10-14';
export const GIFT_TERMS_TEXT = {
  fr: "J'accepte les conditions générales de vente. Je peux demander le remboursement de cette carte dans les 14 jours suivant l'achat, tant qu'elle n'a pas été activée.",
  en: 'I accept the terms of sale. I can ask for a refund of this card within 14 days of purchase, as long as it has not been redeemed.',
  ar: 'أوافق على شروط البيع. يمكنني طلب استرداد ثمن هذه البطاقة خلال 14 يومًا من الشراء ما دامت لم تُفعَّل.',
};
const lang2 = (l) => (['fr', 'en', 'ar'].includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');
const toCents = (v) => { const n = Math.round(Number(String(v || '').replace(',', '.')) * 100); return Number.isFinite(n) && n > 0 ? n : 0; };
const idSchema = z.object({ id: z.string().uuid() });

// Durées réellement en vente, avec leur prix en centimes.
export async function giftOptions() {
  const out = [];
  for (const m of GIFT_MONTHS) {
    const amount = toCents(await getSetting(`gift_price_${m}`));
    if (amount) out.push({ months: m, amount });
  }
  return out;
}

export default async function giftsRoutes(app) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/gifts/options', async () => {
    const stripe = await stripeClient();
    const on = isOn(await getSetting('gift_enabled')) && Boolean(stripe);
    return { enabled: on, currency: await getSetting('plan_currency'), options: on ? await giftOptions() : [], termsText: GIFT_TERMS_TEXT };
  });

  app.post('/gifts/checkout', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    const stripe = await stripeClient();
    if (!stripe || !isOn(await getSetting('gift_enabled'))) return reply.code(503).send({ error: "Les cartes cadeaux ne sont pas disponibles pour l'instant" });
    const b = z.object({
      months: z.coerce.number().int().refine((n) => GIFT_MONTHS.includes(n)),
      recipientEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
      recipientName: z.string().trim().max(100).optional(),
      message: z.string().trim().max(300).optional(),
      terms: z.boolean().optional(),
    }).parse(req.body ?? {});
    if (b.terms !== true) return reply.code(400).send({ error: "Merci d'accepter les conditions de vente.", code: 'terms_required' });
    const amount = (await giftOptions()).find((o) => o.months === b.months)?.amount;
    if (!amount) return reply.code(400).send({ error: "Cette durée n'est pas en vente" });
    const me = (await pool.query('SELECT email, name, locale FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (b.recipientEmail && b.recipientEmail === me.email) return reply.code(400).send({ error: "Pour vous offrir un abonnement, choisissez plutôt l'abonnement classique." });
    const l = lang2(me.locale);
    const currency = await getSetting('plan_currency');
    const webUrl = await getSetting('web_url');
    // Les cartes jamais payées (paiement abandonné) sont nettoyées au passage.
    await pool.query("DELETE FROM gift_cards WHERE status = 'pending' AND created_at < now() - interval '3 days'");
    let gift;
    for (let i = 0; i < 5 && !gift; i += 1) {
      try {
        gift = (await pool.query(
          `INSERT INTO gift_cards(code, months, purchaser_id, purchaser_name, recipient_email, recipient_name, message, currency, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [newCode(), b.months, req.user.sub, me.name, b.recipientEmail || null, b.recipientName || null, b.message || null, currency, amount])).rows[0];
      } catch (err) { if (err.code !== '23505') throw err; }
    }
    if (!gift) throw new Error('Code indisponible');
    await pool.query(
      `INSERT INTO consents(user_id, email, kind, version, text, context, ip, user_agent) VALUES ($1, $2, 'gift_terms', $3, $4, $5, $6, $7)`,
      [req.user.sub, me.email, GIFT_TERMS_VERSION, GIFT_TERMS_TEXT[l], `gift:${b.months}`, req.ip, String(req.headers['user-agent'] || '').slice(0, 300)]);
    const tax = isOn(await getSetting('stripe_automatic_tax'));
    const params = {
      mode: 'payment',
      customer_email: me.email,
      client_reference_id: req.user.sub,
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount, ...(tax ? { tax_behavior: 'inclusive' } : {}),
        product_data: { name: `${{ fr: 'Carte cadeau', en: 'Gift card', ar: 'بطاقة هدية' }[l]} · ${monthsLabel(b.months, l)}` } } }],
      metadata: { gift_id: gift.id, user_id: req.user.sub },
      payment_intent_data: { metadata: { gift_id: gift.id } },
      allow_promotion_codes: true,
      locale: l === 'ar' ? 'auto' : l,
      success_url: `${webUrl}/gift?paid=1`,
      cancel_url: `${webUrl}/gift?canceled=1`,
    };
    if (tax) Object.assign(params, { automatic_tax: { enabled: true }, billing_address_collection: 'required', tax_id_collection: { enabled: true } });
    let session;
    if (isOn(await getSetting('paypal_enabled'))) {
      try { session = await stripe.checkout.sessions.create({ ...params, payment_method_types: ['card', 'paypal'] }); } catch (err) {
        if (!(err && err.type === 'StripeInvalidRequestError' && /payment_method/i.test(`${err.param || ''} ${err.message || ''}`))) throw err;
        req.log.warn(`PayPal refusé par Stripe, paiement par carte : ${err.message}`);
      }
    }
    if (!session) session = await stripe.checkout.sessions.create(params);
    await pool.query('UPDATE gift_cards SET stripe_session_id = $2 WHERE id = $1', [gift.id, session.id]);
    return { url: session.url };
  });

  app.get('/me/gifts', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, months, status, CASE WHEN status IN ('paid', 'redeemed') THEN code END AS code, recipient_email AS "recipientEmail", recipient_name AS "recipientName",
              created_at AS "createdAt", paid_at AS "paidAt", redeemed_at AS "redeemedAt"
         FROM gift_cards WHERE purchaser_id = $1 AND status <> 'pending' ORDER BY created_at DESC LIMIT 100`, [req.user.sub]);
    return rows;
  });

  app.post('/gifts/redeem', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    const { code } = z.object({ code: z.string().max(40) }).parse(req.body ?? {});
    const norm = normalizeCode(code);
    if (!norm) return reply.code(400).send({ error: 'Code invalide : 12 caractères attendus, ex. ABCD-EFGH-JKLM', code: 'bad_code' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Une seule personne peut activer un code, même si deux demandes arrivent en même temps.
      const g = (await client.query(
        `UPDATE gift_cards SET status = 'redeemed', redeemed_by = $2, redeemed_at = now() WHERE code = $1 AND status = 'paid' RETURNING id, months, purchaser_id`, [norm, req.user.sub])).rows[0];
      if (!g) {
        await client.query('ROLLBACK');
        const st = (await pool.query('SELECT status FROM gift_cards WHERE code = $1', [norm])).rows[0]?.status;
        if (st === 'redeemed') return reply.code(409).send({ error: 'Ce code a déjà été utilisé.', code: 'used' });
        if (st === 'void') return reply.code(410).send({ error: 'Ce code a été annulé.', code: 'void' });
        return reply.code(404).send({ error: 'Code inconnu. Vérifiez la saisie.', code: 'unknown' });
      }
      const u = (await client.query(
        `UPDATE users SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + make_interval(months => $2) WHERE id = $1 RETURNING premium_until, locale, name`,
        [req.user.sub, g.months])).rows[0];
      const sub = await client.query("SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due') LIMIT 1", [req.user.sub]);
      await enqueueForUser(client, req.user.sub, 'gift_activated', { date: fmtDate(u.premium_until, u.locale), path: '/' }, `gift-act:${g.id}`);
      if (g.purchaser_id && g.purchaser_id !== req.user.sub) {
        await enqueueForUser(client, g.purchaser_id, 'gift_redeemed', { redeemer: u.name || '', months: monthsLabel(g.months, u.locale), path: '/account#gifts' }, `gift-red:${g.id}`);
      }
      await client.query('COMMIT');
      return { months: g.months, premiumUntil: u.premium_until, hasSubscription: sub.rowCount > 0 };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // --- Administration
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/admin/gifts', adminOnly, async (req) => {
    const { status, q } = z.object({ status: z.enum(['pending', 'paid', 'redeemed', 'void']).optional(), q: z.string().max(100).optional() }).parse(req.query);
    const params = [];
    const where = [];
    if (status) { params.push(status); where.push(`g.status = $${params.length}`); }
    if (q) { params.push(`%${q.trim()}%`); where.push(`(g.code ILIKE $${params.length} OR p.email ILIKE $${params.length} OR g.recipient_email ILIKE $${params.length} OR r.email ILIKE $${params.length})`); }
    const { rows } = await pool.query(
      `SELECT g.id, g.code, g.months, g.status, g.source, g.amount, g.currency, g.note, g.created_at AS "createdAt", g.paid_at AS "paidAt", g.redeemed_at AS "redeemedAt",
              g.voided_at AS "voidedAt", g.refunded_at AS "refundedAt", g.recipient_email AS "recipientEmail", p.email AS "purchaserEmail", r.email AS "redeemerEmail"
         FROM gift_cards g LEFT JOIN users p ON p.id = g.purchaser_id LEFT JOIN users r ON r.id = g.redeemed_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY g.created_at DESC LIMIT 300`, params);
    const t = (await pool.query(
      `SELECT count(*) FILTER (WHERE status = 'paid')::int AS available, count(*) FILTER (WHERE status = 'redeemed')::int AS redeemed,
              count(*) FILTER (WHERE status = 'void')::int AS voided,
              coalesce(sum(amount) FILTER (WHERE source = 'stripe' AND status IN ('paid', 'redeemed')), 0)::int AS revenue
         FROM gift_cards`)).rows[0];
    return { gifts: rows, totals: t, currency: await getSetting('plan_currency') };
  });

  // Cartes offertes par l'agence (partenariats, concours, excuses) : aucun paiement, aucun e-mail, codes renvoyés à l'écran.
  app.post('/admin/gifts/generate', adminOnly, async (req) => {
    const b = z.object({ months: z.coerce.number().int().refine((n) => GIFT_MONTHS.includes(n)), count: z.coerce.number().int().min(1).max(50), note: z.string().trim().max(200).optional() }).parse(req.body ?? {});
    const codes = [];
    while (codes.length < b.count) {
      const code = newCode();
      const r = await pool.query(
        `INSERT INTO gift_cards(code, months, status, source, note, paid_at) VALUES ($1, $2, 'paid', 'admin', $3, now()) ON CONFLICT (code) DO NOTHING`, [code, b.months, b.note || null]);
      if (r.rowCount) codes.push(code);
    }
    return { codes };
  });

  app.post('/admin/gifts/:id/void', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query("UPDATE gift_cards SET status = 'void', voided_at = now() WHERE id = $1 AND status = 'paid' RETURNING id", [id]);
    if (!r.rowCount) return reply.code(409).send({ error: "Seule une carte payée et non activée peut être annulée" });
    return { id, status: 'void' };
  });
}
