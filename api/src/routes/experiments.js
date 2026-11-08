// Amélioration 7.2 — Tests A/B du site.
//   GET  /xp/active?visitor=<id>        public : tests en cours + variante de CE visiteur (textes à afficher)
//   POST /xp/expose  { visitor, experiment }   public : « ce visiteur a vu sa variante » (compté une seule fois)
//   POST /xp/click   { visitor, experiment }   public : « ce visiteur a cliqué sur le bouton de la zone »
//   POST /xp/convert { visitor }        membre tout juste inscrit : l'inscription est comptée pour les tests auxquels il a été exposé
//   GET  /admin/experiments             administrateur : tests, variantes, chiffres et verdict
//   POST /admin/experiments             créer un test (brouillon)
//   PATCH /admin/experiments/:id        modifier (brouillon seulement)
//   POST /admin/experiments/:id/start | pause | end   démarrer, mettre en pause, terminer (end : { winner, apply } → garder cette variante)
//   DELETE /admin/experiments/:id       supprimer (brouillon ou terminé)
// Aucune donnée personnelle : l'identifiant du visiteur est aléatoire, gardé dans son navigateur, et seule son empreinte est enregistrée.
// Un visiteur qui demande de ne pas être suivi (Do Not Track / Global Privacy Control) ne reçoit pas de variante et n'est pas compté (le site n'appelle alors pas ces routes).
import { z } from 'zod';
import { pool } from '../db.js';
import { ZONES, LANGS, VARIANT_KEYS, VISITOR_RE, hashVisitor, assign, cleanConfig, computeStats } from '../experiments.js';
import { resetTextsCache } from './texts.js';
import { saveSettings } from '../settings.js';
import { BOT, running, dropCache, visitorOf } from '../xpRuntime.js';
import { stripeContext } from './billing.js';

const idSchema = z.object({ id: z.string().uuid() });

const variantIn = z.object({ name: z.string().trim().min(1).max(60), weight: z.number().int().min(1).max(100), texts: z.record(z.record(z.string())).default({}), options: z.record(z.string()).default({}), prices: z.record(z.string()).default({}) });
const createSchema = z.object({ name: z.string().trim().min(1).max(120), zone: z.string(), variants: z.array(variantIn).min(2).max(3) });
const patchSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), variants: z.array(variantIn).min(2).max(3).optional() }).refine((b) => Object.keys(b).length > 0, 'Aucun changement');

export default async function experimentsRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  // ---------- Public ----------
  app.get('/xp/active', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const visitor = visitorOf(req.query?.visitor);
    if (!visitor) return { experiments: [] };
    const out = [];
    for (const e of await running()) {
      const key = assign(visitor, e.id, e.variants);
      const cfg = e.variants.find((v) => v.key === key)?.config || {};
      out.push({ id: e.id, zone: e.zone, variant: key, texts: cfg.texts || {}, options: cfg.options || {} });
    }
    return { experiments: out };
  });

  // Enregistre l'exposition (ou le clic) d'un visiteur ; la variante est recalculée ici, jamais crue sur parole.
  const track = (column) => async (req) => {
    const { visitor: raw, experiment } = z.object({ visitor: z.string().max(64), experiment: z.string().uuid() }).parse(req.body ?? {});
    const visitor = visitorOf(raw);
    if (!visitor || BOT.test(req.headers['user-agent'] || '')) return { ok: true };
    const e = (await running()).find((x) => x.id === experiment);
    if (!e || ZONES[e.zone]?.priceTest) return { ok: true }; // test de prix : l'exposition est enregistrée par /billing/plans (prix réellement montré), jamais sur demande du navigateur
    const h = hashVisitor(visitor);
    const v = assign(visitor, e.id, e.variants);
    await pool.query('INSERT INTO experiment_exposures(experiment_id, visitor_hash, variant) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [e.id, h, v]);
    if (column === 'clicked_at') await pool.query('UPDATE experiment_exposures SET clicked_at = coalesce(clicked_at, now()) WHERE experiment_id = $1 AND visitor_hash = $2', [e.id, h]);
    return { ok: true };
  };
  app.post('/xp/expose', track('first_day'));
  app.post('/xp/click', track('clicked_at'));

  // Inscription : seulement pour un compte créé il y a moins de 15 minutes, et pour une exposition des 30 derniers jours.
  app.post('/xp/convert', { preHandler: app.authenticate }, async (req) => {
    const visitor = visitorOf(req.body?.visitor);
    if (!visitor) return { ok: true, counted: 0 };
    const fresh = await pool.query("SELECT 1 FROM users WHERE id = $1 AND created_at > now() - interval '15 minutes'", [req.user.sub]);
    if (!fresh.rowCount) return { ok: true, counted: 0 };
    const r = await pool.query(
      `UPDATE experiment_exposures x SET converted_at = now()
        FROM experiments e WHERE e.id = x.experiment_id AND e.status = 'running' AND x.visitor_hash = $1 AND x.converted_at IS NULL AND x.first_day >= current_date - 30`, [hashVisitor(visitor)]);
    return { ok: true, counted: r.rowCount };
  });

  // ---------- Administration ----------
  async function load(id) {
    const exps = (await pool.query(`SELECT * FROM experiments ${id ? 'WHERE id = $1' : ''} ORDER BY created_at DESC`, id ? [id] : [])).rows;
    if (!exps.length) return [];
    const ids = exps.map((e) => e.id);
    const vars = (await pool.query('SELECT experiment_id, key, name, weight, config FROM experiment_variants WHERE experiment_id = ANY($1::uuid[]) ORDER BY key', [ids])).rows;
    const st = (await pool.query(
      `SELECT experiment_id, variant, count(*)::int AS visitors, count(clicked_at)::int AS clicks, count(converted_at)::int AS conversions,
             count(subscribed_at)::int AS subscribers, count(paid_at)::int AS paid, coalesce(sum(revenue_cents), 0)::int AS revenue
         FROM experiment_exposures WHERE experiment_id = ANY($1::uuid[]) GROUP BY 1, 2`, [ids])).rows;
    return exps.map((e) => {
      const mine = vars.filter((v) => v.experiment_id === e.id);
      const rowOf = (v) => st.find((x) => x.experiment_id === e.id && x.variant === v.key);
      // Test de prix : on tranche sur les abonnements démarrés (essai gratuit compris) ; les inscriptions, les abonnements payés et le revenu sont donnés à titre d'information.
      const stats = computeStats(mine.map((v) => { const s = rowOf(v); return { key: v.key, visitors: s?.visitors || 0, clicks: s?.clicks || 0, conversions: (e.goal === 'subscription' ? s?.subscribers : s?.conversions) || 0 }; }));
      return {
        id: e.id, name: e.name, zone: e.zone, zoneLabel: ZONES[e.zone]?.label || e.zone, status: e.status, goal: e.goal, winner: e.winner,
        createdAt: e.created_at, startedAt: e.started_at, endedAt: e.ended_at,
        variants: mine.map((v) => ({ key: v.key, name: v.name, weight: v.weight, texts: v.config?.texts || {}, options: v.config?.options || {}, prices: v.config?.prices || {}, ...stats.find((s) => s.key === v.key),
          ...(e.goal === 'subscription' ? (() => { const s = rowOf(v); const n = s?.visitors || 0; return { signups: s?.conversions || 0, subscribers: s?.subscribers || 0, paid: s?.paid || 0, revenue: s?.revenue || 0, revenuePerVisitor: n ? Math.round(((s?.revenue || 0) / n)) : 0 }; })() : {}) })),
      };
    });
  }

  app.get('/admin/experiments', adminOnly, async () => ({
    experiments: await load(),
    zones: Object.entries(ZONES).map(([id, z]) => ({ id, label: z.label, manual: !!z.manual, priceTest: !!z.priceTest, keys: z.keys, options: z.options || {} })),
    langs: LANGS,
  }));

  // Vérifie les variantes d'un test et prépare les lignes à enregistrer (A = original, sans texte).
  function prepare(zone, variants) {
    const rows = [];
    for (let i = 0; i < variants.length; i++) {
      const key = VARIANT_KEYS[i];
      if (i === 0) { rows.push({ key, name: variants[i].name, weight: variants[i].weight, config: {} }); continue; }
      const c = cleanConfig(zone, { texts: variants[i].texts, options: variants[i].options, prices: variants[i].prices });
      if (c.error) return { error: c.error };
      if (!Object.keys(c.texts).length && !Object.keys(c.options).length && !Object.keys(c.prices).length) return { error: `La variante ${key} ne change rien : modifiez au moins un ${ZONES[zone].priceTest ? 'prix' : 'texte ou un réglage'}` };
      rows.push({ key, name: variants[i].name, weight: variants[i].weight, config: { texts: c.texts, options: c.options, ...(ZONES[zone].priceTest ? { prices: c.prices } : {}) } });
    }
    return { rows };
  }
  const saveVariants = async (client, id, rows) => {
    await client.query('DELETE FROM experiment_variants WHERE experiment_id = $1', [id]);
    for (const r of rows) await client.query('INSERT INTO experiment_variants(experiment_id, key, name, weight, config) VALUES ($1,$2,$3,$4,$5)', [id, r.key, r.name, r.weight, r.config]);
  };

  // Test de prix : chaque prix de variante est vérifié chez Stripe (existe, actif, récurrent, bonne durée, même devise que les prix généraux).
  // Retourne un message d'erreur, ou null si tout est bon.
  async function checkPrices(rows) {
    const ctx = await stripeContext();
    if (!ctx) return "Stripe n'est pas configuré : renseignez d'abord les clés et les prix généraux (Admin → Paramètres → Paiement).";
    const base = await ctx.stripe.prices.retrieve(ctx.prices.month).catch(() => null);
    if (!base) return 'Impossible de lire les prix généraux chez Stripe.';
    for (const r of rows) for (const [interval, id] of Object.entries(r.config?.prices || {})) {
      const label = `variante ${r.key}, prix ${interval === 'month' ? 'mensuel' : 'annuel'}`;
      let p;
      try { p = await ctx.stripe.prices.retrieve(id); } catch { return `${label} : « ${id} » est introuvable chez Stripe.`; }
      if (p.active === false) return `${label} : ce prix est archivé chez Stripe.`;
      if (p.recurring?.interval !== interval || (p.recurring?.interval_count || 1) !== 1) return `${label} : ce n'est pas un abonnement ${interval === 'month' ? 'mensuel' : 'annuel'}.`;
      if (p.currency !== base.currency) return `${label} : devise ${String(p.currency).toUpperCase()} différente des prix généraux (${String(base.currency).toUpperCase()}).`;
      if (id === ctx.prices[interval]) return `${label} : c'est déjà le prix actuel du site (la variante ne changerait rien).`;
    }
    return null;
  }

  app.post('/admin/experiments', adminOnly, async (req, reply) => {
    const b = createSchema.parse(req.body ?? {});
    if (!ZONES[b.zone]) return reply.code(400).send({ error: 'Zone inconnue' });
    const p = prepare(b.zone, b.variants);
    if (p.error) return reply.code(400).send({ error: p.error });
    if (ZONES[b.zone].priceTest) { const bad = await checkPrices(p.rows); if (bad) return reply.code(400).send({ error: bad }); }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = (await client.query('INSERT INTO experiments(name, zone, goal, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [b.name, b.zone, ZONES[b.zone].goal || 'signup', req.user.sub])).rows[0].id;
      await saveVariants(client, id, p.rows);
      await client.query('COMMIT');
      req.auditSummary = `Test A/B créé : « ${b.name} »`;
      return reply.code(201).send({ id });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });

  app.patch('/admin/experiments/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body ?? {});
    const e = (await pool.query('SELECT * FROM experiments WHERE id = $1', [id])).rows[0];
    if (!e) return reply.code(404).send({ error: 'Test introuvable' });
    if (e.status !== 'draft') return reply.code(409).send({ error: 'Un test démarré ne se modifie plus (les chiffres seraient faussés) : terminez-le et créez-en un nouveau', code: 'not_draft' });
    const p = b.variants ? prepare(e.zone, b.variants) : null;
    if (p?.error) return reply.code(400).send({ error: p.error });
    if (p && ZONES[e.zone].priceTest) { const bad = await checkPrices(p.rows); if (bad) return reply.code(400).send({ error: bad }); }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (b.name) await client.query('UPDATE experiments SET name = $2 WHERE id = $1', [id, b.name]);
      if (p) await saveVariants(client, id, p.rows);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    dropCache();
    return { ok: true };
  });

  const setStatus = (status, allowedFrom) => async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const e = (await pool.query('SELECT * FROM experiments WHERE id = $1', [id])).rows[0];
    if (!e) return reply.code(404).send({ error: 'Test introuvable' });
    if (!allowedFrom.includes(e.status)) return reply.code(409).send({ error: `Action impossible : le test est « ${e.status} »`, code: 'bad_state' });
    if (status === 'running') {
      // Un test de prix et un test de la page Tarifs sur les mêmes visiteurs fausseraient les chiffres : un seul à la fois.
      if (e.zone === 'price' || e.zone === 'pricing') {
        const other = e.zone === 'price' ? 'pricing' : 'price';
        if ((await pool.query("SELECT 1 FROM experiments WHERE zone = $1 AND status = 'running'", [other])).rowCount)
          return reply.code(409).send({ error: e.zone === 'price' ? 'Un test de la page Tarifs est en cours : terminez-le (ou mettez-le en pause) avant de tester les prix.' : 'Un test de prix est en cours : terminez-le (ou mettez-le en pause) avant de tester la page Tarifs.', code: 'zone_busy' });
      }
      if (ZONES[e.zone]?.priceTest) { // prix revérifiés au moment de démarrer (un prix a pu être archivé depuis la création)
        const vars = (await pool.query('SELECT key, config FROM experiment_variants WHERE experiment_id = $1', [id])).rows;
        const bad = await checkPrices(vars);
        if (bad) return reply.code(400).send({ error: bad });
      }
    }
    try {
      await pool.query(`UPDATE experiments SET status = $2, started_at = CASE WHEN $2 = 'running' THEN coalesce(started_at, now()) ELSE started_at END WHERE id = $1`, [id, status]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Un autre test est déjà en cours sur cette zone : mettez-le en pause ou terminez-le d’abord', code: 'zone_busy' });
      throw err;
    }
    dropCache();
    req.auditSummary = `Test A/B « ${e.name} » : ${status}`;
    return { ok: true };
  };
  app.post('/admin/experiments/:id/start', adminOnly, setStatus('running', ['draft', 'paused']));
  app.post('/admin/experiments/:id/pause', adminOnly, setStatus('paused', ['running']));

  // Termine le test. Avec `winner` + `apply`, les textes de la variante gardée deviennent les textes du site (Admin → Textes).
  app.post('/admin/experiments/:id/end', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ winner: z.enum(VARIANT_KEYS).nullable().default(null), apply: z.boolean().default(false) }).parse(req.body ?? {});
    const e = (await load(id))[0];
    if (!e) return reply.code(404).send({ error: 'Test introuvable' });
    if (e.status === 'ended' || e.status === 'draft') return reply.code(409).send({ error: `Action impossible : le test est « ${e.status} »`, code: 'bad_state' });
    const win = b.winner ? e.variants.find((v) => v.key === b.winner) : null;
    if (b.winner && !win) return reply.code(400).send({ error: 'Variante inconnue' });
    // Réglages de présentation de la variante gardée (ex. formule mise en avant) : enregistrés d'abord, comme dans Admin → Paramètres.
    let appliedOptions = 0;
    if (win && b.apply && win.key !== 'A' && !ZONES[e.zone]?.manual) {
      const z = ZONES[e.zone];
      const values = {};
      for (const [k, v] of Object.entries(win.options || {})) if (z.options?.[k]) values[z.options[k].setting] = v;
      if (Object.keys(values).length) { await saveSettings(values, req.user.sub); appliedOptions = Object.keys(values).length; }
    }
    // Test de prix : le prix gagnant devient le prix du site pour les NOUVEAUX abonnés (les abonnés actuels gardent le leur).
    let appliedPrices = 0;
    if (win && b.apply && win.key !== 'A' && ZONES[e.zone]?.priceTest) {
      const values = {};
      if (win.prices?.month) values.stripe_price_monthly = win.prices.month;
      if (win.prices?.year) values.stripe_price_yearly = win.prices.year;
      if (Object.keys(values).length) { await saveSettings(values, req.user.sub); appliedPrices = Object.keys(values).length; }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let applied = 0;
      if (win && b.apply && win.key !== 'A' && !ZONES[e.zone]?.manual) {
        for (const [lang, map] of Object.entries(win.texts)) for (const [k, v] of Object.entries(map)) {
          await client.query(`INSERT INTO site_texts(key, lang, value, updated_by) VALUES ($1,$2,$3,$4)
            ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`, [k, lang, v, req.user.sub]);
          applied++;
        }
      }
      await client.query("UPDATE experiments SET status = 'ended', winner = $2, ended_at = now() WHERE id = $1", [id, b.winner]);
      await client.query('COMMIT');
      if (applied) resetTextsCache();
      dropCache();
      req.auditSummary = `Test A/B « ${e.name} » terminé${win ? ` : variante ${win.key} ${b.apply && win.key !== 'A' && !ZONES[e.zone]?.manual ? (ZONES[e.zone]?.priceTest ? 'appliquée (prix du site changés)' : 'appliquée au site') : 'retenue'}` : ''}`;
      return { ok: true, applied, appliedOptions, appliedPrices };
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  });

  app.delete('/admin/experiments/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const e = (await pool.query('SELECT status FROM experiments WHERE id = $1', [id])).rows[0];
    if (!e) return reply.code(404).send({ error: 'Test introuvable' });
    if (e.status === 'running' || e.status === 'paused') return reply.code(409).send({ error: 'Terminez le test avant de le supprimer', code: 'bad_state' });
    await pool.query('DELETE FROM experiments WHERE id = $1', [id]);
    dropCache();
    return { deleted: true };
  });
}
