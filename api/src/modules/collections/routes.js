// Étape 19 — Collections éditoriales (cycles, séries d'un intervenant, thèmes du moment).
//   GET /collections, GET /collections/:id        public (collections publiées ; seules les conférences visibles apparaissent)
//   GET /studio/collections[/:id]                 équipe (modérateur, administrateur) : toutes les collections
//   POST /studio/collections, PATCH/DELETE /studio/collections/:id, PUT /studio/collections/:id/items
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';
import { visibleSql } from '../../visibility.js';

const idSchema = z.object({ id: z.string().uuid() });
const KINDS = ['cycle', 'speaker', 'theme'];
export const MAX_ITEMS = 100;
export const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, c.name AS category,
  t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, left(regexp_replace(t.description, '\\s+', ' ', 'g'), 170) AS summary`;

export async function cards(rows) {
  for (const r of rows) {
    r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
    delete r.poster_key; delete r.external_thumb;
    if (r.source === 'upload') delete r.video_ref;
  }
  return rows;
}

// Conférences visibles et prêtes d'une collection ou d'une liste, dans l'ordre choisi.
export async function visibleItems(table, key, id) {
  const { rows } = await pool.query(
    `SELECT ${CARD} FROM ${table} i JOIN talks t ON t.id = i.talk_id LEFT JOIN category_names c ON c.id = t.category_id
      WHERE i.${key} = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} ORDER BY i.position`, [id]);
  return cards(rows);
}

export default async function collectionsRoutes(app) {
  const staff = { preHandler: app.requireRole('moderator', 'admin') };

  app.get('/collections', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    const { rows } = await pool.query(
      `SELECT c.id, c.title, c.description, c.kind, c.pinned,
              (SELECT count(*)::int FROM collection_items i JOIN talks t ON t.id = i.talk_id WHERE i.collection_id = c.id AND t.video_status = 'ready' AND ${visibleSql('t')}) AS talks,
              (SELECT t.poster_key FROM collection_items i JOIN talks t ON t.id = i.talk_id WHERE i.collection_id = c.id AND t.poster_key IS NOT NULL AND ${visibleSql('t')} ORDER BY i.position LIMIT 1) AS poster_key,
              (SELECT t.external_thumb FROM collection_items i JOIN talks t ON t.id = i.talk_id WHERE i.collection_id = c.id AND t.external_thumb IS NOT NULL AND ${visibleSql('t')} ORDER BY i.position LIMIT 1) AS external_thumb
         FROM collections c WHERE c.published ORDER BY c.pinned DESC, c.updated_at DESC`);
    const out = rows.filter((r) => r.talks > 0);
    for (const r of out) { r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null); delete r.poster_key; delete r.external_thumb; }
    return out;
  });

  app.get('/collections/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const c = (await pool.query('SELECT id, title, description, kind FROM collections WHERE id = $1 AND published', [id])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Collection introuvable' });
    reply.header('cache-control', 'public, max-age=30');
    return { ...c, talks: await visibleItems('collection_items', 'collection_id', id) };
  });

  // ------------------------------------------------------------------ Équipe
  app.get('/studio/collections', staff, async () => (await pool.query(
    `SELECT c.id, c.title, c.description, c.kind, c.published, c.pinned, c.updated_at AS "updatedAt",
            (SELECT count(*)::int FROM collection_items i WHERE i.collection_id = c.id) AS items
       FROM collections c ORDER BY c.pinned DESC, c.updated_at DESC`)).rows);

  app.get('/studio/collections/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const c = (await pool.query('SELECT id, title, description, kind, published, pinned FROM collections WHERE id = $1', [id])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Collection introuvable' });
    // Côté équipe : toutes les conférences de la collection, même celles qui ne sont pas (encore) visibles du public.
    const { rows } = await pool.query(
      `SELECT ${CARD}, ${visibleSql('t')} AS visible FROM collection_items i JOIN talks t ON t.id = i.talk_id LEFT JOIN category_names c ON c.id = t.category_id
        WHERE i.collection_id = $1 ORDER BY i.position`, [id]);
    return { ...c, max: MAX_ITEMS, talks: await cards(rows) };
  });

  const body = z.object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).default(''),
    kind: z.enum(KINDS).default('theme'),
    published: z.boolean().default(false),
    pinned: z.boolean().default(false),
  });
  app.post('/studio/collections', staff, async (req, reply) => {
    const b = body.parse(req.body ?? {});
    const { rows } = await pool.query(
      'INSERT INTO collections(title, description, kind, published, pinned, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [b.title, b.description, b.kind, b.published, b.pinned, req.user.sub]);
    req.auditSummary = `Collection créée : « ${b.title} »`;
    return reply.code(201).send({ id: rows[0].id });
  });

  app.patch('/studio/collections/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = body.partial().parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM collections WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Collection introuvable' });
    const m = { ...cur, ...b };
    await pool.query('UPDATE collections SET title = $2, description = $3, kind = $4, published = $5, pinned = $6, updated_at = now() WHERE id = $1',
      [id, m.title, m.description, m.kind, m.published, m.pinned]);
    req.auditSummary = `Collection modifiée : « ${m.title} »${b.published !== undefined ? (b.published ? ' (publiée)' : ' (dépubliée)') : ''}`;
    return { ok: true };
  });

  app.delete('/studio/collections/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = (await pool.query('DELETE FROM collections WHERE id = $1 RETURNING title', [id])).rows[0];
    if (r) req.auditSummary = `Collection supprimée : « ${r.title} »`;
    return reply.code(204).send();
  });

  // Remplace la liste des conférences ; l'ordre du tableau est l'ordre d'affichage.
  app.put('/studio/collections/:id/items', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { talkIds } = z.object({ talkIds: z.array(z.string().uuid()).max(MAX_ITEMS) }).parse(req.body ?? {});
    const ids = [...new Set(talkIds)];
    const cur = (await pool.query('SELECT title FROM collections WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Collection introuvable' });
    if (ids.length) {
      const found = (await pool.query('SELECT count(*)::int AS n FROM talks WHERE id = ANY($1::uuid[])', [ids])).rows[0].n;
      if (found !== ids.length) return reply.code(400).send({ error: 'Une conférence est introuvable' });
    }
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM collection_items WHERE collection_id = $1', [id]);
      for (let i = 0; i < ids.length; i++) await c.query('INSERT INTO collection_items(collection_id, talk_id, position) VALUES ($1, $2, $3)', [id, ids[i], i]);
      await c.query('UPDATE collections SET updated_at = now() WHERE id = $1', [id]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    req.auditSummary = `Conférences de la collection « ${cur.title} » : ${ids.length}`;
    return { count: ids.length };
  });
}
