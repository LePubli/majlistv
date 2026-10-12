// Back-office : gestion des utilisateurs, des rôles et des accès (réservé aux administrateurs).
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { forgetUser } from '../userstate.js';

const ROLES = ['user', 'organizer', 'admin'];
const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
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
  (SELECT count(*) FROM talks t WHERE t.organizer_id = u.id)::int AS "talksCount"`;

export default async function adminRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  const adminCount = async (excludeId) =>
    (await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1", [excludeId])).rows[0].n;

  app.get('/admin/users', adminOnly, async (req) => {
    const { q, role, limit, offset } = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (q) { params.push(`%${q.replace(/[%_]/g, '\\$&')}%`); where.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`); }
    if (role) { params.push(role); where.push(`u.role = $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await pool.query(`SELECT count(*)::int AS n FROM users u ${clause}`, params)).rows[0].n;
    const { rows } = await pool.query(
      `SELECT ${USER_COLS} FROM users u ${clause} ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return { total, users: rows };
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
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(pwd, 12), id]);
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
