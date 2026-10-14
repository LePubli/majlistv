// Étape 19 — Listes personnelles des membres, partageables par un lien secret.
//   GET/POST /me/lists, PATCH/DELETE /me/lists/:id, PUT /me/lists/:id/items, PUT/DELETE /me/lists/:id/items/:talkId
//   POST /me/lists/:id/share (active ou renouvelle le lien), DELETE /me/lists/:id/share (coupe le partage)
//   GET /me/lists/containing/:talkId             listes du membre qui contiennent cette conférence
//   GET /lists/shared/:token                     lecture publique d'une liste partagée (jamais l'identité du membre)
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { visibleSql } from '../visibility.js';
import { visibleItems } from './collections.js';

export const MAX_LISTS = 20;
export const MAX_LIST_ITEMS = 200;
const idSchema = z.object({ id: z.string().uuid() });
const newToken = () => randomBytes(16).toString('base64url');

export default async function listsRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const owned = async (req, reply, id) => {
    const l = (await pool.query('SELECT * FROM user_lists WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!l) { reply.code(404).send({ error: 'Liste introuvable' }); return null; }
    return l;
  };
  const shape = (l, count) => ({ id: l.id, title: l.title, description: l.description, shared: Boolean(l.share_token), shareToken: l.share_token, items: count, updatedAt: l.updated_at });

  app.get('/me/lists', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT l.*, (SELECT count(*)::int FROM user_list_items i WHERE i.list_id = l.id) AS n FROM user_lists l WHERE l.user_id = $1 ORDER BY l.created_at`, [req.user.sub]);
    return { limit: MAX_LISTS, maxItems: MAX_LIST_ITEMS, lists: rows.map((l) => shape(l, l.n)) };
  });

  app.get('/me/lists/containing/:talkId', auth, async (req) => {
    const { talkId } = z.object({ talkId: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query('SELECT list_id FROM user_list_items i JOIN user_lists l ON l.id = i.list_id WHERE l.user_id = $1 AND i.talk_id = $2', [req.user.sub, talkId]);
    return rows.map((r) => r.list_id);
  });

  const body = z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().max(500).default('') });
  app.post('/me/lists', auth, async (req, reply) => {
    const b = body.parse(req.body ?? {});
    const n = (await pool.query('SELECT count(*)::int AS n FROM user_lists WHERE user_id = $1', [req.user.sub])).rows[0].n;
    if (n >= MAX_LISTS) return reply.code(409).send({ error: `Vous avez déjà ${MAX_LISTS} listes : supprimez-en une pour continuer.`, code: 'limit' });
    const { rows } = await pool.query('INSERT INTO user_lists(user_id, title, description) VALUES ($1, $2, $3) RETURNING *', [req.user.sub, b.title, b.description]);
    return reply.code(201).send(shape(rows[0], 0));
  });

  app.get('/me/lists/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const l = await owned(req, reply, id); if (!l) return;
    // Dans sa propre liste, le membre voit aussi les conférences devenues indisponibles (pour pouvoir les retirer).
    const talks = await visibleItems('user_list_items', 'list_id', id);
    const total = (await pool.query('SELECT count(*)::int AS n FROM user_list_items WHERE list_id = $1', [id])).rows[0].n;
    return { ...shape(l, total), unavailable: total - talks.length, talks };
  });

  app.patch('/me/lists/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = body.partial().parse(req.body ?? {});
    const l = await owned(req, reply, id); if (!l) return;
    await pool.query('UPDATE user_lists SET title = $2, description = $3, updated_at = now() WHERE id = $1', [id, b.title ?? l.title, b.description ?? l.description]);
    return { ok: true };
  });

  app.delete('/me/lists/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM user_lists WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    return reply.code(204).send();
  });

  // Ajoute (à la fin) ou réordonne : { talkIds } remplace l'ordre/le contenu ; PUT .../items/:talkId ajoute une conférence.
  app.put('/me/lists/:id/items', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { talkIds } = z.object({ talkIds: z.array(z.string().uuid()).max(MAX_LIST_ITEMS) }).parse(req.body ?? {});
    const l = await owned(req, reply, id); if (!l) return;
    const ids = [...new Set(talkIds)];
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const old = new Set((await c.query('SELECT talk_id FROM user_list_items WHERE list_id = $1', [id])).rows.map((r) => r.talk_id));
      if (ids.some((x) => !old.has(x))) { await c.query('ROLLBACK'); return reply.code(400).send({ error: 'Utilisez l\'ajout pour ajouter une conférence' }); }
      await c.query('DELETE FROM user_list_items WHERE list_id = $1 AND NOT (talk_id = ANY($2::uuid[]))', [id, ids]);
      for (let i = 0; i < ids.length; i++) await c.query('UPDATE user_list_items SET position = $3 WHERE list_id = $1 AND talk_id = $2', [id, ids[i], i]);
      await c.query('UPDATE user_lists SET updated_at = now() WHERE id = $1', [id]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    return { count: ids.length };
  });

  app.put('/me/lists/:id/items/:talkId', auth, async (req, reply) => {
    const { id, talkId } = z.object({ id: z.string().uuid(), talkId: z.string().uuid() }).parse(req.params);
    const l = await owned(req, reply, id); if (!l) return;
    const t = (await pool.query(`SELECT 1 FROM talks t WHERE t.id = $1 AND ${visibleSql('t')}`, [talkId])).rowCount;
    if (!t) return reply.code(404).send({ error: 'Conférence introuvable' });
    const r = (await pool.query('SELECT count(*)::int AS n, coalesce(max(position), -1) + 1 AS next FROM user_list_items WHERE list_id = $1', [id])).rows[0];
    if (r.n >= MAX_LIST_ITEMS) return reply.code(409).send({ error: `Une liste contient ${MAX_LIST_ITEMS} conférences au plus.`, code: 'limit' });
    await pool.query('INSERT INTO user_list_items(list_id, talk_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, talkId, r.next]);
    await pool.query('UPDATE user_lists SET updated_at = now() WHERE id = $1', [id]);
    return reply.code(204).send();
  });

  app.delete('/me/lists/:id/items/:talkId', auth, async (req, reply) => {
    const { id, talkId } = z.object({ id: z.string().uuid(), talkId: z.string().uuid() }).parse(req.params);
    const l = await owned(req, reply, id); if (!l) return;
    await pool.query('DELETE FROM user_list_items WHERE list_id = $1 AND talk_id = $2', [id, talkId]);
    return reply.code(204).send();
  });

  // Partage : un lien secret ; « renouveler » invalide l'ancien lien.
  app.post('/me/lists/:id/share', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { renew } = z.object({ renew: z.boolean().default(false) }).parse(req.body ?? {});
    const l = await owned(req, reply, id); if (!l) return;
    const token = l.share_token && !renew ? l.share_token : newToken();
    await pool.query('UPDATE user_lists SET share_token = $2 WHERE id = $1', [id, token]);
    return { shareToken: token };
  });
  app.delete('/me/lists/:id/share', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const l = await owned(req, reply, id); if (!l) return;
    await pool.query('UPDATE user_lists SET share_token = NULL WHERE id = $1', [id]);
    return reply.code(204).send();
  });

  // Lecture publique : titre, description et conférences visibles. Rien sur le membre. Pas d'indexation.
  app.get('/lists/shared/:token', async (req, reply) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) }).parse(req.params);
    const l = (await pool.query('SELECT id, title, description FROM user_lists WHERE share_token = $1', [token])).rows[0];
    if (!l) return reply.code(404).send({ error: 'Cette liste n\'existe pas ou n\'est plus partagée' });
    reply.header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex');
    return { title: l.title, description: l.description, talks: await visibleItems('user_list_items', 'list_id', l.id) };
  });
}
