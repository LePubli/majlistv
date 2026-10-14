// Étape 20 — Journal des actions de l'équipe (administrateurs et modérateurs).
// Un crochet « fin de réponse » inscrit chaque modification réussie : qui, quand, quelle route, quelle cible, quels CHAMPS
// (leurs noms seulement, jamais les valeurs : mots de passe, clés, contenus). Les routes de modération ajoutent une phrase
// lisible avec `req.auditSummary`. Le journal est en ajout seul : aucune route ne le modifie ni ne le vide.
import { pool } from './db.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Routes éditoriales : seules les actions de l'administrateur y sont journalisées (une conférence d'un autre, une série, un import…).
const EDITORIAL = ['/talks', '/series', '/categories', '/studio', '/imports', '/uploads', '/books'];
// …hors gestes de simple spectateur.
const VIEWER = [/^\/talks\/:id\/notes/, /^\/talks\/:id\/practice\/commitments/, /^\/talks\/:id\/report/, /^\/books\/:id\/download-link/];

export function shouldLog(role, method, route) {
  if (!MUTATING.has(method) || !route) return false;
  if (role !== 'admin' && role !== 'moderator') return false;
  if (route.startsWith('/admin/') || route.startsWith('/moderation/')) return true;
  if (role !== 'admin') return false;
  if (VIEWER.some((re) => re.test(route))) return false;
  return EDITORIAL.some((p) => route === p || route.startsWith(p + '/'));
}

export function startAudit(app) {
  app.addHook('onResponse', async (req, reply) => {
    try {
      const route = req.routeOptions?.url;
      const role = req.user?.role;
      if (!shouldLog(role, req.method, route) || reply.statusCode >= 400) return;
      const target = Object.entries(req.params || {}).map(([k, v]) => `${k}=${v}`).join(' ');
      const fields = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? Object.keys(req.body).slice(0, 30) : [];
      const who = (await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.sub])).rows[0];
      await pool.query(
        `INSERT INTO audit_log(actor_id, actor_name, actor_role, method, route, target, fields, summary, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.user.sub, who ? `${who.name} <${who.email}>` : String(req.user.sub), role, req.method, route, target, fields, (req.auditSummary || '').slice(0, 500), reply.statusCode]);
    } catch (err) {
      req.log.warn({ err }, 'journal : écriture impossible');
    }
  });
}
