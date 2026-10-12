// Inscription, connexion et profil.
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';

const registerSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(72), // 72 = limite de bcrypt
  name: z.string().trim().min(1).max(100),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('fr'),
});

const loginSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(72),
});

const strictLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export default async function authRoutes(app) {
  const sign = (user) => app.jwt.sign({ sub: user.id, role: user.role });

  app.post('/auth/register', strictLimit, async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const hash = await bcrypt.hash(body.password, 12);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users(email, password_hash, name, locale)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, locale`,
        [body.email, hash, body.name, body.locale]
      );
      return reply.code(201).send({ token: sign(rows[0]), user: rows[0] });
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Email déjà utilisé' });
      throw err;
    }
  });

  app.post('/auth/login', strictLimit, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const { rows } = await pool.query(
      'SELECT id, email, name, role, locale, password_hash, disabled_at FROM users WHERE email = $1',
      [email]
    );
    const found = rows[0];
    const ok = found && (await bcrypt.compare(password, found.password_hash));
    if (!ok) return reply.code(401).send({ error: 'Identifiants invalides' });
    if (found.disabled_at) return reply.code(403).send({ error: 'Compte suspendu' });
    const { password_hash, disabled_at, ...user } = found;
    return { token: sign(user), user };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, locale FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    return rows[0];
  });
}
