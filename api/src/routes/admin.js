// Back-office : gestion des utilisateurs, des rôles et des accès (réservé aux administrateurs).
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { forgetUser } from '../userstate.js';
import { enqueueEmail } from '../mailer.js';
import { createHash } from 'node:crypto';

const ROLES = ['user', 'organizer', 'admin'];
const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['suspended', 'paying', 'trialing', 'offered', 'none']).optional(),
  sort: z.enum(['recent', 'oldest', 'name', 'activity']).default('recent'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const emailSchema = z.string().email().max(254).transform((s) => s.toLowerCase());
const createSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES).default('user'),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('fr'),
  password: z.string().min(8).max(72).optional(), // vide : un mot de passe provisoire est généré
});
const patchSchema = z.object({
  email: emailSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  disabled: z.boolean().optional(),                       // suspendre / réactiver
  premiumUntil: z.string().datetime().nullable().optional(), // accès premium offert (null = retirer)
});

// Mot de passe provisoire lisible (affiché une seule fois à l'admin).
const tempPassword = () => randomBytes(9).toString('base64url');

const USER_COLS = `u.id, u.email, u.name, u.role, u.locale, u.created_at AS "createdAt", u.disabled_at AS "disabledAt",
  u.premium_until AS "premiumUntil",
  (SELECT status FROM subscriptions s WHERE s.user_id = u.id ORDER BY (s.status IN ('trialing','active','past_due')) DESC, s.updated_at DESC LIMIT 1) AS "subscriptionStatus",
  (SELECT count(*) FROM talks t WHERE t.organizer_id = u.id)::int AS "talksCount",
  (SELECT max(updated_at) FROM watch_progress w WHERE w.user_id = u.id) AS "lastWatchAt"`;

// Filtres « statut » (abonnement) de la liste.
const LIVE_SUB = (st) => `EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status IN (${st}))`;
const STATUS_SQL = {
  suspended: 'u.disabled_at IS NOT NULL',
  paying: LIVE_SUB("'active', 'past_due'"),
  trialing: LIVE_SUB("'trialing'"),
  offered: 'u.premium_until > now()',
  none: `NOT ${LIVE_SUB("'trialing', 'active', 'past_due'")} AND (u.premium_until IS NULL OR u.premium_until <= now())`,
};
const SORT_SQL = { recent: 'u.created_at DESC', oldest: 'u.created_at ASC', name: 'lower(u.name) ASC', activity: '"lastWatchAt" DESC NULLS LAST, u.created_at DESC' };

export default async function adminRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  const adminCount = async (excludeId) =>
    (await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1", [excludeId])).rows[0].n;

  app.get('/admin/users', adminOnly, async (req) => {
    const { q, role, status, sort, limit, offset } = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (q) { params.push(`%${q.replace(/[%_]/g, '\\$&')}%`); where.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`); }
    if (role) { params.push(role); where.push(`u.role = $${params.length}`); }
    if (status) where.push(STATUS_SQL[status]);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await pool.query(`SELECT count(*)::int AS n FROM users u ${clause}`, params)).rows[0].n;
    const { rows } = await pool.query(
      `SELECT ${USER_COLS} FROM users u ${clause} ORDER BY ${SORT_SQL[sort]} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return { total, users: rows };
  });

  // Compteurs des filtres (pastilles au-dessus du tableau).
  app.get('/admin/users-counts', adminOnly, async () => (await pool.query(
    `SELECT count(*)::int AS all,
            count(*) FILTER (WHERE ${STATUS_SQL.suspended})::int AS suspended,
            count(*) FILTER (WHERE ${STATUS_SQL.paying})::int AS paying,
            count(*) FILTER (WHERE ${STATUS_SQL.trialing})::int AS trialing,
            count(*) FILTER (WHERE ${STATUS_SQL.offered})::int AS offered,
            count(*) FILTER (WHERE ${STATUS_SQL.none})::int AS none
       FROM users u`)).rows[0]);

  // Fiche complète d'un utilisateur (panneau latéral).
  app.get('/admin/users/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const user = (await pool.query(`SELECT ${USER_COLS}, u.stripe_customer_id AS "stripeCustomerId" FROM users u WHERE u.id = $1`, [id])).rows[0];
    if (!user) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    const [subs, stats, talks, mails] = await Promise.all([
      pool.query(`SELECT id, status, billing_interval AS interval, current_period_end AS "currentPeriodEnd", trial_end AS "trialEnd",
                         cancel_at_period_end AS "cancelAtPeriodEnd", created_at AS "createdAt"
                    FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
      pool.query(`SELECT (SELECT count(*)::int FROM favorites WHERE user_id = $1) AS favorites,
                         (SELECT count(*)::int FROM watch_progress WHERE user_id = $1) AS watched,
                         (SELECT count(*)::int FROM watch_progress WHERE user_id = $1 AND completed) AS completed,
                         (SELECT max(updated_at) FROM watch_progress WHERE user_id = $1) AS "lastWatchAt"`, [id]),
      pool.query(`SELECT id, title, publication, video_status AS "videoStatus" FROM talks WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
      pool.query(`SELECT kind, status, created_at AS "createdAt" FROM email_outbox WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [id]),
    ]);
    return { user, subscriptions: subs.rows, stats: stats.rows[0], talks: talks.rows, emails: mails.rows };
  });

  // Envoie à l'utilisateur un lien pour choisir son mot de passe (valable 1 h) : l'admin ne voit jamais le mot de passe.
  app.post('/admin/users/:id/reset-link', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const u = (await pool.query('SELECT id, email, name, locale, disabled_at FROM users WHERE id = $1', [id])).rows[0];
    if (!u) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    if (u.disabled_at) return reply.code(400).send({ error: 'Compte suspendu : réactive-le d\'abord' });
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    await pool.query("INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hash, id]);
    await enqueueEmail(pool, { userId: u.id, to: u.email, locale: u.locale, kind: 'password_reset', vars: { name: u.name, path: `/reset?token=${token}` }, dedupeKey: `reset:${hash}` });
    return { ok: true, email: u.email };
  });

  app.post('/admin/users', adminOnly, async (req, reply) => {
    const b = createSchema.parse(req.body);
    const password = b.password || tempPassword();
    try {
      const { rows } = await pool.query(
        'INSERT INTO users(email, password_hash, name, role, locale) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [b.email, await bcrypt.hash(password, 12), b.name, b.role, b.locale]
      );
      const user = (await pool.query(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [rows[0].id])).rows[0];
      return reply.code(201).send({ user, temporaryPassword: b.password ? null : password });
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Email déjà utilisé' });
      throw err;
    }
  });

  app.patch('/admin/users/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body);
    const cur = (await pool.query('SELECT id, role FROM users WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    const self = id === req.user.sub;
    // On ne peut ni se rétrograder, ni se suspendre, ni laisser le site sans administrateur.
    if (self && ((b.role && b.role !== 'admin') || b.disabled)) {
      return reply.code(400).send({ error: 'Tu ne peux pas retirer ton propre accès administrateur ni suspendre ton compte' });
    }
    if (cur.role === 'admin' && ((b.role && b.role !== 'admin') || b.disabled) && (await adminCount(id)) === 0) {
      return reply.code(400).send({ error: 'Il doit rester au moins un administrateur actif' });
    }
    const sets = [];
    const params = [];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (b.email !== undefined) add('email', b.email);
    if (b.name !== undefined) add('name', b.name);
    if (b.role !== undefined) add('role', b.role);
    if (b.locale !== undefined) add('locale', b.locale);
    if (b.disabled !== undefined) sets.push(`disabled_at = ${b.disabled ? 'COALESCE(disabled_at, now())' : 'NULL'}`);
    if (b.premiumUntil !== undefined) add('premium_until', b.premiumUntil);
    if (!sets.length) return reply.code(400).send({ error: 'Rien à modifier' });
    params.push(id);
    try {
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Email déjà utilisé' });
      throw err;
    }
    forgetUser(id);
    return (await pool.query(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id])).rows[0];
  });

  // Ancienne route conservée pour compatibilité.
  app.patch('/admin/users/:id/role', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body);
    if (id === req.user.sub) return reply.code(400).send({ error: 'Impossible de modifier son propre rôle' });
    const cur = (await pool.query('SELECT role FROM users WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    if (cur.role === 'admin' && role !== 'admin' && (await adminCount(id)) === 0) return reply.code(400).send({ error: 'Il doit rester au moins un administrateur actif' });
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    forgetUser(id);
    return { id, role };
  });

  // Nouveau mot de passe (fourni, ou généré et affiché une seule fois).
  app.post('/admin/users/:id/password', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { password } = z.object({ password: z.string().min(8).max(72).optional() }).parse(req.body ?? {});
    const pwd = password || tempPassword();
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1, sessions_valid_after = now() WHERE id = $2', [await bcrypt.hash(pwd, 12), id]);
    forgetUser(id);
    if (!rowCount) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    return { temporaryPassword: password ? null : pwd };
  });

  // Suppression : refusée tant que l'utilisateur possède des conférences (à transférer) ou un abonnement actif.
  app.delete('/admin/users/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { transferTo } = z.object({ transferTo: z.string().uuid().optional() }).parse(req.query);
    if (id === req.user.sub) return reply.code(400).send({ error: 'Tu ne peux pas supprimer ton propre compte' });
    const cur = (await pool.query('SELECT id, role FROM users WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    if (cur.role === 'admin' && (await adminCount(id)) === 0) return reply.code(400).send({ error: 'Il doit rester au moins un administrateur actif' });
    const live = await pool.query("SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due') LIMIT 1", [id]);
    if (live.rowCount) return reply.code(409).send({ error: "Cet utilisateur a un abonnement Stripe actif : résilie-le d'abord dans Stripe", code: 'active_subscription' });
    const talks = (await pool.query('SELECT count(*)::int AS n FROM talks WHERE organizer_id = $1', [id])).rows[0].n;
    if (talks && !transferTo) {
      return reply.code(409).send({ error: `Cet utilisateur possède ${talks} conférence(s) : transfère-les à un autre compte avant de le supprimer`, code: 'has_talks', talks });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (talks) {
        const target = await client.query("SELECT 1 FROM users WHERE id = $1 AND role IN ('organizer', 'admin') AND disabled_at IS NULL", [transferTo]);
        if (!target.rowCount || transferTo === id) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Le compte de destination doit être un organisateur ou un admin actif' }); }
        await client.query('UPDATE talks SET organizer_id = $1 WHERE organizer_id = $2', [transferTo, id]);
        await client.query('UPDATE uploads SET organizer_id = $1 WHERE organizer_id = $2', [transferTo, id]);
      }
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    forgetUser(id);
    return reply.code(204).send();
  });
}
