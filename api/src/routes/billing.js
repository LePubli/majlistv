// Abonnements Stripe : formules, paiement (Checkout), gestion (portail client) et webhook.
// Clés, prix et durée d'essai sont lus dans les paramètres du back-office (pas besoin de redéployer pour les changer).
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getSetting, getNumber, isOn } from '../settings.js';
import { enqueueForUser } from '../mailer.js';
import { fmtDate, fmtMoney } from '../emails.js';
import { hasLearningTier } from '../access.js';
import { applyGiftPaid, applyGiftRefund } from '../gifts.js';
import { recordInvoicePaid, recordChargeRefund } from '../revenue.js';

// Texte de renonciation au droit de rétractation (contenu numérique). Changer le texte = changer la version.
export const WAIVER_VERSION = '2026-10-12';
export const WAIVER_TEXT = {
  fr: "Je demande l'accès immédiat aux conférences et je reconnais perdre mon droit de rétractation de 14 jours dès le début de l'accès (article L221-28 du Code de la consommation). J'accepte les conditions générales de vente.",
  en: 'I request immediate access to the conferences and acknowledge that I lose my 14-day right of withdrawal once access begins. I accept the terms of sale.',
  ar: 'أطلب الوصول الفوري إلى المحاضرات وأقرّ بفقدان حقي في التراجع خلال 14 يومًا بمجرد بدء الوصول. أوافق على شروط البيع.',
};
const SUBMIT_TEXT = {
  fr: "Sans résiliation, l'abonnement se renouvelle automatiquement. Résiliable à tout moment depuis Mon compte.",
  en: 'Unless cancelled, the subscription renews automatically. Cancel any time from My account.',
  ar: 'يتجدد الاشتراك تلقائيًا ما لم يُلغَ. يمكن الإلغاء في أي وقت من صفحة حسابي.',
};
const lang2 = (l) => (['fr', 'en', 'ar'].includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

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

// Client Stripe seul (cartes cadeaux : paiement unique, sans identifiants de prix), ou null si la clé secrète n'est pas saisie.
export async function stripeClient() {
  const secret = await getSetting('stripe_secret_key');
  if (!secret) return null;
  if (clientCache.key !== secret) clientCache = { key: secret, client: makeStripe(secret) };
  return clientCache.client;
}

// Configuration Stripe actuelle, ou null si le paiement n'est pas configuré.
export async function stripeContext() {
  const [secret, monthly, yearly, lm, ly] = await Promise.all([getSetting('stripe_secret_key'), getSetting('stripe_price_monthly'), getSetting('stripe_price_yearly'),
    getSetting('stripe_price_learn_monthly'), getSetting('stripe_price_learn_yearly')]);
  if (!secret || !monthly || !yearly) return null;
  if (clientCache.key !== secret) clientCache = { key: secret, client: makeStripe(secret) };
  // Palier Apprentissage : vendu seulement si ses deux prix sont renseignés.
  return { stripe: clientCache.client, prices: { month: monthly, year: yearly }, learn: lm && ly ? { month: lm, year: ly } : null };
}

// Prix affichés saisis dans le back-office (centimes). Servent à montrer les formules tant que Stripe n'est pas configuré.
const toCents = (v) => { const n = Math.round(Number(String(v || '').replace(',', '.')) * 100); return Number.isFinite(n) && n > 0 ? n : 0; };
async function listedPlans(tier = 'standard') {
  const currency = await getSetting('plan_currency');
  const out = [];
  const keys = tier === 'learning' ? [['month', 'plan_learn_price_monthly'], ['year', 'plan_learn_price_yearly']] : [['month', 'plan_price_monthly'], ['year', 'plan_price_yearly']];
  for (const [interval, key] of keys) {
    const amount = toCents(await getSetting(key));
    if (amount) out.push({ interval, amount, currency });
  }
  return out;
}
const methodsList = async () => (isOn(await getSetting('paypal_enabled')) ? ['card', 'paypal'] : ['card']);

export default async function billingRoutes(app) {
  const off = (reply) => reply.code(503).send({ error: "Le paiement n'est pas configuré" });

  // --- Formules (public) : toujours affichées. Avec Stripe, les montants sont lus chez Stripe (donc modifiables sans toucher
  // au code) ; sinon ce sont les prix saisis dans le back-office, et le paiement est annoncé « bientôt disponible » (enabled: false).
  let plansCache = { sig: '', at: 0, data: null };
  app.get('/billing/plans', async (req) => {
    const ctx = await stripeContext();
    const trialDays = await getNumber('trial_days');
    const methods = await methodsList();
    // `plans` : formule standard (inchangé). `learning` : palier Apprentissage (mêmes champs).
    const fromSettings = async () => ({
      enabled: false, source: 'settings', plans: await listedPlans(), trialDays, methods,
      learning: { enabled: false, plans: await listedPlans('learning') },
    });
    if (!ctx) return fromSettings();
    const sig = `${clientCache.key}|${ctx.prices.month}|${ctx.prices.year}|${ctx.learn?.month || ''}|${ctx.learn?.year || ''}`;
    if (!plansCache.data || plansCache.sig !== sig || Date.now() - plansCache.at > 10 * 60 * 1000) {
      try {
        const get = async (prices) => {
          const out = [];
          for (const [interval, id] of Object.entries(prices)) {
            const p = await ctx.stripe.prices.retrieve(id);
            out.push({ interval, amount: p.unit_amount, currency: p.currency });
          }
          return out;
        };
        plansCache = { sig, at: Date.now(), data: { standard: await get(ctx.prices), learning: ctx.learn ? await get(ctx.learn) : [] } };
      } catch (err) {
        // Stripe injoignable : on montre quand même les formules, mais on ne propose pas de payer.
        req.log.error(err);
        return fromSettings();
      }
    }
    // Palier Apprentissage non configuré chez Stripe : on montre les prix saisis, sans bouton de paiement.
    const learning = ctx.learn ? { enabled: true, plans: plansCache.data.learning } : { enabled: false, plans: await listedPlans('learning') };
    return { enabled: true, source: 'stripe', plans: plansCache.data.standard, trialDays, methods, learning };
  });

  // --- Mon abonnement ---
  app.get('/billing/status', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT status, tier, billing_interval AS interval, current_period_end AS "currentPeriodEnd", trial_end AS "trialEnd",
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
    const active = paid || Boolean(complimentaryUntil);
    // Palier : « learning » = Apprentissage (aussi pour un administrateur) ; « standard » = visionnage + quiz de fin de vidéo.
    const learning = await hasLearningTier(req.user.sub);
    return { enabled: Boolean(await stripeContext()), active, tier: learning ? 'learning' : active ? 'standard' : null, learning, subscription: sub, complimentaryUntil };
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
    const { interval, tier, waiver, returnTo } = z.object({ interval: z.enum(['month', 'year']), tier: z.enum(['standard', 'learning']).default('standard'), waiver: z.boolean().optional(), returnTo: z.string().max(300).optional() }).parse(req.body);
    if (tier === 'learning' && !ctx.learn) return reply.code(503).send({ error: "La formule Apprentissage n'est pas encore disponible" });
    const priceId = (tier === 'learning' ? ctx.learn : ctx.prices)[interval];
    // Page à retrouver après le paiement (ex. la conférence qui a donné envie de s'abonner) : chemin du site uniquement.
    const back = returnTo && /^\/(?![\/\\])/.test(returnTo) ? returnTo : '';
    // Renonciation expresse au droit de rétractation, exigée avant tout paiement (contenu numérique).
    if (waiver !== true) return reply.code(400).send({ error: 'Merci de cocher la case de renonciation au droit de rétractation.', code: 'waiver_required' });
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
    const { rows: me } = await pool.query('SELECT email, locale FROM users WHERE id = $1', [req.user.sub]);
    const l = lang2(me[0].locale);
    // Preuve horodatée du consentement (texte exact, version, adresse IP, navigateur).
    await pool.query(
      `INSERT INTO consents(user_id, email, kind, version, text, context, ip, user_agent) VALUES ($1, $2, 'withdrawal_waiver', $3, $4, $5, $6, $7)`,
      [req.user.sub, me[0].email, WAIVER_VERSION, WAIVER_TEXT[l], `checkout:${tier}:${interval}`, req.ip, String(req.headers['user-agent'] || '').slice(0, 300)]
    );
    const params = {
      mode: 'subscription',
      customer,
      client_reference_id: req.user.sub,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data,
      allow_promotion_codes: true, // codes promo créés dans Stripe → Produits → Coupons
      custom_text: { submit: { message: SUBMIT_TEXT[l] } },
      locale: l === 'ar' ? 'auto' : l,
      success_url: `${webUrl}/account?billing=success${back ? `&next=${encodeURIComponent(back)}` : ''}`,
      cancel_url: `${webUrl}/pricing?canceled=1${back ? `&from=${encodeURIComponent(back)}` : ''}`,
    };
    if (isOn(await getSetting('stripe_automatic_tax'))) {
      // TVA calculée par Stripe Tax selon l'adresse du client (prix « taxes incluses » recommandés).
      Object.assign(params, {
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        customer_update: { address: 'auto', name: 'auto' },
        tax_id_collection: { enabled: true },
      });
    }
    // PayPal (via Stripe) : demandé explicitement quand l'option est active ; si Stripe le refuse (PayPal pas encore activé
    // sur le compte, ou indisponible pour cet abonnement), on retombe sur le choix automatique de Stripe (carte) plutôt que d'échouer.
    let session;
    if (isOn(await getSetting('paypal_enabled'))) {
      try {
        session = await ctx.stripe.checkout.sessions.create({ ...params, payment_method_types: ['card', 'paypal'] });
      } catch (err) {
        if (!(err && err.type === 'StripeInvalidRequestError' && /payment_method/i.test(`${err.param || ''} ${err.message || ''}`))) throw err;
        req.log.warn(`PayPal refusé par Stripe, paiement par carte : ${err.message}`);
      }
    }
    if (!session) session = await ctx.stripe.checkout.sessions.create(params);
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
      const learnIds = [await getSetting('stripe_price_learn_monthly'), await getSetting('stripe_price_learn_yearly')].filter(Boolean);
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
        `INSERT INTO subscriptions (id, user_id, status, price_id, billing_interval, current_period_end, trial_end, cancel_at_period_end, event_created, tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, price_id = EXCLUDED.price_id, billing_interval = EXCLUDED.billing_interval, tier = EXCLUDED.tier,
           current_period_end = EXCLUDED.current_period_end, trial_end = EXCLUDED.trial_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end, event_created = EXCLUDED.event_created, updated_at = now()
         WHERE subscriptions.event_created <= EXCLUDED.event_created`,
        [sub.id, userId, sub.status, item?.price?.id || null, item?.price?.recurring?.interval || null,
          toDate(periodEnd), toDate(sub.trial_end), Boolean(sub.cancel_at_period_end || sub.cancel_at), eventCreated,
          learnIds.includes(item?.price?.id) ? 'learning' : 'standard']
      );
      if (customerId) await client.query('UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $1', [userId, customerId]);
      return true;
    }

    // Utilisateur lié à un client Stripe (ou à l'abonnement via ses métadonnées).
    async function userFor(client, obj) {
      const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
      if (customerId) {
        const u = await client.query('SELECT id, locale FROM users WHERE stripe_customer_id = $1', [customerId]);
        if (u.rows[0]) return u.rows[0];
      }
      const meta = obj.metadata?.user_id || obj.subscription_details?.metadata?.user_id;
      if (meta) {
        const u = await client.query('SELECT id, locale FROM users WHERE id = $1', [meta]);
        if (u.rows[0]) return u.rows[0];
      }
      return null;
    }

    // E-mails liés au paiement. Chaque envoi a une clé unique : un événement rejoué n'envoie rien en double.
    async function notify(client, event) {
      const obj = event.data.object;
      const user = await userFor(client, obj);
      if (!user) return;
      const loc = user.locale;
      if (event.type === 'customer.subscription.trial_will_end' && obj.trial_end) {
        const price = obj.items?.data?.[0]?.price;
        await enqueueForUser(client, user.id, 'trial_ending', {
          date: fmtDate(obj.trial_end * 1000, loc), amount: price ? fmtMoney(price.unit_amount, price.currency, loc) : '',
          interval: price?.recurring?.interval, path: '/account',
        }, `trial_end:${obj.id}:${obj.trial_end}`);
      } else if (event.type === 'customer.subscription.updated' && obj.cancel_at_period_end && event.data.previous_attributes
        && event.data.previous_attributes.cancel_at_period_end === false) {
        const end = obj.cancel_at || obj.current_period_end || obj.items?.data?.[0]?.current_period_end;
        await enqueueForUser(client, user.id, 'subscription_canceled', { date: end ? fmtDate(end * 1000, loc) : '', path: '/account' }, `cancel:${obj.id}:${end}`);
      } else if (event.type === 'customer.subscription.deleted') {
        await enqueueForUser(client, user.id, 'subscription_ended', { path: '/pricing' }, `ended:${obj.id}`);
      } else if (event.type === 'invoice.paid' && obj.amount_paid > 0) {
        await enqueueForUser(client, user.id, 'payment_succeeded', {
          amount: fmtMoney(obj.amount_paid, obj.currency, loc), url: obj.hosted_invoice_url || undefined, path: obj.hosted_invoice_url ? undefined : '/account',
        }, `paid:${obj.id}`);
      } else if (event.type === 'invoice.payment_failed') {
        await enqueueForUser(client, user.id, 'payment_failed', { amount: fmtMoney(obj.amount_due, obj.currency, loc), path: '/account' }, `failed:${obj.id}:${obj.attempt_count || 1}`);
      }
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
            await notify(client, event);
          } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
            await notify(client, event);
            if (event.type === 'invoice.paid') await recordInvoicePaid(client, obj); // base de la rémunération des chaînes (étape D)
          } else if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.mode === 'payment' && obj.metadata?.gift_id) {
            await applyGiftPaid(client, obj); // carte cadeau payée
          } else if (event.type === 'charge.refunded') {
            await applyGiftRefund(client, obj);
            await recordChargeRefund(client, obj);
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
