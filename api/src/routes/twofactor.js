// Étape 31 — Double authentification (2FA).
//   POST /auth/2fa/verify          public : 2e étape de la connexion {challenge, code} → jeton (code de l'application ou code de secours)
//   GET  /me/2fa                   état : activée ? date, codes de secours restants
//   POST /me/2fa/setup             {password} → clé et adresse du QR code (activation en cours, rien n'est encore exigé)
//   POST /me/2fa/enable            {code} → confirme l'activation et renvoie les 10 codes de secours (une seule fois)
//   POST /me/2fa/disable           {password, code} → désactive
//   POST /me/2fa/recovery          {password, code} → nouveaux codes de secours
//   POST /admin/users/:id/2fa/reset  administrateur : désactive la 2FA d'un compte (téléphone perdu, plus de codes de secours)
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { cryptoReady, decrypt, encrypt } from '../crypto.js';
import { getSetting } from '../settings.js';
import { newSecret, otpauthUri, verifyTotp } from '../totp.js';
import { checkSecondFactor, endChallenge, failChallenge, readChallenge, recoveryLeft, regenerateRecovery } from '../twofactor.js';
import { forgetUser } from '../userstate.js';

const AUTH_MAX = Number(process.env.AUTH_RATE_MAX) || 0;
const strict = { config: { rateLimit: { max: AUTH_MAX || 10, timeWindow: '1 minute' } } };
const code = z.string().trim().min(6).max(20);

export default async function twoFactorRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const sign = (u) => app.jwt.sign({ sub: u.id, role: u.role });
  const lockedMsg = (m) => `Trop d'essais : réessayez dans ${m} min`;

  // Mot de passe du compte connecté (action sensible).
  const passwordOk = async (userId, password) => {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    return Boolean(rows[0]) && bcrypt.compare(password, rows[0].password_hash);
  };

  app.post('/auth/2fa/verify', strict, async (req, reply) => {
    const b = z.object({ challenge: z.string().min(20).max(100), code }).parse(req.body);
    const ch = await readChallenge(b.challenge);
    if (!ch) return reply.code(401).send({ error: 'Connexion expirée : recommencez avec votre mot de passe.', code: 'challenge_expired' });
    const user = (await pool.query('SELECT id, email, name, role, locale, disabled_at FROM users WHERE id = $1', [ch.userId])).rows[0];
    if (!user || user.disabled_at) return reply.code(403).send({ error: 'Compte suspendu' });
    const r = await checkSecondFactor(user.id, b.code);
    if (!r.ok) {
      await failChallenge(b.challenge);
      if (r.locked) { await endChallenge(b.challenge); return reply.code(429).send({ error: lockedMsg(r.minutes), code: 'locked' }); }
      return reply.code(401).send({ error: 'Code incorrect', code: 'bad_code' });
    }
    await endChallenge(b.challenge);
    const { disabled_at, ...pub } = user;
    return { token: sign(pub), user: pub, usedRecovery: Boolean(r.usedRecovery), recoveryLeft: r.usedRecovery ? await recoveryLeft(user.id) : undefined };
  });

  app.get('/me/2fa', auth, async (req) => {
    const u = (await pool.query('SELECT totp_enabled_at FROM users WHERE id = $1', [req.user.sub])).rows[0];
    return { enabled: Boolean(u?.totp_enabled_at), enabledAt: u?.totp_enabled_at || null, recoveryLeft: u?.totp_enabled_at ? await recoveryLeft(req.user.sub) : 0, available: cryptoReady };
  });

  app.post('/me/2fa/setup', { ...auth, ...strict }, async (req, reply) => {
    const { password } = z.object({ password: z.string().min(1).max(72) }).parse(req.body);
    if (!cryptoReady) return reply.code(503).send({ error: "La double authentification n'est pas disponible (SETTINGS_KEY manquante sur le serveur)." });
    const u = (await pool.query('SELECT email, totp_enabled_at FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (u.totp_enabled_at) return reply.code(409).send({ error: 'Déjà activée', code: 'already' });
    if (!(await passwordOk(req.user.sub, password))) return reply.code(403).send({ error: 'Mot de passe incorrect' });
    const secret = newSecret();
    await pool.query('UPDATE users SET totp_pending = $2 WHERE id = $1', [req.user.sub, encrypt(secret)]);
    const issuer = String((await getSetting('app_name')) || 'Mejliss TV');
    return { secret, uri: otpauthUri({ issuer, account: u.email, secret }) };
  });

  app.post('/me/2fa/enable', { ...auth, ...strict }, async (req, reply) => {
    const b = z.object({ code }).parse(req.body);
    const u = (await pool.query('SELECT totp_pending, totp_enabled_at FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (u.totp_enabled_at) return reply.code(409).send({ error: 'Déjà activée', code: 'already' });
    if (!u.totp_pending) return reply.code(400).send({ error: "Commencez par « Activer » pour obtenir la clé.", code: 'no_setup' });
    const step = verifyTotp(decrypt(u.totp_pending), b.code);
    if (step == null) return reply.code(400).send({ error: 'Code incorrect : vérifiez l’heure de votre téléphone et réessayez.', code: 'bad_code' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled_at = now(), totp_last_step = $2, totp_failures = 0, totp_locked_until = NULL WHERE id = $1', [req.user.sub, step]);
      const codes = await regenerateRecovery(req.user.sub, client);
      await client.query('COMMIT');
      return { ok: true, recoveryCodes: codes };
    } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
  });

  // Actions sensibles : mot de passe + un code valable (application ou secours).
  const sensitive = async (req, reply) => {
    const b = z.object({ password: z.string().min(1).max(72), code }).parse(req.body);
    if (!(await passwordOk(req.user.sub, b.password))) { reply.code(403).send({ error: 'Mot de passe incorrect' }); return false; }
    const r = await checkSecondFactor(req.user.sub, b.code);
    if (!r.ok) { reply.code(r.locked ? 429 : 400).send({ error: r.locked ? lockedMsg(r.minutes) : 'Code incorrect', code: r.locked ? 'locked' : 'bad_code' }); return false; }
    return true;
  };

  app.post('/me/2fa/disable', { ...auth, ...strict }, async (req, reply) => {
    if (!(await sensitive(req, reply))) return;
    await pool.query('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL, totp_failures = 0, totp_locked_until = NULL WHERE id = $1', [req.user.sub]);
    await pool.query('DELETE FROM two_factor_recovery WHERE user_id = $1', [req.user.sub]);
    return { ok: true };
  });

  app.post('/me/2fa/recovery', { ...auth, ...strict }, async (req, reply) => {
    if (!(await sensitive(req, reply))) return;
    return { ok: true, recoveryCodes: await regenerateRecovery(req.user.sub) };
  });

  app.post('/admin/users/:id/2fa/reset', { preHandler: app.requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await pool.query('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL, totp_failures = 0, totp_locked_until = NULL, sessions_valid_after = now() WHERE id = $1 RETURNING email', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Utilisateur introuvable' });
    await pool.query('DELETE FROM two_factor_recovery WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM login_challenges WHERE user_id = $1', [id]);
    forgetUser(id);
    req.auditSummary = `Double authentification réinitialisée pour ${r.rows[0].email}`;
    return { ok: true };
  });
}
