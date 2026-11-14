// Étape C-1 — Contenus payants à l'unité : vente (Studio), paiement Stripe, « Mes achats », administration (liste, remboursement).
//   POST /sales/checkout                       connecté : achat ou location d'un contenu → page de paiement Stripe
//   GET  /me/purchases                         connecté : mes achats et locations (payés ou remboursés)
//   GET|PUT|DELETE /studio/sales/:kind/:id     administrateur, ou organisateur propriétaire du contenu : prix de vente
//   GET  /admin/sales                          administrateur : ventes, totaux
//   POST /admin/sales/:id/refund               administrateur : remboursement complet (Stripe) → l'accès s'arrête
// :kind = talk (vidéo) ou audyn (livre audio, podcast). Le webhook Stripe (routes/billing.js) confirme le paiement (sales.js).
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting, isOn } from '../settings.js';
import { stripeClient } from './billing.js';
import { hasActiveSubscription } from '../access.js';
import { viaChannel } from '../channelAccess.js';
import { visibleSql } from '../visibility.js';
import {
  SALE_KINDS, SALE_TERMS_TEXT, SALE_TERMS_VERSION, MIN_CENTS, MAX_CENTS, getOffer, memberPrice, ownedBy, parseCents, saleShape,
} from '../sales.js';

const lang2 = (l) => (['fr', 'en', 'ar'].includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');
const itemParams = z.object({ kind: z.enum(SALE_KINDS), id: z.guid() });
const pathOf = (kind, id) => (kind === 'talk' ? `/talk/${id}` : `/audyn/${id}`);
const PROD = { talk: { fr: 'Vidéo', en: 'Video', ar: 'فيديو' }, audyn: { fr: 'Audio', en: 'Audio', ar: 'صوت' } };
const MODE = { buy: { fr: 'achat', en: 'purchase', ar: 'شراء' }, rent: { fr: 'location', en: 'rental', ar: 'استئجار' } };

// Contenu vendable : titre, propriétaire, visibilité publique. null si introuvable (ou module Audyn absent).
async function itemInfo(kind, id) {
  if (kind === 'talk') {
    return (await pool.query(
      `SELECT t.id, t.title, t.speaker, t.organizer_id AS owner, t.access, ${visibleSql('t')} AS visible FROM talks t WHERE t.id = $1`, [id])).rows[0] || null;
  }
  try {
    return (await pool.query(
      `SELECT i.id, i.title, i.created_by AS owner, i.access, (i.status = 'published') AS visible FROM audyn_items i WHERE i.id = $1`, [id])).rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null; // module Audyn retiré du code
    throw err;
  }
}

// Administrateur, ou organisateur propriétaire du contenu (vidéo : aussi via sa chaîne).
async function canPrice(user, kind, item) {
  if (user.role === 'admin') return true;
  if (user.role !== 'organizer') return false;
  if (item.owner && item.owner === user.sub) return true;
  return kind === 'talk' ? viaChannel(user, { speaker: item.speaker }) : false;
}

const offerOut = (o) => (o ? {
  buyCents: o.buy_cents, rentCents: o.rent_cents, rentHours: o.rent_hours, memberDiscountPct: o.member_discount_pct,
  memberBuyCents: memberPrice(o.buy_cents, o.member_discount_pct), memberRentCents: memberPrice(o.rent_cents, o.member_discount_pct),
  updatedAt: o.updated_at,
} : null);

export default async function salesRoutes(app) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const auth = { preHandler: app.authenticate };
  const adminOnly = { preHandler: app.requireRole('admin') };

  // --- Achat / location ------------------------------------------------------------------------------------------------
  app.post('/sales/checkout', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    const b = z.object({ kind: z.enum(SALE_KINDS), id: z.guid(), mode: z.enum(['buy', 'rent']), terms: z.boolean().optional() }).parse(req.body ?? {});
    if (b.terms !== true) return reply.code(400).send({ error: "Merci d'accepter les conditions de vente.", code: 'terms_required' });
    const stripe = await stripeClient();
    if (!stripe) return reply.code(503).send({ error: "Le paiement n'est pas disponible pour l'instant", code: 'payment_off' });
    const item = await itemInfo(b.kind, b.id);
    if (!item || !item.visible) return reply.code(404).send({ error: 'Contenu introuvable' });
    const offer = await getOffer(b.kind, b.id);
    const base = offer ? (b.mode === 'buy' ? offer.buy_cents : offer.rent_cents) : null;
    if (!base) return reply.code(400).send({ error: b.mode === 'buy' ? "Ce contenu n'est pas en vente." : "Ce contenu ne se loue pas.", code: 'not_for_sale' });
    const isOwner = req.user.role === 'admin' || item.owner === req.user.sub || (b.kind === 'talk' && await viaChannel(req.user, { speaker: item.speaker }));
    if (isOwner) return reply.code(409).send({ error: 'Vous avez déjà accès à ce contenu (vous en êtes le responsable).', code: 'owner' });
    const owned = await ownedBy(req.user.sub, b.kind, b.id);
    if (owned?.mode === 'buy') return reply.code(409).send({ error: 'Vous avez déjà acheté ce contenu.', code: 'owned' });
    if (owned && b.mode === 'rent') return reply.code(409).send({ error: 'Votre location est encore en cours.', code: 'rented' });

    const member = await hasActiveSubscription(req.user.sub);
    const amount = member ? memberPrice(base, offer.member_discount_pct) : base;
    const me = (await pool.query('SELECT email, locale FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const l = lang2(me.locale);
    const currency = await getSetting('plan_currency');
    const webUrl = await getSetting('web_url');
    // Paiements jamais terminés : nettoyés au passage.
    await pool.query("DELETE FROM sale_purchases WHERE status = 'pending' AND created_at < now() - interval '3 days'");
    const p = (await pool.query(
      `INSERT INTO sale_purchases(user_id, email, kind, item_id, title, mode, amount, currency, member_price, rent_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.user.sub, me.email, b.kind, b.id, String(item.title).slice(0, 300), b.mode, amount, currency, member && amount !== base, b.mode === 'rent' ? offer.rent_hours : null])).rows[0];
    await pool.query(
      `INSERT INTO consents(user_id, email, kind, version, text, context, ip, user_agent) VALUES ($1, $2, 'sale_terms', $3, $4, $5, $6, $7)`,
      [req.user.sub, me.email, SALE_TERMS_VERSION, SALE_TERMS_TEXT[l], `sale:${b.kind}:${b.id}:${b.mode}`, req.ip, String(req.headers['user-agent'] || '').slice(0, 300)]);
    const tax = isOn(await getSetting('stripe_automatic_tax'));
    const label = `${PROD[b.kind][l]} · ${String(item.title).slice(0, 200)} (${MODE[b.mode][l]}${b.mode === 'rent' ? ` ${offer.rent_hours} h` : ''})`;
    const params = {
      mode: 'payment',
      customer_email: me.email,
      client_reference_id: req.user.sub,
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount, ...(tax ? { tax_behavior: 'inclusive' } : {}), product_data: { name: label } } }],
      metadata: { sale_purchase_id: p.id, user_id: req.user.sub },
      payment_intent_data: { metadata: { sale_purchase_id: p.id } },
      allow_promotion_codes: true,
      locale: l === 'ar' ? 'auto' : l,
      success_url: `${webUrl}${pathOf(b.kind, b.id)}?paid=1`,
      cancel_url: `${webUrl}${pathOf(b.kind, b.id)}?canceled=1`,
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
    await pool.query('UPDATE sale_purchases SET stripe_session_id = $2 WHERE id = $1', [p.id, session.id]);
    return { url: session.url, amount, currency };
  });

  app.get('/me/purchases', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, kind, item_id AS "itemId", title, mode, amount, currency, member_price AS "memberPrice", status,
              paid_at AS "paidAt", expires_at AS "expiresAt", refunded_at AS "refundedAt",
              (status = 'paid' AND (expires_at IS NULL OR expires_at > now())) AS active
         FROM sale_purchases WHERE user_id = $1 AND status <> 'pending' ORDER BY created_at DESC LIMIT 200`, [req.user.sub]);
    return rows;
  });

  // --- Studio : prix de vente --------------------------------------------------------------------------------------------
  async function guard(req, reply) {
    if (req.user.role !== 'admin' && req.user.role !== 'organizer') { reply.code(403).send({ error: "Seuls l'administrateur et les organisateurs fixent des prix." }); return null; }
    const { kind, id } = itemParams.parse(req.params);
    const item = await itemInfo(kind, id);
    if (!item) { reply.code(404).send({ error: 'Contenu introuvable' }); return null; }
    if (!(await canPrice(req.user, kind, item))) { reply.code(403).send({ error: "Seuls l'administrateur et le responsable du contenu fixent son prix." }); return null; }
    return { kind, id, item };
  }

  app.get('/studio/sales/:kind/:id', auth, async (req, reply) => {
    const g = await guard(req, reply); if (!g) return reply;
    const sold = (await pool.query("SELECT count(*)::int AS n, COALESCE(sum(amount), 0)::int AS total FROM sale_purchases WHERE kind = $1 AND item_id = $2 AND status = 'paid'", [g.kind, g.id])).rows[0];
    return { offer: offerOut(await getOffer(g.kind, g.id)), currency: await getSetting('plan_currency'), limits: { minCents: MIN_CENTS, maxCents: MAX_CENTS }, sold };
  });

  app.put('/studio/sales/:kind/:id', auth, async (req, reply) => {
    const g = await guard(req, reply); if (!g) return reply;
    const b = z.object({
      buyPrice: z.union([z.string().max(20), z.number(), z.null()]).optional(),
      rentPrice: z.union([z.string().max(20), z.number(), z.null()]).optional(),
      rentHours: z.coerce.number().int().min(1).max(720).default(48),
      memberDiscountPct: z.coerce.number().int().min(0).max(90).default(0),
    }).parse(req.body ?? {});
    const buy = parseCents(typeof b.buyPrice === 'number' ? String(b.buyPrice) : b.buyPrice);
    const rent = parseCents(typeof b.rentPrice === 'number' ? String(b.rentPrice) : b.rentPrice);
    if (Number.isNaN(buy) || Number.isNaN(rent)) return reply.code(400).send({ error: `Prix entre ${MIN_CENTS / 100} et ${MAX_CENTS / 100} (ex. 4,99).`, code: 'bad_price' });
    if (buy === null && rent === null) return reply.code(400).send({ error: "Indiquez un prix d'achat, un prix de location, ou les deux.", code: 'no_price' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const o = (await client.query(
        `INSERT INTO sale_offers(kind, item_id, buy_cents, rent_cents, rent_hours, member_discount_pct, prev_access, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (kind, item_id) DO UPDATE SET buy_cents = EXCLUDED.buy_cents, rent_cents = EXCLUDED.rent_cents, rent_hours = EXCLUDED.rent_hours,
           member_discount_pct = EXCLUDED.member_discount_pct, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`, [g.kind, g.id, buy, rent, b.rentHours, b.memberDiscountPct, g.item.access, req.user.sub])).rows[0];
      // Le déclencheur impose l'accès réservé (premium / « Apprentissage ») tant que le contenu est en vente.
      if (g.kind === 'talk') await client.query("UPDATE talks SET access = 'premium' WHERE id = $1", [g.id]);
      else await client.query("UPDATE audyn_items SET access = 'learning' WHERE id = $1", [g.id]);
      await client.query('COMMIT');
      return { offer: offerOut(o) };
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  });

  // Retrait de la vente : l'accès d'avant revient ; les achats et locations déjà payés restent valables.
  app.delete('/studio/sales/:kind/:id', auth, async (req, reply) => {
    const g = await guard(req, reply); if (!g) return reply;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const o = (await client.query('DELETE FROM sale_offers WHERE kind = $1 AND item_id = $2 RETURNING prev_access', [g.kind, g.id])).rows[0];
      if (o) {
        if (g.kind === 'talk') await client.query('UPDATE talks SET access = $2 WHERE id = $1', [g.id, o.prev_access === 'free' ? 'free' : 'premium']);
        else await client.query('UPDATE audyn_items SET access = $2 WHERE id = $1', [g.id, o.prev_access === 'free' ? 'free' : 'learning']);
      }
      await client.query('COMMIT');
      return { ok: true, removed: Boolean(o) };
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  });

  // --- Administration ---------------------------------------------------------------------------------------------------
  app.get('/admin/sales', adminOnly, async (req) => {
    const q = z.object({ status: z.enum(['paid', 'refunded', 'all']).default('all'), limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT p.id, p.kind, p.item_id AS "itemId", p.title, p.mode, p.amount, p.currency, p.member_price AS "memberPrice", p.status,
              p.email, u.name AS "userName", p.paid_at AS "paidAt", p.expires_at AS "expiresAt", p.refunded_at AS "refundedAt"
         FROM sale_purchases p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status <> 'pending' AND ($1 = 'all' OR p.status = $1) ORDER BY p.created_at DESC LIMIT $2`, [q.status, q.limit]);
    const totals = (await pool.query(
      `SELECT count(*) FILTER (WHERE status = 'paid')::int AS paid, COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0)::int AS revenue,
              count(*) FILTER (WHERE status = 'refunded')::int AS refunded,
              COALESCE(sum(amount) FILTER (WHERE status = 'paid' AND paid_at > now() - interval '30 days'), 0)::int AS revenue30
         FROM sale_purchases`)).rows[0];
    const offers = (await pool.query('SELECT count(*)::int AS n FROM sale_offers')).rows[0].n;
    return { items: rows, totals: { ...totals, offers }, currency: await getSetting('plan_currency') };
  });

  app.post('/admin/sales/:id/refund', adminOnly, async (req, reply) => {
    const { id } = z.object({ id: z.guid() }).parse(req.params);
    const p = (await pool.query('SELECT status, stripe_payment_intent FROM sale_purchases WHERE id = $1', [id])).rows[0];
    if (!p) return reply.code(404).send({ error: 'Vente introuvable' });
    if (p.status !== 'paid') return reply.code(409).send({ error: 'Cette vente n\'est pas payée (ou déjà remboursée).', code: 'not_paid' });
    if (!p.stripe_payment_intent) return reply.code(409).send({ error: 'Paiement Stripe inconnu : remboursez depuis le tableau de bord Stripe.', code: 'no_payment' });
    const stripe = await stripeClient();
    if (!stripe) return reply.code(503).send({ error: "Stripe n'est pas configuré" });
    await stripe.refunds.create({ payment_intent: p.stripe_payment_intent, metadata: { sale_purchase_id: id } });
    // Le webhook charge.refunded confirmera aussi ; on coupe l'accès tout de suite.
    await pool.query("UPDATE sale_purchases SET status = 'refunded', refunded_at = now() WHERE id = $1 AND status = 'paid'", [id]);
    return { ok: true };
  });
}

export { saleShape }; // réutilisé par les tests de forme
