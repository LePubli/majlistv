// Abonnements Stripe : formules, paiement (Checkout), gestion (portail client) et webhook.
// Clés, prix et durée d'essai sont lus dans les paramètres du back-office (pas besoin de redéployer pour les changer).
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getSetting, getNumber } from '../settings.js';

const toDate = (sec) => (sec ? new Date(sec * 1000) : null);

export function makeStripe(secretKey) {
  const opts = { maxNetworkRetries: 2, timeout: 20000 };
  if (config.stripe.apiBase) { // réservé aux tests (faux serveur Stripe)
    const u = new URL(config.stripe.apiBase);
    Object.assign(opts, { host: u.hostname, port: u.port, protocol: u.protocol.replace(':', '') });
  }
  return new Stripe(secretKey, opts);
}

let clientCache = { key: null, client: null };

// Configuration Stripe actuelle, ou null si le paiement n'est pas configuré.
export async function stripeContext() {
  const [secret, monthly, yearly] = await Promise.all([getSetting('stripe_secret_key'), getSetting('stripe_price_monthly'), getSetting('stripe_price_yearly')]);
  if (!secret || !monthly || !yearly) return null;
  if (clientCache.key !== secret) clientCache = { key: secret, client: makeStripe(secret) };
  return { stripe: clientCache.client, prices: { month: monthly, year: yearly } };
}

export default async function billingRoutes(app) {
  const off = (reply) => reply.code(503).send({ error: "Le paiement n'est pas configuré" });

  // --- Formules (public) : montants lus chez Stripe, donc modifiables sans toucher au code ---
  let plansCache = { sig: '', at: 0, data: null };
  app.get('/billing/plans', async (req, reply) => {
    const ctx = await stripeContext();
    if (!ctx) return { enabled: false, plans: [], trialDays: 0 };
    const trialDays = await getNumber('trial_days');
    const sig = `${clientCache.key}|${ctx.prices.month}|${ctx.prices.year}`;
    if (!plansCache.data || plansCache.sig !== sig || Date.now() - plansCache.at > 10 * 60 * 1000) {
      try {
        const plans = [];
        for (const [interval, id] of Object.entries(ctx.prices)) {
          const p = await ctx.stripe.prices.retrieve(id);
          plans.push({ interval, amount: p.unit_amount, currency: p.currency });
        }
        plansCache = { sig, at: Date.now(), data: plans };
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({ error: 'Tarifs indisponibles' });
      }
    }
    return { enabled: true, plans: plansCache.data, trialDays };
  });

  // --- Mon abonnement ---
  app.get('/billing/status', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT status, billing_interval AS interval, current_period_end AS "currentPeriodEnd", trial_end AS "trialEnd",
              cancel_at_period_end AS "cancelAtPeriodEnd"
         FROM subscriptions WHERE user_id = $1
        ORDER BY (status IN ('trialing', 'active', 'past_due')) DESC, updated_at DESC LIMIT 1`,
      [req.user.sub]
    );
    const sub = rows[0] || null;
    const { rows: u } = await pool.query('SELECT premium_until FROM users WHERE id = $1', [req.user.sub]);
    const complimentaryUntil = u[0]?.premium_until && new Date(u[0].premium_until) > new Date() ? u[0].premium_until : null;
    const paid = Boolean(sub) && ['trialing', 'active', 'past_due'].includes(sub.status)
      && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date(Date.now() - 2 * 86400000));
    return { enabled: Boolean(await stripeContext()), active: paid || Boolean(complimentaryUntil), subscription: sub, complimentaryUntil };
  });

  // Client Stripe de l'utilisateur (créé à la première souscription, recréé si le compte Stripe a changé).
  async function customerFor(stripe, userId) {
    const { rows } = await pool.query('SELECT id, email, name, stripe_customer_id FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (user.stripe_customer_id) {
      try {
        const c = await stripe.customers.retrieve(user.stripe_customer_id);
        if (!c.deleted) return user.stripe_customer_id;
      } catch (err) {
        if (err.code !== 'resource_missing') throw err;
      }
    }
    const customer = await stripe.customers.create(
      { email: user.email, name: user.name, metadata: { user_id: user.id } },
      { idempotencyKey: `customer-${user.id}-${Date.now() - (Date.now() % 60000)}` }
    );
    const res = await pool.query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1 RETURNING stripe_customer_id', [userId, customer.id]);
    return res.rows[0].stripe_customer_id;
  }

  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/billing/checkout', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    const ctx = await stripeContext();
    if (!ctx) return off(reply);
    const { interval } = z.object({ interval: z.enum(['month', 'year']) }).parse(req.body);
    const live = await pool.query(
      "SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due') LIMIT 1", [req.user.sub]);
    if (live.rowCount) return reply.code(409).send({ error: 'Abonnement déjà actif : utilise « Gérer mon abonnement »' });
    // L'essai gratuit n'est offert qu'une fois par compte.
    const before = await pool.query('SELECT 1 FROM subscriptions WHERE user_id = $1 LIMIT 1', [req.user.sub]);
    const customer = await customerFor(ctx.stripe, req.user.sub);
    const trialDays = await getNumber('trial_days');
    const webUrl = await getSetting('web_url');
    const subscription_data = { metadata: { user_id: req.user.sub } };
    if (trialDays > 0 && !before.rowCount) subscription_data.trial_period_days = trialDays;
    const session = await ctx.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: req.user.sub,
      line_items: [{ price: ctx.prices[interval], quantity: 1 }],
      subscription_data,
      allow_promotion_codes: true,
      success_url: `${webUrl}/account?billing=success`,
      cancel_url: `${webUrl}/pricing?canceled=1`,
    });
    return { url: session.url };
  });

  app.post('/billing/portal', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    const ctx = await stripeContext();
    if (!ctx) return off(reply);
    const { rows } = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.sub]);
    if (!rows[0]?.stripe_customer_id) return reply.code(404).send({ error: "Aucun abonnement pour l'instant" });
    const session = await ctx.stripe.billingPortal.sessions.create({
      customer: rows[0].stripe_customer_id,
      return_url: `${await getSetting('web_url')}/account`,
    });
    return { url: session.url };
  });

  // --- Webhook : Stripe appelle cette adresse, la signature garantit qu'il s'agit bien de Stripe ---
  await app.register(async (hook) => {
    // Corps brut indispensable pour vérifier la signature.
    hook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => done(null, body));

    async function applySubscription(client, sub, eventCreated) {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      let userId = sub.metadata?.user_id || null;
      if (customerId) {
        const u = await client.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
        if (u.rows[0]) userId = u.rows[0].id;
      }
      if (!userId) return false;
      const found = await client.query('SELECT 1 FROM users WHERE id = $1', [userId]);
      if (!found.rowCount) return false;
      const item = sub.items?.data?.[0];
      // Selon la version de l'API Stripe, la fin de période est sur l'abonnement ou sur son article.
      const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
      await client.query(
        `INSERT INTO subscriptions (id, user_id, status, price_id, billing_interval, current_period_end, trial_end, cancel_at_period_end, event_created)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, price_id = EXCLUDED.price_id, billing_interval = EXCLUDED.billing_interval,
           current_period_end = EXCLUDED.current_period_end, trial_end = EXCLUDED.trial_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end, event_created = EXCLUDED.event_created, updated_at = now()
         WHERE subscriptions.event_created <= EXCLUDED.event_created`,
        [sub.id, userId, sub.status, item?.price?.id || null, item?.price?.recurring?.interval || null,
          toDate(periodEnd), toDate(sub.trial_end), Boolean(sub.cancel_at_period_end || sub.cancel_at), eventCreated]
      );
      if (customerId) await client.query('UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $1', [userId, customerId]);
      return true;
    }

    hook.post('/billing/webhook', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply) => {
      const ctx = await stripeContext();
      const whSecret = await getSetting('stripe_webhook_secret');
      if (!ctx || !whSecret) return off(reply);
      let event;
      try {
        event = ctx.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], whSecret);
      } catch {
        return reply.code(400).send({ error: 'Signature invalide' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const fresh = await client.query('INSERT INTO stripe_events(id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING', [event.id, event.type]);
        if (fresh.rowCount) {
          const obj = event.data.object;
          if (event.type.startsWith('customer.subscription.')) {
            await applySubscription(client, obj, event.created);
          } else if (event.type === 'checkout.session.completed' && obj.mode === 'subscription' && obj.subscription) {
            // Filet de sécurité si l'événement d'abonnement arrive plus tard : on récupère l'état actuel chez Stripe.
            const sub = await ctx.stripe.subscriptions.retrieve(obj.subscription);
            await applySubscription(client, sub, event.created);
          }
        }
        await client.query('COMMIT');
        return { received: true };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        req.log.error(err);
        return reply.code(500).send({ error: 'Traitement impossible' }); // Stripe réessaiera
      } finally {
        client.release();
      }
    });
  });
}
