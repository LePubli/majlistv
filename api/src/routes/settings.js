// Paramètres du site (clés d'API, Stripe, moteurs IA…) : lecture, enregistrement et tests de connexion. Réservé aux admins.
import { z } from 'zod';
import { pool } from '../db.js';
import { BY_KEY, describeSettings, getSetting, saveSettings, isOn } from '../settings.js';
import { makeStripe, stripeContext } from './billing.js';
import { INDEX, meili, meiliConf, resetIndex, searchStatus } from '../search.js';
import { sendNow, baseVars } from '../mailer.js';
import { renderEmail } from '../emails.js';

// Mode (test/live) et compte d'une clé Stripe : sert à détecter un changement de compte.
const stripeMode = (key) => (/^(sk|rk)_live_/.test(key) ? 'live' : 'test');

async function stripeIdentity(secretKey) {
  const stripe = makeStripe(secretKey);
  const acct = await stripe.accounts.retrieve();
  return { account: acct.id, mode: stripeMode(secretKey) };
}

async function post(url, headers, body, timeout = 20000) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* corps non JSON */ }
  return { status: res.status, json, text };
}

// Un test par moteur : une toute petite requête réelle avec les réglages enregistrés. Renvoie { ok, message }.
const TESTS = {
  async stripe() {
    const ctx = await stripeContext();
    if (!ctx) return { ok: false, message: 'Clé secrète et identifiants de prix à renseigner (et enregistrer) avant le test.' };
    const key = await getSetting('stripe_secret_key');
    const id = await stripeIdentity(key);
    const out = [];
    for (const [interval, price] of Object.entries(ctx.prices)) {
      const p = await ctx.stripe.prices.retrieve(price);
      out.push(`${interval === 'month' ? 'mensuel' : 'annuel'} ${(p.unit_amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`);
    }
    const hook = (await getSetting('stripe_webhook_secret')) ? 'secret de webhook défini' : 'ATTENTION : secret de webhook manquant';
    return { ok: true, message: `Connexion réussie (mode ${id.mode}, compte ${id.account}). Prix : ${out.join(', ')}. ${hook}.` };
  },
  async azure() {
    const key = await getSetting('azure_key');
    if (!key) return { ok: false, message: 'Clé Azure non renseignée.' };
    const region = await getSetting('azure_region');
    const endpoint = (await getSetting('azure_endpoint')).replace(/\/$/, '');
    const r = await post(`${endpoint}/translate?api-version=3.0&to=en&from=fr`,
      { 'Ocp-Apim-Subscription-Key': key, ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}) }, [{ Text: 'Bonjour' }]);
    if (r.status === 200) return { ok: true, message: `Azure répond : « Bonjour » → « ${r.json?.[0]?.translations?.[0]?.text} ».` };
    return { ok: false, message: `Azure : HTTP ${r.status} ${r.json?.error?.message || ''}${r.status === 403 ? ' (quota gratuit épuisé ?)' : ''}${r.status === 401 ? ' (clé ou région incorrecte ?)' : ''}` };
  },
  async deepseek() {
    const key = await getSetting('deepseek_key');
    if (!key) return { ok: false, message: 'Clé DeepSeek non renseignée.' };
    const model = await getSetting('deepseek_model');
    const r = await post('https://api.deepseek.com/chat/completions', { authorization: `Bearer ${key}` },
      { model, max_tokens: 20, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: 'Réponds par un seul mot : bonjour' }] });
    if (r.status === 200) return { ok: true, message: `DeepSeek (${model}) répond : « ${(r.json?.choices?.[0]?.message?.content || '').trim()} ».` };
    return { ok: false, message: `DeepSeek : HTTP ${r.status} ${r.json?.error?.message || ''}${r.status === 402 ? ' (solde épuisé ?)' : ''}` };
  },
  async meili() {
    const c = await meiliConf();
    if (!c) return { ok: false, message: 'Adresse et clé Meilisearch à renseigner (et enregistrer) avant le test.' };
    const v = await meili(c, 'GET', '/version', undefined, 5000);
    let docs = 0;
    try { docs = (await meili(c, 'GET', `/indexes/${INDEX}/stats`, undefined, 5000)).numberOfDocuments; } catch (err) { if (err.status !== 404) throw err; }
    return { ok: true, message: `Meilisearch ${v.pkgVersion} joignable, clé acceptée. ${docs} conférence(s) dans l'index.` };
  },
  async smtp(req) {
    const { rows } = await pool.query('SELECT email, name, locale FROM users WHERE id = $1', [req.user.sub]);
    const base = await baseVars();
    const mail = renderEmail('test', rows[0].locale, { ...base, name: rows[0].name, url: base.webUrl || undefined });
    const info = await sendNow({ to: rows[0].email, ...mail });
    return { ok: true, message: `E-mail de test envoyé à ${rows[0].email} (réponse du serveur : ${String(info.response || 'OK').slice(0, 80)}). Vérifiez aussi le dossier indésirables.` };
  },
  async claude() {
    const key = await getSetting('anthropic_key');
    if (!key) return { ok: false, message: 'Clé Claude non renseignée.' };
    const model = await getSetting('claude_model');
    const r = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: 10, messages: [{ role: 'user', content: 'Réponds par un seul mot : bonjour' }] });
    if (r.status === 200) return { ok: true, message: `Claude (${model}) répond : « ${(r.json?.content?.[0]?.text || '').trim()} ».` };
    return { ok: false, message: `Claude : HTTP ${r.status} ${r.json?.error?.message || ''}` };
  },
};

export default async function settingsRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/admin/settings', adminOnly, async () => describeSettings());

  // Corps : { values: { cle: valeur | null }, confirmStripeReset?: true }. null / vide = retour à la valeur par défaut.
  app.put('/admin/settings', adminOnly, async (req, reply) => {
    const { values, confirmStripeReset } = z.object({ values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), confirmStripeReset: z.boolean().optional() }).parse(req.body);
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null ? null : String(v)]));
    for (const k of Object.keys(clean)) if (!BY_KEY[k]) return reply.code(400).send({ error: `Paramètre inconnu : ${k}` });

    // Changement de clé Stripe : on vérifie la clé et on détecte un changement de compte ou de mode (test ↔ production).
    let resetStripe = false;
    if ('stripe_secret_key' in clean && clean.stripe_secret_key) {
      let next;
      try { next = await stripeIdentity(clean.stripe_secret_key.trim()); } catch { return reply.code(400).send({ error: 'Clé Stripe refusée par Stripe : vérifie-la.' }); }
      const prevKey = await getSetting('stripe_secret_key');
      if (prevKey && prevKey !== clean.stripe_secret_key.trim()) {
        const prev = await stripeIdentity(prevKey).catch(() => null);
        if (!prev || prev.account !== next.account || prev.mode !== next.mode) {
          const used = (await pool.query('SELECT count(*)::int AS n FROM subscriptions')).rows[0].n;
          if (used > 0 && !confirmStripeReset) {
            return reply.code(409).send({ code: 'stripe_reset',
              error: `Cette clé appartient à un autre compte ou mode Stripe. Les ${used} abonnement(s) enregistrés n'existent pas chez lui : ils seront remis à zéro (les clients devront se réabonner). Confirme pour continuer.` });
          }
          resetStripe = used > 0;
        }
      }
    }
    try {
      await saveSettings(clean, req.user.sub);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
    if (resetStripe) {
      await pool.query('DELETE FROM subscriptions');
      await pool.query('DELETE FROM stripe_events');
      await pool.query('UPDATE users SET stripe_customer_id = NULL');
    } else if ('stripe_secret_key' in clean) {
      // Premier enregistrement ou clé du même compte : on garde les abonnements.
    }
    return describeSettings();
  });

  app.post('/admin/settings/test', { preHandler: app.requireRole('admin'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { target } = z.object({ target: z.enum(['stripe', 'azure', 'deepseek', 'claude', 'meili', 'smtp']) }).parse(req.body);
    try {
      return await TESTS[target](req);
    } catch (err) {
      req.log.warn(err);
      return { ok: false, message: `Échec du test : ${err.message}` };
    }
  });

  // Résumé de l'état des services IA (sans clé) pour le tableau de bord du back-office.
  app.get('/admin/status', adminOnly, async () => {
    const q = async (sql) => (await pool.query(sql)).rows;
    const [tr, ins, tx, subs] = await Promise.all([
      q("SELECT status, count(*)::int AS n FROM transcript_translations GROUP BY status"),
      q("SELECT status, count(*)::int AS n FROM talk_insights GROUP BY status"),
      q("SELECT transcript_status AS status, count(*)::int AS n FROM talks WHERE source = 'upload' OR rights_confirmed GROUP BY transcript_status"),
      q("SELECT status, count(*)::int AS n FROM subscriptions GROUP BY status"),
    ]);
    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const emails = toMap(await q("SELECT status, count(*)::int AS n FROM email_outbox WHERE created_at > now() - interval '30 days' GROUP BY status"));
    const searchOn = Boolean(await meiliConf());
    const [{ n: ready }] = await q("SELECT count(*)::int AS n FROM talks WHERE video_status = 'ready'");
    const [{ n: indexed }] = await q('SELECT count(*)::int AS n FROM search_state');
    return { translations: toMap(tr), insights: toMap(ins), transcripts: toMap(tx), subscriptions: toMap(subs), insightsEnabled: isOn(await getSetting('insights_enabled')),
      search: { enabled: searchOn, ready, indexed, ...searchStatus() }, emails };
  });

  // Recherche : vide l'index Meilisearch ; la synchronisation le reconstruit en quelques minutes.
  app.post('/admin/search/reindex', adminOnly, async (req, reply) => {
    try {
      await resetIndex();
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
    return { ok: true };
  });
}
