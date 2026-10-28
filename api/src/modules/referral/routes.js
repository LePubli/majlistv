// Parrainage (étape 43).
//   GET  /me/referral          { enabled, code, months, maxPerYear, stats }   code créé à la première demande
//   POST /me/referral/claim    { code } → { ok, months }   rattache le compte (inscrit depuis moins de 48 h) à son parrain
//   GET  /admin/referrals      { referrals, totals, months, maxPerYear }       (administrateur)
import { z } from 'zod';
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { CLAIM_WINDOW_HOURS, codeFor, normalizeCode } from './lib.js';

const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export default async function routes(app) {
  app.get('/me/referral', { preHandler: app.authenticate }, async (req) => {
    const code = await codeFor(pool, req.user.sub);
    const months = await getNumber('referral_months');
    const maxPerYear = await getNumber('referral_max_per_year');
    const s = (await pool.query(
      `SELECT count(*)::int AS invited,
              count(*) FILTER (WHERE status = 'rewarded')::int AS rewarded,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              coalesce(sum(months) FILTER (WHERE referrer_rewarded), 0)::int AS "monthsEarned",
              count(*) FILTER (WHERE referrer_rewarded AND rewarded_at > now() - interval '365 days')::int AS "usedThisYear"
         FROM referrals WHERE referrer_id = $1`, [req.user.sub])).rows[0];
    const mine = (await pool.query("SELECT status, months, rewarded_at AS \"rewardedAt\" FROM referrals WHERE referee_id = $1", [req.user.sub])).rows[0] || null;
    return { code, months, maxPerYear, stats: { ...s, capReached: maxPerYear > 0 && s.usedThisYear >= maxPerYear }, referredBy: mine };
  });

  app.post('/me/referral/claim', { preHandler: app.authenticate, ...strict }, async (req, reply) => {
    const { code } = z.object({ code: z.string().max(40) }).parse(req.body ?? {});
    const norm = normalizeCode(code);
    if (!norm) return reply.code(400).send({ error: 'Code de parrainage invalide.', code: 'bad_code' });
    const referrer = (await pool.query(
      'SELECT r.user_id FROM referral_codes r JOIN users u ON u.id = r.user_id WHERE r.code = $1 AND u.disabled_at IS NULL', [norm])).rows[0];
    if (!referrer) return reply.code(404).send({ error: 'Code de parrainage inconnu.', code: 'unknown' });
    if (referrer.user_id === req.user.sub) return reply.code(400).send({ error: 'Vous ne pouvez pas utiliser votre propre code.', code: 'self' });
    const me = (await pool.query(
      `SELECT (created_at > now() - make_interval(hours => $2)) AS fresh,
              EXISTS (SELECT 1 FROM subscriptions WHERE user_id = $1) AS had_sub
         FROM users WHERE id = $1`, [req.user.sub, CLAIM_WINDOW_HOURS])).rows[0];
    // Le parrainage récompense une personne nouvelle : pas de rattachement a posteriori ni pour un ancien abonné.
    if (!me.fresh || me.had_sub) return reply.code(409).send({ error: 'Le parrainage ne s\'applique qu\'à un compte qui vient d\'être créé.', code: 'too_late' });
    const r = await pool.query('INSERT INTO referrals(referrer_id, referee_id) VALUES ($1, $2) ON CONFLICT (referee_id) DO NOTHING RETURNING id', [referrer.user_id, req.user.sub]);
    if (!r.rowCount) return reply.code(409).send({ error: 'Ce compte est déjà rattaché à un parrain.', code: 'already' });
    return { ok: true, months: await getNumber('referral_months') };
  });

  app.get('/admin/referrals', { preHandler: app.requireRole('admin') }, async () => {
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.months, r.referrer_rewarded AS "referrerRewarded", r.created_at AS "createdAt", r.rewarded_at AS "rewardedAt",
              p.email AS "referrerEmail", f.email AS "refereeEmail"
         FROM referrals r JOIN users p ON p.id = r.referrer_id JOIN users f ON f.id = r.referee_id
        ORDER BY r.created_at DESC LIMIT 300`);
    const t = (await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'rewarded')::int AS rewarded, count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'rewarded' AND NOT referrer_rewarded)::int AS "capped",
              coalesce(sum(months) FILTER (WHERE status = 'rewarded'), 0)::int + coalesce(sum(months) FILTER (WHERE referrer_rewarded), 0)::int AS "monthsGiven",
              count(DISTINCT referrer_id)::int AS referrers
         FROM referrals`)).rows[0];
    return { referrals: rows, totals: t, months: await getNumber('referral_months'), maxPerYear: await getNumber('referral_max_per_year') };
  });
}
