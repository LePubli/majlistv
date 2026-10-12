// État actuel d'un compte (rôle, suspension) : le rôle d'un jeton peut dater de plusieurs jours, la base fait foi.
// Mis en cache 10 s pour éviter une requête SQL par appel.
import { pool } from './db.js';

const cache = new Map();
export const forgetUser = (id) => cache.delete(id);

export async function currentUser(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 10000) return hit.user;
  const { rows } = await pool.query('SELECT id, role, disabled_at FROM users WHERE id = $1', [id]);
  const user = rows[0] && !rows[0].disabled_at ? { sub: rows[0].id, role: rows[0].role } : null;
  cache.set(id, { at: Date.now(), user });
  return user;
}
