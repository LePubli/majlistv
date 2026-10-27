// Étape 39 — Suivi des erreurs.
//   POST /errors/client            (public, limité) erreur du navigateur envoyée par le site
//   GET  /admin/errors             liste des erreurs regroupées (?state=open|resolved|ignored|all, ?source=api|web)
//   GET  /admin/errors/:fp         détail : trace et dernières occurrences
//   PUT  /admin/errors/:fp         { state: 'open' | 'resolved' | 'ignored' }
//   POST /admin/errors/test        provoque une vraie erreur serveur d'essai (passe par le même chemin que les vraies)
import { z } from 'zod';
import { pool } from '../db.js';
import { recordError } from '../errors.js';
import { isNoise } from '../errorsLib.js';

const fpSchema = z.object({ fp: z.string().regex(/^[0-9a-f]{16}$/) });

export default async function errorsRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.post('/errors/client', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = z.object({
      message: z.string().max(1000).default(''), stack: z.string().max(8000).default(''),
      path: z.string().max(500).default(''),
    }).parse(req.body ?? {});
    if (!isNoise(b.message, b.stack)) {
      await recordError({ source: 'web', message: b.message, stack: b.stack, path: b.path, route: b.path, userAgent: String(req.headers['user-agent'] || '') });
    }
    return reply.code(204).send();
  });

  app.get('/admin/errors', adminOnly, async (req) => {
    const q = z.object({ state: z.enum(['open', 'resolved', 'ignored', 'all']).default('open'), source: z.enum(['api', 'web', 'all']).default('all') }).parse(req.query ?? {});
    const where = []; const args = [];
    if (q.state !== 'all') { args.push(q.state); where.push(`state = $${args.length}`); }
    if (q.source !== 'all') { args.push(q.source); where.push(`source = $${args.length}`); }
    const [list, counts, day] = await Promise.all([
      pool.query(`SELECT fingerprint, source, message, route, method, http_status AS "httpStatus", state, count::int, first_at AS "firstAt", last_at AS "lastAt"
                    FROM error_groups ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY last_at DESC LIMIT 100`, args),
      pool.query("SELECT state, count(*)::int AS n FROM error_groups GROUP BY state"),
      pool.query("SELECT count(*)::int AS n FROM error_events WHERE at > now() - interval '24 hours'"),
    ]);
    const c = { open: 0, resolved: 0, ignored: 0 };
    for (const r of counts.rows) c[r.state] = r.n;
    return { items: list.rows, counts: c, last24h: day.rows[0].n };
  });

  app.get('/admin/errors/:fp', adminOnly, async (req, reply) => {
    const { fp } = fpSchema.parse(req.params);
    const g = (await pool.query(
      `SELECT fingerprint, source, message, route, method, http_status AS "httpStatus", state, count::int, first_at AS "firstAt", last_at AS "lastAt", last_stack AS stack
         FROM error_groups WHERE fingerprint = $1`, [fp])).rows[0];
    if (!g) return reply.code(404).send({ error: 'Erreur introuvable' });
    const ev = (await pool.query('SELECT at, path, user_agent AS "userAgent" FROM error_events WHERE fingerprint = $1 ORDER BY at DESC LIMIT 20', [fp])).rows;
    return { ...g, events: ev };
  });

  app.put('/admin/errors/:fp', adminOnly, async (req, reply) => {
    const { fp } = fpSchema.parse(req.params);
    const { state } = z.object({ state: z.enum(['open', 'resolved', 'ignored']) }).parse(req.body ?? {});
    const { rowCount } = await pool.query(
      "UPDATE error_groups SET state = $2, resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END WHERE fingerprint = $1", [fp, state]);
    if (!rowCount) return reply.code(404).send({ error: 'Erreur introuvable' });
    return { ok: true, state };
  });

  // Erreur d'essai : lève une vraie exception, donc passe par le gestionnaire d'erreurs de l'API comme n'importe quel bug.
  app.post('/admin/errors/test', adminOnly, async () => {
    throw new Error("Erreur d'essai déclenchée depuis Admin → Erreurs (aucun problème réel)");
  });
}
