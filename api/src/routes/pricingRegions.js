// Administration des tarifs par pays (étape 44).
//   GET    /admin/pricing-regions        liste
//   POST   /admin/pricing-regions        crée  { name, countries, priceMonthly, priceYearly, priceLearnMonthly?, priceLearnYearly?, enabled? }
//   PUT    /admin/pricing-regions/:id    modifie (mêmes champs)
//   DELETE /admin/pricing-regions/:id    supprime
// Chaque prix saisi est vérifié chez Stripe : il existe, il est récurrent, sa durée correspond, sa devise est celle des prix généraux
// (Stripe interdit de facturer un même client dans deux devises).
import { z } from 'zod';
import { pool } from '../db.js';
import { stripeContext } from './billing.js';
import { parseCountries } from '../pricingRegions.js';

const idSchema = z.object({ id: z.string().uuid() });
const priceId = z.string().trim().regex(/^price_[A-Za-z0-9_]{1,80}$/, 'Identifiant de prix invalide (il commence par price_)');
const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  countries: z.union([z.string(), z.array(z.string())]),
  priceMonthly: priceId, priceYearly: priceId,
  priceLearnMonthly: z.union([priceId, z.literal('')]).optional(), priceLearnYearly: z.union([priceId, z.literal('')]).optional(),
  enabled: z.boolean().optional(),
});

export default async function pricingRegionsRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  async function check(body, reply) {
    const countries = parseCountries(body.countries);
    if (!countries || countries.length === 0) { reply.code(400).send({ error: 'Pays : codes à 2 lettres séparés par des virgules (ex. MA, DZ, TN).' }); return null; }
    if ((body.priceLearnMonthly || '') !== '' !== ((body.priceLearnYearly || '') !== '')) {
      reply.code(400).send({ error: "Apprentissage : renseigne les deux prix (mensuel et annuel) ou aucun." }); return null;
    }
    const ctx = await stripeContext();
    if (!ctx) { reply.code(503).send({ error: "Stripe n'est pas configuré : renseigne d'abord les clés et les prix généraux." }); return null; }
    const base = await ctx.stripe.prices.retrieve(ctx.prices.month).catch(() => null);
    const wanted = [['priceMonthly', 'month', 'mensuel'], ['priceYearly', 'year', 'annuel'], ['priceLearnMonthly', 'month', 'Apprentissage mensuel'], ['priceLearnYearly', 'year', 'Apprentissage annuel']];
    for (const [field, interval, label] of wanted) {
      const id = body[field];
      if (!id) continue;
      let p;
      try { p = await ctx.stripe.prices.retrieve(id); } catch { reply.code(400).send({ error: `Prix ${label} : « ${id} » est introuvable chez Stripe.` }); return null; }
      if (p.recurring?.interval !== interval) { reply.code(400).send({ error: `Prix ${label} : ce prix n'est pas un abonnement ${interval === 'month' ? 'mensuel' : 'annuel'}.` }); return null; }
      if (base && p.currency !== base.currency) {
        reply.code(400).send({ error: `Prix ${label} : devise ${String(p.currency).toUpperCase()} différente des prix généraux (${String(base.currency).toUpperCase()}). Stripe ne permet pas de facturer un même client en deux devises.` }); return null;
      }
    }
    return countries;
  }

  const rowSql = `SELECT id, name, countries, price_monthly AS "priceMonthly", price_yearly AS "priceYearly", price_learn_monthly AS "priceLearnMonthly",
                         price_learn_yearly AS "priceLearnYearly", enabled, created_at AS "createdAt" FROM price_regions`;

  app.get('/admin/pricing-regions', adminOnly, async () => (await pool.query(`${rowSql} ORDER BY created_at`)).rows);

  app.post('/admin/pricing-regions', adminOnly, async (req, reply) => {
    const body = bodySchema.parse(req.body ?? {});
    const countries = await check(body, reply);
    if (!countries) return;
    const { rows } = await pool.query(
      `INSERT INTO price_regions(name, countries, price_monthly, price_yearly, price_learn_monthly, price_learn_yearly, enabled)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7) RETURNING id`,
      [body.name, countries, body.priceMonthly, body.priceYearly, body.priceLearnMonthly || '', body.priceLearnYearly || '', body.enabled !== false]);
    return reply.code(201).send({ id: rows[0].id });
  });

  app.put('/admin/pricing-regions/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const body = bodySchema.parse(req.body ?? {});
    const countries = await check(body, reply);
    if (!countries) return;
    const r = await pool.query(
      `UPDATE price_regions SET name = $2, countries = $3, price_monthly = $4, price_yearly = $5, price_learn_monthly = NULLIF($6, ''),
              price_learn_yearly = NULLIF($7, ''), enabled = $8, updated_at = now() WHERE id = $1`,
      [id, body.name, countries, body.priceMonthly, body.priceYearly, body.priceLearnMonthly || '', body.priceLearnYearly || '', body.enabled !== false]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Groupe introuvable' });
    return { id };
  });

  app.delete('/admin/pricing-regions/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM price_regions WHERE id = $1', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Groupe introuvable' });
    return { id };
  });
}
