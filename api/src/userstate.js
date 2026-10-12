// État actuel d'un compte (rôle, suspension) : le rôle d'un jeton peut dater de plusieurs jours, la base fait foi.
// Mis en cache 10 s pour éviter une requête SQL par appel.
import { pool } from './db.js';

const cache = new Map();
export const forgetUser = (id) => cache.delete(id);

// iat : date d'émission du jeton (secondes). Un jeton émis avant un changement de mot de passe est refusé.
export async function currentUser(id, iat) {
  let hit = cache.get(id);
  if (!hit || Date.now() - hit.at >= 10000) {
    const { rows } = await pool.query('SELECT id, role, disabled_at, sessions_valid_after FROM users WHERE id = $1', [id]);
    const r = rows[0];
    hit = { at: Date.now(), user: r && !r.disabled_at ? { sub: r.id, role: r.role } : null, validAfter: r?.sessions_valid_after ? new Date(r.sessions_valid_after).getTime() : 0 };
    cache.set(id, hit);
  }
  if (hit.user && iat && hit.validAfter && iat * 1000 < hit.validAfter - 1000) return null;
  return hit.user;
}
