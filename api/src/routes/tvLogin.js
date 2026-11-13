// Application TV — connexion par code (migration 117).
//   POST /auth/tv/start            (public, limité)  { device? } → { code: 'ABCD2345', secret, expiresIn, interval, url }
//   POST /auth/tv/poll             (public, limité)  { secret } → 202 { status: 'pending' } · 200 { token, user } (une seule fois) · 410 expiré/refusé
//   GET  /auth/tv/code/:code       (connecté)        → { device, expiresIn } pour l'écran de confirmation
//   POST /auth/tv/approve          (connecté)        { code, allow } → la télé est connectée au compte (ou refusée)
// Code de 8 caractères sans lettres ambiguës (pas de 0/O, 1/I/L) ; 10 minutes ; secret de la télé : 32 octets, seule son empreinte
// SHA-256 est gardée. Compte suspendu : refus.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TTL_SECONDS = 600;
const INTERVAL_SECONDS = 4;
export const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const normalizeCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const codeSchema = z.string().transform(normalizeCode).pipe(z.string().regex(/^[A-Z2-9]{8}$/, 'Code invalide'));

export default async function tvLoginRoutes(app) {
  const sign = (user) => app.jwt.sign({ sub: user.id, role: user.role });
  const site = () => String(process.env.CORS_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '');

  app.post('/auth/tv/start', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { device } = z.object({ device: z.string().trim().max(80).default('') }).parse(req.body ?? {});
    await pool.query("DELETE FROM tv_logins WHERE expires_at < now() - interval '1 day'");
    const secret = randomBytes(32).toString('base64url');
    for (let i = 0; i < 5; i += 1) {
      const code = newCode();
      try {
        await pool.query(`INSERT INTO tv_logins(code, secret_hash, device, expires_at) VALUES ($1, $2, $3, now() + interval '${TTL_SECONDS} seconds')`, [code, hash(secret), device]);
        return reply.code(201).send({ code, secret, expiresIn: TTL_SECONDS, interval: INTERVAL_SECONDS, url: `${site()}/tv?code=${code}` });
      } catch (err) { if (err.code !== '23505') throw err; }
    }
    return reply.code(503).send({ error: 'Réessayez' });
  });

  app.post('/auth/tv/poll', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { secret } = z.object({ secret: z.string().min(20).max(100) }).parse(req.body ?? {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT * FROM tv_logins WHERE secret_hash = $1 FOR UPDATE', [hash(secret)])).rows[0];
      if (!row || row.status === 'used' || row.status === 'denied' || (row.status === 'pending' && new Date(row.expires_at) < new Date())) {
        await client.query('ROLLBACK');
        return reply.code(410).send({ error: row?.status === 'denied' ? 'Connexion refusée' : 'Code expiré : un nouveau code va s\'afficher', code: row?.status === 'denied' ? 'denied' : 'expired' });
      }
      if (row.status === 'pending') { await client.query('ROLLBACK'); return reply.code(202).send({ status: 'pending' }); }
      const user = (await client.query('SELECT id, email, name, role, locale, disabled_at FROM users WHERE id = $1', [row.user_id])).rows[0];
      await client.query("UPDATE tv_logins SET status = 'used' WHERE id = $1", [row.id]);
      await client.query('COMMIT');
      if (!user || user.disabled_at) return reply.code(410).send({ error: 'Compte suspendu', code: 'denied' });
      const { disabled_at, ...u } = user;
      return { token: sign(u), user: u };
    } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
  });

  app.get('/auth/tv/code/:code', { preHandler: app.authenticate }, async (req, reply) => {
    const code = codeSchema.parse(req.params.code);
    const row = (await pool.query("SELECT device, expires_at FROM tv_logins WHERE code = $1 AND status = 'pending' AND expires_at > now()", [code])).rows[0];
    if (!row) return reply.code(404).send({ error: 'Code inconnu ou expiré : vérifiez le code affiché sur la télé', code: 'unknown' });
    return { device: row.device || '', expiresIn: Math.max(0, Math.round((new Date(row.expires_at) - Date.now()) / 1000)) };
  });

  app.post('/auth/tv/approve', { preHandler: app.authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = z.object({ code: codeSchema, allow: z.boolean().default(true) }).strict().parse(req.body ?? {});
    const r = await pool.query(
      `UPDATE tv_logins SET status = $3, user_id = $2, approved_at = now()
        WHERE code = $1 AND status = 'pending' AND expires_at > now() RETURNING device`,
      [b.code, req.user.sub, b.allow ? 'approved' : 'denied']);
    if (!r.rowCount) return reply.code(404).send({ error: 'Code inconnu ou expiré : vérifiez le code affiché sur la télé', code: 'unknown' });
    req.auditSummary = b.allow ? `Connexion d'une télé validée${r.rows[0].device ? ` (${r.rows[0].device})` : ''}` : 'Connexion d\'une télé refusée';
    return { ok: true, allowed: b.allow };
  });
}
