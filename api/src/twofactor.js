// Étape 31 — Double authentification : accès à la base (défi de connexion, vérification du second facteur, codes de secours).
import { createHash, randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { decrypt } from './crypto.js';
import { hashRecovery, newRecoveryCodes, normalizeRecovery, stepOf, verifyTotp } from './totp.js';

const sha = (t) => createHash('sha256').update(t).digest('hex');
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const CHALLENGE_MINUTES = 5;

/** Défi de connexion : le mot de passe était bon, il reste le code. Renvoie le jeton (gardé seulement sous forme d'empreinte). */
export async function startChallenge(userId) {
  await pool.query('DELETE FROM login_challenges WHERE expires_at < now()');
  const token = randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO login_challenges(token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' minutes')::interval)", [sha(token), userId, String(CHALLENGE_MINUTES)]);
  return token;
}

/** Utilisateur lié à un défi encore valable (ou null). */
export async function readChallenge(token) {
  const { rows } = await pool.query('SELECT user_id, failures FROM login_challenges WHERE token_hash = $1 AND expires_at > now() AND failures < $2', [sha(String(token)), MAX_FAILURES]);
  return rows[0] ? { userId: rows[0].user_id, failures: rows[0].failures } : null;
}
export const endChallenge = (token) => pool.query('DELETE FROM login_challenges WHERE token_hash = $1', [sha(String(token))]);
export const failChallenge = (token) => pool.query('UPDATE login_challenges SET failures = failures + 1 WHERE token_hash = $1', [sha(String(token))]);

/**
 * Vérifie le second facteur d'un compte : code de l'application (6 chiffres) ou code de secours.
 * Renvoie { ok:true, usedRecovery } ou { ok:false, locked, minutes }. Compte les erreurs : 5 de suite = compte verrouillé 15 minutes.
 */
export async function checkSecondFactor(userId, input) {
  const { rows } = await pool.query('SELECT totp_secret, totp_last_step, totp_locked_until, totp_enabled_at FROM users WHERE id = $1', [userId]);
  const u = rows[0];
  if (!u || !u.totp_enabled_at || !u.totp_secret) return { ok: false };
  if (u.totp_locked_until && new Date(u.totp_locked_until) > new Date()) return { ok: false, locked: true, minutes: Math.ceil((new Date(u.totp_locked_until) - Date.now()) / 60000) };

  let ok = false, usedRecovery = false;
  const rc = normalizeRecovery(input);
  if (rc) {
    const r = await pool.query('UPDATE two_factor_recovery SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL', [userId, hashRecovery(rc)]);
    ok = r.rowCount === 1; usedRecovery = ok;
  } else {
    const step = verifyTotp(decrypt(u.totp_secret), input, { lastStep: u.totp_last_step });
    if (step != null) {
      // Atomique : si deux requêtes portent le même code, une seule passe.
      const r = await pool.query('UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)', [userId, step]);
      ok = r.rowCount === 1;
    }
  }
  if (ok) { await pool.query('UPDATE users SET totp_failures = 0, totp_locked_until = NULL WHERE id = $1', [userId]); return { ok: true, usedRecovery }; }
  const f = await pool.query(
    `UPDATE users SET
       totp_locked_until = CASE WHEN totp_failures + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE totp_locked_until END,
       totp_failures = CASE WHEN totp_failures + 1 >= $2 THEN 0 ELSE totp_failures + 1 END
     WHERE id = $1 RETURNING totp_locked_until`, [userId, MAX_FAILURES, String(LOCK_MINUTES)]);
  const lockedUntil = f.rows[0]?.totp_locked_until;
  return lockedUntil && new Date(lockedUntil) > new Date() ? { ok: false, locked: true, minutes: LOCK_MINUTES } : { ok: false };
}

/** Remplace les codes de secours du compte (les anciens deviennent inutilisables) ; renvoie les 10 nouveaux, en clair, une seule fois. */
export async function regenerateRecovery(userId, db = pool) {
  const codes = newRecoveryCodes(10);
  await db.query('DELETE FROM two_factor_recovery WHERE user_id = $1', [userId]);
  for (const c of codes) await db.query('INSERT INTO two_factor_recovery(user_id, code_hash) VALUES ($1, $2)', [userId, hashRecovery(c)]);
  return codes;
}

export const recoveryLeft = async (userId) => (await pool.query('SELECT count(*)::int AS n FROM two_factor_recovery WHERE user_id = $1 AND used_at IS NULL', [userId])).rows[0].n;
export { stepOf };
