// Étape 19 — Collections éditoriales (cycles, séries d'un intervenant, thèmes du moment).
//   GET /collections, GET /collections/:id        public (collections publiées ; seules les vidéos visibles apparaissent)
//   GET /studio/collections[/:id]                 équipe (modérateur, administrateur) : toutes les collections
//   POST /studio/collections, PATCH/DELETE /studio/collections/:id, PUT /studio/collections/:id/items
import { z } from 'zod';
import { patchOf } from '../../zpatch.js';
import { pool } from '../../db.js';
import { presignGet, deleteObject } from '../../storage.js';
import { storeImage } from '../../imageUpload.js';
import { visibleSql } from '../../visibility.js';
import { SEASON_IDS } from '../../hijri.js';
import { MODES, cleanRule, resolveCollection, homeCollections } from '../../collectionRules.js';

const idSchema = z.object({ id: z.guid() });
const KINDS = ['cycle', 'speaker', 'theme'];
export const MAX_ITEMS = 500;
import { CARD, cards, visibleItems } from '../../talkCards.js'; // fiches de vidéos partagées (socle), étape M3a
export { CARD, cards, visibleItems };

export default async function collectionsRoutes(app) {
  const staff = { preHandler: app.requireRole('moderator', 'admin') };

  // Collections publiées du catalogue adultes (les personnelles n'ont pas de page publique : elles vivent sur l'accueil du membre).
  app.get('/collections', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=30');
    const { rows } = await pool.query(
      `SELECT id, title, description, kind, pinned, mode, rule, season, catalogue, poster_key FROM collections
        WHERE published AND catalogue = 'adult' AND mode <> 'personal' ORDER BY pinned DESC, home_order, updated_at DESC`);
    const out = [];
    for (const c of rows) {
      const r = await resolveCollection(c, null, { size: 50 });
      if (!r.open || !r.talks.length) continue;
      out.push({ id: c.id, title: c.title, description: c.description, kind: c.kind, pinned: c.pinned, mode: c.mode, talks: r.talks.length, posterUrl: c.poster_key ? await presignGet(c.poster_key) : (r.talks.find((x) => x.posterUrl)?.posterUrl || null) });
    }
    return out;
  });

  // Rangées de collections de l'accueil (adultes) : varient selon le membre (continuer, parcours, pour vous) → jamais en cache partagé.
  app.get('/collections/home', async (req, reply) => {
    const u = await app.optionalUser(req);
    reply.header('cache-control', u ? 'private, no-store' : 'public, max-age=30');
    return { collections: await homeCollections('adult', u ? { sub: u.sub } : null, { size: 12 }) };
  });

  app.get('/collections/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const c = (await pool.query(`SELECT id, title, description, kind, mode, catalogue, rule, season, poster_key, cover_key FROM collections WHERE id = $1 AND published AND catalogue = 'adult'`, [id])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Collection introuvable' });
    const u = c.mode === 'personal' ? await app.optionalUser(req) : null;
    reply.header('cache-control', c.mode === 'personal' ? 'private, no-store' : 'public, max-age=30');
    const r = await resolveCollection(c, u ? { sub: u.sub } : null, { size: 50 });
    if (!r.open) return reply.code(404).send({ error: 'Collection introuvable' });
    const firstPoster = r.talks.find((x) => x.posterUrl)?.posterUrl || null; // images par défaut : celle de la première vidéo
    const posterUrl = c.poster_key ? await presignGet(c.poster_key) : firstPoster;
    return { id: c.id, title: c.title, description: c.description, kind: c.kind, mode: c.mode, posterUrl, coverUrl: c.cover_key ? await presignGet(c.cover_key) : posterUrl, talks: r.talks };
  });

  // ------------------------------------------------------------------ Équipe
  app.get('/studio/collections', staff, async () => (await pool.query(
    `SELECT c.id, c.slug, c.title, c.description, c.kind, c.published, c.pinned, c.mode, c.catalogue, c.season, c.on_home AS "onHome", c.home_order AS "homeOrder", c.updated_at AS "updatedAt", c.series_id AS "seriesId",
            (SELECT count(*)::int FROM collection_items i WHERE i.collection_id = c.id) AS items
       FROM collections c ORDER BY c.pinned DESC, c.updated_at DESC`)).rows);

  // Recherche de vidéos à ajouter : TOUTES les vidéos (même pas encore visibles), titre ou intervenant, 200 par page, `total` = nombre de résultats.
  app.get('/studio/collections-search', staff, async (req) => {
    const q = z.object({ q: z.string().trim().max(100).default(''), offset: z.coerce.number().int().min(0).max(100000).default(0), catalogue: z.enum(['adult', 'kids']).optional() }).parse(req.query);
    const vals = [];
    const where = ['TRUE'];
    if (q.q) { vals.push(`%${q.q.replace(/[%_\\]/g, '')}%`); where.push(`(t.title ILIKE $${vals.length} OR t.speaker ILIKE $${vals.length})`); }
    const total = (await pool.query(`SELECT count(*)::int AS n FROM talks t WHERE ${where.join(' AND ')}`, vals)).rows[0].n;
    vals.push(q.offset);
    const { rows } = await pool.query(
      `SELECT ${CARD}, ${visibleSql('t')} AS visible FROM talks t LEFT JOIN category_names c ON c.id = t.category_id
        WHERE ${where.join(' AND ')} ORDER BY t.title COLLATE "C", t.created_at DESC LIMIT 200 OFFSET $${vals.length}`, vals);
    return { items: await cards(rows), total };
  });

  app.get('/studio/collections/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const c = (await pool.query(`SELECT c.id, c.slug, c.title, c.description, c.kind, c.published, c.pinned, c.mode, c.catalogue, c.rule, c.season, c.on_home AS "onHome", c.home_order AS "homeOrder",
            c.series_id AS "seriesId", s.title AS "seriesTitle", c.poster_key, c.cover_key
       FROM collections c LEFT JOIN series s ON s.id = c.series_id WHERE c.id = $1`, [id])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Collection introuvable' });
    c.posterUrl = c.poster_key ? await presignGet(c.poster_key) : null;
    c.coverUrl = c.cover_key ? await presignGet(c.cover_key) : null;
    delete c.poster_key; delete c.cover_key;
    // Côté équipe : toutes les vidéos de la collection, même celles qui ne sont pas (encore) visibles du public.
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
    slug: z.string().regex(/^[a-z0-9-]{2,80}$/).nullable().default(null),
    mode: z.enum(MODES).default('manual'),
    catalogue: z.enum(['adult', 'kids']).default('adult'),
    rule: z.record(z.string(), z.unknown()).default({}),
    season: z.string().regex(/^[a-z_-]{2,30}$/).nullable().default(null),
    onHome: z.boolean().default(false),
    homeOrder: z.number().int().min(0).max(999).default(100),
  });

  // Cohérence d'une collection : règle valide, saison obligatoire pour « saisonnière », type obligatoire pour « personnelle ».
  const check = (m) => {
    let rule;
    try { rule = cleanRule(m.rule); } catch (e) { return { error: 'Règle invalide : ' + (e.issues?.map((i) => `${i.path.join('.') || 'règle'} ${i.message}`).join(' ; ') || 'format') }; }
    if (m.mode === 'personal') {
      if (!rule.type) return { error: 'Une collection personnelle a besoin d’un type (continue, path, foryou, later)' };
      if (m.catalogue === 'kids' && rule.type !== 'continue') return { error: 'Côté Kids, seule la reprise (continue) est disponible' };
    } else if (rule.type) return { error: 'Le type n’existe que pour les collections personnelles' };
    if (m.mode === 'seasonal' && !SEASON_IDS.includes(m.season)) return { error: 'Choisissez la saison (' + SEASON_IDS.join(', ') + ')' };
    if (m.mode !== 'seasonal') m.season = null;
    if (rule.minSeconds != null && rule.maxSeconds != null && rule.minSeconds >= rule.maxSeconds) return { error: 'La durée minimale doit être inférieure à la durée maximale' };
    return { rule };
  };
  const dupSlug = (reply, e) => (e.code === '23505' ? reply.code(409).send({ error: 'Cet identifiant (slug) est déjà utilisé' }) : null);
  const COLS = 'slug, title, description, kind, published, pinned, mode, catalogue, rule, season, on_home, home_order';

  app.post('/studio/collections', staff, async (req, reply) => {
    const b = body.parse(req.body ?? {});
    const k = check(b); if (k.error) return reply.code(400).send({ error: k.error });
    try {
      const { rows } = await pool.query(
        `INSERT INTO collections(${COLS}, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13) RETURNING id`,
        [b.slug, b.title, b.description, b.kind, b.published, b.pinned, b.mode, b.catalogue, JSON.stringify(k.rule), b.season, b.onHome, b.homeOrder, req.user.sub]);
      req.auditSummary = `Collection créée : « ${b.title} »`;
      return reply.code(201).send({ id: rows[0].id });
    } catch (e) { return dupSlug(reply, e) || Promise.reject(e); }
  });

  app.patch('/studio/collections/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchOf(body).parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM collections WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Collection introuvable' });
    if (cur.series_id) {
      const fixed = { title: cur.title, description: cur.description, published: cur.published, mode: cur.mode, catalogue: cur.catalogue };
      for (const k of Object.keys(fixed)) if (b[k] !== undefined && b[k] !== fixed[k]) return reply.code(409).send({ error: 'Cette collection suit sa série : modifiez le titre, la présentation et la publication dans la série' });
    }
    const m = { ...cur, ...b, onHome: b.onHome ?? cur.on_home, homeOrder: b.homeOrder ?? cur.home_order };
    const k = check(m); if (k.error) return reply.code(400).send({ error: k.error });
    try {
      await pool.query(
        `UPDATE collections SET slug = $2, title = $3, description = $4, kind = $5, published = $6, pinned = $7, mode = $8, catalogue = $9,
                rule = $10::jsonb, season = $11, on_home = $12, home_order = $13, updated_at = now() WHERE id = $1`,
        [id, m.slug, m.title, m.description, m.kind, m.published, m.pinned, m.mode, m.catalogue, JSON.stringify(k.rule), m.season, m.onHome, m.homeOrder]);
    } catch (e) { return dupSlug(reply, e) || Promise.reject(e); }
    req.auditSummary = `Collection modifiée : « ${m.title} »${b.published !== undefined ? (b.published ? ' (publiée)' : ' (dépubliée)') : ''}`;
    return { ok: true };
  });

  // Aperçu d'une règle avant enregistrement : ce que la collection afficherait maintenant (la saison est ignorée ; « personnelle » : le compte de l'équipe sert d'exemple).
  app.post('/studio/collections/preview', staff, async (req, reply) => {
    const b = z.object({ mode: z.enum(MODES), catalogue: z.enum(['adult', 'kids']).default('adult'), rule: z.record(z.string(), z.unknown()).default({}), season: z.string().nullable().default(null), id: z.guid().optional() }).parse(req.body ?? {});
    const k = check({ ...b }); if (k.error) return reply.code(400).send({ error: k.error });
    const r = await resolveCollection({ id: b.id ?? null, mode: b.mode, catalogue: b.catalogue, rule: k.rule, season: b.season },
      b.mode === 'personal' ? { sub: req.user.sub } : null, { size: 24, preview: true });
    return { talks: r.talks, count: r.talks.length };
  });

  app.delete('/studio/collections/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = (await pool.query('DELETE FROM collections WHERE id = $1 RETURNING title, series_id, poster_key, cover_key', [id])).rows[0];
    if (r?.series_id) await pool.query('UPDATE series SET as_collection = false WHERE id = $1', [r.series_id]).catch(() => {});
    for (const k of [r?.series_id ? null : r?.poster_key, r?.series_id ? null : r?.cover_key]) if (k?.startsWith('collections/')) await deleteObject(k).catch(() => {});
    if (r) req.auditSummary = `Collection supprimée : « ${r.title} »`;
    return reply.code(204).send();
  });

  // Remplace la liste des vidéos ; l'ordre du tableau est l'ordre d'affichage.
  app.put('/studio/collections/:id/items', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { talkIds } = z.object({ talkIds: z.array(z.guid()).max(MAX_ITEMS) }).parse(req.body ?? {});
    const ids = [...new Set(talkIds)];
    const cur = (await pool.query('SELECT title, series_id FROM collections WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Collection introuvable' });
    if (cur.series_id) return reply.code(409).send({ error: 'Les vidéos de cette collection suivent sa série : changez-les dans la série' });
    if (ids.length) {
      const found = (await pool.query('SELECT count(*)::int AS n FROM talks WHERE id = ANY($1::uuid[])', [ids])).rows[0].n;
      if (found !== ids.length) return reply.code(400).send({ error: 'Une vidéo est introuvable' });
    }
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM collection_items WHERE collection_id = $1', [id]);
      for (let i = 0; i < ids.length; i++) await c.query('INSERT INTO collection_items(collection_id, talk_id, position) VALUES ($1, $2, $3)', [id, ids[i], i]);
      await c.query('UPDATE collections SET updated_at = now() WHERE id = $1', [id]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    req.auditSummary = `Vidéos de la collection « ${cur.title} » : ${ids.length}`;
    return { count: ids.length };
  });

  // Images de la collection : affiche (vignettes) et couverture (en-tête de la page). Liée à une série : les images se changent dans la série.
  for (const [route, col, label] of [['poster', 'poster_key', 'posterUrl'], ['cover', 'cover_key', 'coverUrl']]) {
    app.post(`/studio/collections/:id/${route}`, { ...staff, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
      const { id } = idSchema.parse(req.params);
      const { image } = z.object({ image: z.string().max(3_500_000) }).strict().parse(req.body ?? {});
      const cur = (await pool.query(`SELECT ${col} AS k, series_id FROM collections WHERE id = $1`, [id])).rows[0];
      if (!cur) return reply.code(404).send({ error: 'Collection introuvable' });
      if (cur.series_id) return reply.code(409).send({ error: 'Les images de cette collection suivent sa série : changez-les dans la série' });
      const st = await storeImage('collections', id, image);
      if (st.error) return reply.code(400).send({ error: st.error });
      await pool.query(`UPDATE collections SET ${col} = $2, updated_at = now() WHERE id = $1`, [id, st.key]);
      if (cur.k?.startsWith('collections/')) await deleteObject(cur.k).catch(() => {});
      req.auditSummary = `Image de la collection (${route}) modifiée`;
      return reply.code(201).send({ [label]: await presignGet(st.key) });
    });
    app.delete(`/studio/collections/:id/${route}`, staff, async (req, reply) => {
      const { id } = idSchema.parse(req.params);
      const cur = (await pool.query(`SELECT ${col} AS k, series_id FROM collections WHERE id = $1`, [id])).rows[0];
      if (!cur) return reply.code(404).send({ error: 'Collection introuvable' });
      if (cur.series_id) return reply.code(409).send({ error: 'Les images de cette collection suivent sa série : changez-les dans la série' });
      await pool.query(`UPDATE collections SET ${col} = NULL, updated_at = now() WHERE id = $1`, [id]);
      if (cur.k?.startsWith('collections/')) await deleteObject(cur.k).catch(() => {});
      return reply.code(204).send();
    });
  }
}
