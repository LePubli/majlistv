// Abonnements Stripe : formules, paiement (Checkout), gestion (portail client) et webhook.
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';

const sc = config.stripe;
const enabled = Boolean(sc.secretKey && sc.priceMonthly && sc.priceYearly);

function makeStripe() {
  const opts = { maxNetworkRetries: 2, timeout: 20000 };
  if (sc.apiBase) {
    const u = new URL(sc.apiBase);
    Object.assign(opts, { host: u.hostname, port: u.port, protocol: u.protocol.replace(':', '') });
  }
  return new Stripe(sc.secretKey, opts);
}

const toDate = (sec) => (sec ? new Date(sec * 1000) : null);

export default async function billingRoutes(app) {
  const stripe = enabled ? makeStripe() : null;
  const off = (reply) => reply.code(503).send({ error: "Le paiement n'est pas configuré" });
  const PRICES = { month: sc.priceMonthly, year: sc.priceYearly };

  // --- Formules (public) : montants lus chez Stripe, donc modifiables sans toucher au code ---
  let plansCache = { at: 0, data: null };
  app.get('/billing/plans', async (req, reply) => {
    if (!enabled) return { enabled: false, plans: [], trialDays: 0 };
    if (!plansCache.data || Date.now() - plansCache.at > 10 * 60 * 1000) {
      try {
        const plans = [];
        for (const [interval, id] of Object.entries(PRICES)) {
          const p = await stripe.prices.retrieve(id);
          plans.push({ interval, amount: p.unit_amount, currency: p.currency });
        }
        plansCache = { at: Date.now(), data: plans };
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({ error: 'Tarifs indisponibles' });
      }
    }
    return { enabled: true, plans: plansCache.data, trialDays: sc.trialDays };
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
    const active = Boolean(sub) && ['trialing', 'active', 'past_due'].includes(sub.status)
      && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date(Date.now() - 2 * 86400000));
    return { enabled, active, subscription: sub };
  });

  // Client Stripe de l'utilisateur (créé à la première souscription).
  async function customerFor(userId) {
    const { rows } = await pool.query('SELECT id, email, name, stripe_customer_id FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (user.stripe_customer_id) return user.stripe_customer_id;
    const customer = await stripe.customers.create(
      { email: user.email, name: user.name, metadata: { user_id: user.id } },
      { idempotencyKey: `customer-${user.id}` }
    );
    // Deux requêtes simultanées : la première enregistrée gagne.
    const res = await pool.query(
      'UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $1 RETURNING stripe_customer_id',
      [userId, customer.id]
    );
    return res.rows[0].stripe_customer_id;
  }

  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/billing/checkout', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    if (!enabled) return off(reply);
    const { interval } = z.object({ interval: z.enum(['month', 'year']) }).parse(req.body);
    const live = await pool.query(
      "SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due') LIMIT 1", [req.user.sub]);
    if (live.rowCount) return reply.code(409).send({ error: 'Abonnement déjà actif : utilise « Gérer mon abonnement »' });
    // L'essai gratuit n'est offert qu'une fois par compte.
    const before = await pool.query('SELECT 1 FROM subscriptions WHERE user_id = $1 LIMIT 1', [req.user.sub]);
    const customer = await customerFor(req.user.sub);
    const subscription_data = { metadata: { user_id: req.user.sub } };
    if (sc.trialDays > 0 && !before.rowCount) subscription_data.trial_period_days = sc.trialDays;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: req.user.sub,
      line_items: [{ price: PRICES[interval], quantity: 1 }],
      subscription_data,
      allow_promotion_codes: true,
      success_url: `${config.webUrl}/account?billing=success`,
      cancel_url: `${config.webUrl}/pricing?canceled=1`,
    });
    return { url: session.url };
  });

  app.post('/billing/portal', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    if (!enabled) return off(reply);
    const { rows } = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.sub]);
    if (!rows[0]?.stripe_customer_id) return reply.code(404).send({ error: "Aucun abonnement pour l'instant" });
    const session = await stripe.billingPortal.sessions.create({
      customer: rows[0].stripe_customer_id,
      return_url: `${config.webUrl}/account`,
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
      if (!enabled || !sc.webhookSecret) return off(reply);
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], sc.webhookSecret);
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
            const sub = await stripe.subscriptions.retrieve(obj.subscription);
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
