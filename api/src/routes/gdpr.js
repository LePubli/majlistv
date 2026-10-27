// Étape 36 — Mes données (RGPD), pour le membre connecté.
//   GET  /me/data/check   ce qui empêche ou conditionne la suppression (sans rien supprimer)
//   GET  /me/export       toutes mes données en JSON (téléchargement)
//   POST /me/delete       { password, code? } supprime définitivement mon compte
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { exportData, deletionCheck, deleteAccount } from '../gdpr.js';
import { checkSecondFactor } from '../twofactor.js';
import { forgetUser } from '../userstate.js';

// Réglage réservé aux tests (même variable que les routes de connexion) : plafonds relevés pour enchaîner les essais.
const MAX = (n) => Number(process.env.AUTH_RATE_MAX) || n;

export default async function gdprRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/me/data/check', auth, async (req, reply) => {
    const c = await deletionCheck(req.user.sub);
    if (!c) return reply.code(404).send({ error: 'Compte introuvable' });
    const tf = (await pool.query('SELECT (totp_enabled_at IS NOT NULL) AS on FROM users WHERE id = $1', [req.user.sub])).rows[0].on;
    reply.header('cache-control', 'no-store');
    return { blockers: c.blockers, hasSubscription: c.liveSubscriptions.length > 0, twoFactor: tf };
  });

  app.get('/me/export', { ...auth, config: { rateLimit: { max: MAX(5), timeWindow: '1 hour' } } }, async (req, reply) => {
    const out = await exportData(req.user.sub);
    if (!out) return reply.code(404).send({ error: 'Compte introuvable' });
    reply.header('cache-control', 'no-store');
    reply.header('content-disposition', `attachment; filename="mejliss-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
    return out;
  });

  app.post('/me/delete', { ...auth, config: { rateLimit: { max: MAX(5), timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = z.object({ password: z.string().min(1).max(200), code: z.string().max(40).optional() }).parse(req.body ?? {});
    const u = (await pool.query('SELECT password_hash, (totp_enabled_at IS NOT NULL) AS tf FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (!u) return reply.code(404).send({ error: 'Compte introuvable' });
    if (!(await bcrypt.compare(b.password, u.password_hash))) return reply.code(401).send({ error: 'Mot de passe incorrect', code: 'bad_password' });
    if (u.tf) {
      if (!b.code) return reply.code(401).send({ error: 'Code de double authentification requis', code: 'code_required' });
      const r = await checkSecondFactor(req.user.sub, b.code);
      if (!r.ok) return reply.code(401).send({ error: r.locked ? `Trop d'erreurs : réessayez dans ${r.minutes} minutes` : 'Code incorrect', code: 'bad_code' });
    }
    const r = await deleteAccount(req.user.sub, req.log);
    if (!r.ok) return reply.code(r.code === 'not_found' ? 404 : r.code === 'stripe_unavailable' ? 503 : 409).send({ error: r.message || 'Suppression impossible', code: r.code });
    forgetUser(req.user.sub);
    return reply.code(200).send({ deleted: true, subscriptionsStopped: r.subscriptionsStopped });
  });
}
