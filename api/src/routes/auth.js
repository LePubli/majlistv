// Inscription, connexion et profil.
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db.js';
import { enqueueEmail } from '../mailer.js';
import { forgetUser } from '../userstate.js';
import { TRANSLATION_LANGS } from '../langs.js';

const registerSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(72), // 72 = limite de bcrypt
  name: z.string().trim().max(100).optional(), // facultatif : inscription courte, le prénom se précise ensuite
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
    const name = body.name || body.email.split('@')[0].slice(0, 100);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users(email, password_hash, name, locale)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, locale`,
        [body.email, hash, name, body.locale]
      );
      // E-mail de bienvenue (envoyé seulement si l'envoi est configuré dans le back-office).
      await enqueueEmail(pool, { userId: rows[0].id, to: rows[0].email, locale: rows[0].locale, kind: 'welcome',
        vars: { name: rows[0].name, path: '/' }, dedupeKey: `welcome:${rows[0].id}` }).catch((err) => req.log.warn(err));
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

  // --- Préférences (page de bienvenue) : prénom, langue des sous-titres, thèmes préférés ---
  const prefsSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    subLang: z.enum(TRANSLATION_LANGS).nullable().optional(),
    categories: z.array(z.number().int().positive()).max(12).optional(),
  }).strict();
  const readPrefs = async (id) => {
    const { rows } = await pool.query('SELECT name, preferred_sub_lang AS "subLang", favorite_categories AS categories, onboarded_at IS NOT NULL AS onboarded FROM users WHERE id = $1', [id]);
    return rows[0];
  };
  app.get('/me/preferences', { preHandler: app.authenticate }, async (req, reply) => (await readPrefs(req.user.sub)) || reply.code(404).send({ error: 'Utilisateur introuvable' }));
  app.put('/me/preferences', { preHandler: app.authenticate }, async (req) => {
    const b = prefsSchema.parse(req.body ?? {});
    const sets = ['onboarded_at = COALESCE(onboarded_at, now())'];
    const vals = [req.user.sub];
    const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.name !== undefined) add('name', b.name);
    if (b.subLang !== undefined) add('preferred_sub_lang', b.subLang);
    if (b.categories !== undefined) {
      // On ne garde que des catégories qui existent (une catégorie supprimée ne bloque rien).
      const ok = await pool.query('SELECT id FROM categories WHERE id = ANY($1::int[])', [b.categories]);
      add('favorite_categories', ok.rows.map((r) => r.id));
    }
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, vals);
    return readPrefs(req.user.sub);
  });

  // --- Mot de passe oublié ---
  // Réponse identique que l'adresse existe ou non (on ne révèle pas qui a un compte).
  const hashToken = (t) => createHash('sha256').update(t).digest('hex');
  app.post('/auth/forgot', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const { email } = z.object({ email: z.string().email().max(254).transform((s) => s.toLowerCase()) }).parse(req.body);
    const { rows } = await pool.query('SELECT id, email, name, locale, disabled_at FROM users WHERE email = $1', [email]);
    const u = rows[0];
    if (u && !u.disabled_at) {
      const recent = await pool.query("SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour'", [u.id]);
      if (recent.rows[0].n < 3) {
        const token = randomBytes(32).toString('base64url');
        await pool.query("INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [hashToken(token), u.id]);
        await enqueueEmail(pool, { userId: u.id, to: u.email, locale: u.locale, kind: 'password_reset',
          vars: { name: u.name, path: `/reset?token=${token}` }, dedupeKey: `reset:${hashToken(token)}` });
      }
    }
    return { ok: true };
  });

  app.post('/auth/reset', strictLimit, async (req, reply) => {
    const { token, password } = z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(72) }).parse(req.body);
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [hashToken(token)]);
      if (!rows[0]) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Lien invalide ou expiré' }); }
      const userId = rows[0].user_id;
      await client.query('UPDATE users SET password_hash = $1, sessions_valid_after = now() WHERE id = $2', [hash, userId]);
      // Un lien ne sert qu'une fois ; les autres liens en cours pour ce compte sont annulés.
      await client.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
      await client.query('COMMIT');
      forgetUser(userId);
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}
