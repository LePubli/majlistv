// Étape I3 — Pages en blocs (Admin → Pages).
//
// Deux sortes de pages :
//   custom : page créée dans l'administration, adresse /p/<nom> (zone « main »).
//   slot   : blocs ajoutés avant / après une page EXISTANTE du site (adresse exacte, ex. /pricing).
//   layout : « En-tête, menus et pied de page » : barre d'annonce et blocs au-dessus du pied de page (zones topbar / footerTop) + réglages de navigation (content.nav). Une seule (/_layout).
//   home   : l'accueil des membres entièrement composé en blocs (adresse interne /_home, zone « main »). Une seule. Non publiée : l'accueil d'origine reste.
// Chaque page a une version publiée et un brouillon (comme les thèmes de l'étape I1).
//
// Public :
//   GET /pages/slots                    blocs « avant / après » des pages existantes (tout public seulement) — lu par le site à chaque page
//   GET /pages/view?path=…[&ssr=1]      blocs d'une page pour le visiteur qui demande (selon sa connexion et son abonnement)
//   GET /pages/public-list              pages personnalisées en ligne (plan du site)
//   GET /pages/media/:id                image envoyée
// Administrateur :
//   GET/POST /admin/pages · GET/PATCH/DELETE /admin/pages/:id
//   PUT/DELETE /admin/pages/:id/draft · POST /admin/pages/:id/publish · PUT /admin/pages/:id/live
//   GET /admin/pages/:id/versions · POST /admin/pages/:id/versions/:vid/restore
//   GET/POST /admin/page-media · DELETE /admin/page-media/:id
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { putObject, deleteObject, getObjectBuffer } from '../storage.js';
import { hasActiveSubscription } from '../access.js';
import { ZONES, HOME_PATH, LAYOUT_PATH, cleanContent, audienceMatches, homeTemplate } from '../blocks.js';
import { cleanNav } from '../navcfg.js';

const KEEP_VERSIONS = 20;
const MEDIA_MAX = 3 * 1024 * 1024; // 3 Mo par image
const MEDIA_TYPES = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
// Adresses où l'on ne peut PAS ajouter de blocs (administration, studio, espace enfant, technique).
const FORBIDDEN_SLOT = /^\/(admin|studio|kids|api|_next|_home|_layout|pb-preview|p)(\/|$)/;

// Reconnaît le format d'une image à ses premiers octets (on ne se fie jamais à l'extension).
export function imageFormat(buf) {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const emptyContent = (kind) => ({ meta: {}, zones: Object.fromEntries(ZONES[kind].map((z) => [z, []])) });
// Contenu normalisé (toutes les zones présentes, même vides).
const norm = (kind, c) => {
  const base = emptyContent(kind);
  if (!c || typeof c !== 'object') return base;
  return { meta: c.meta || {}, zones: { ...base.zones, ...(c.zones || {}) }, ...(kind === 'layout' && c.nav ? { nav: c.nav } : {}) };
};
// Blocs (cleanContent) + réglages de navigation (cleanNav) pour une page « layout » → { value, errors }.
const validate = (kind, content, strict) => {
  const r = cleanContent(content, kind, strict);
  if (kind === 'layout' && content && typeof content === 'object') {
    const n = cleanNav(content.nav, strict);
    if (n.value) r.value.nav = n.value;
    Object.assign(r.errors, n.errors);
  }
  return r;
};
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Les emplacements sont gardés en mémoire ; toute modification passe par l'API (qui vide ce cache), et par sécurité il expire seul après 30 s.
let slotCache = null;
let slotCacheAt = 0;
export const resetPagesCache = () => { slotCache = null; };

const hasTargeted = (zones) => Object.values(zones || {}).some((list) => (list || []).some((b) => (b.show?.audience || 'all') !== 'all'));
const onlyPublic = (zones) => Object.fromEntries(Object.entries(zones || {}).map(([z, list]) => [z, (list || []).filter((b) => (b.show?.audience || 'all') === 'all')]));
const forUser = (zones, user) => Object.fromEntries(Object.entries(zones || {}).map(([z, list]) => [z, (list || []).filter((b) => audienceMatches(b.show?.audience || 'all', user))]));

// Blocs « avant / après » des pages existantes, pour tout le monde (les blocs réservés à un public sont chargés ensuite par le navigateur).
export async function pageSlots() {
  if (slotCache && Date.now() - slotCacheAt < 30_000) return slotCache;
  const rows = (await pool.query("SELECT path, published FROM site_pages WHERE kind = 'slot' AND live")).rows;
  const slots = {};
  for (const r of rows) {
    const z = norm('slot', r.published).zones;
    slots[r.path] = { before: onlyPublic(z).before, after: onlyPublic(z).after, targeted: hasTargeted(z) };
  }
  slotCache = { version: crypto.createHash('sha1').update(JSON.stringify(slots)).digest('hex').slice(0, 12), slots };
  slotCacheAt = Date.now();
  return slotCache;
}

const idParam = z.object({ id: z.coerce.number().int().positive() });
const row = (r) => ({
  id: r.id, kind: r.kind, path: r.path, title: r.title, live: r.live, hasDraft: r.draft !== null,
  publishedAt: r.published_at, updatedAt: r.updated_at,
});
const full = (r) => ({ ...row(r), published: norm(r.kind, r.published), draft: r.draft === null ? null : norm(r.kind, r.draft), content: norm(r.kind, r.draft ?? r.published) });

export default async function pagesRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };

  // ------------------------------------------------------------------ Public
  app.get('/pages/slots', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=10');
    return pageSlots();
  });

  app.get('/pages/view', async (req, reply) => {
    const q = z.object({ path: z.string().regex(/^\/[a-z0-9_/-]{0,98}$/), ssr: z.string().optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'Adresse invalide' });
    const r = (await pool.query('SELECT kind, path, title, published FROM site_pages WHERE path = $1 AND live', [q.data.path])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Page introuvable' });
    const content = norm(r.kind, r.published);
    reply.header('cache-control', 'private, no-store');
    if (q.data.ssr) return { kind: r.kind, path: r.path, title: r.title, meta: content.meta, zones: onlyPublic(content.zones), targeted: hasTargeted(content.zones), ...(content.nav ? { nav: content.nav } : {}) };
    // Public réel : visiteur, membre, abonné (un administrateur voit tout ce que voit un abonné).
    let user = null;
    const u = await app.optionalUser(req);
    if (u) user = { subscriber: u.role === 'admin' || (await hasActiveSubscription(u.sub)) };
    return { kind: r.kind, path: r.path, title: r.title, meta: content.meta, zones: forUser(content.zones, user), targeted: hasTargeted(content.zones), ...(content.nav ? { nav: content.nav } : {}) };
  });

  // Pages personnalisées en ligne (pour le plan du site /sitemap.xml).
  app.get('/pages/public-list', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return (await pool.query("SELECT path, updated_at FROM site_pages WHERE kind = 'custom' AND live ORDER BY path")).rows.map((r) => ({ path: r.path, updatedAt: r.updated_at }));
  });

  app.get('/pages/media/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const m = (await pool.query('SELECT storage_key, content_type FROM site_page_media WHERE id = $1', [id])).rows[0];
    if (!m) return reply.code(404).send({ error: 'Image introuvable' });
    const buf = await getObjectBuffer(m.storage_key);
    reply.header('cache-control', 'public, max-age=31536000, immutable'); // le fichier ne change jamais : un nouvel envoi = un nouvel identifiant
    reply.header('x-content-type-options', 'nosniff');
    return reply.type(m.content_type).send(buf);
  });

  // ------------------------------------------------------------------ Administration : pages
  app.get('/admin/pages', admin, async () => (await pool.query(
    'SELECT id, kind, path, title, live, draft, published_at, updated_at FROM site_pages ORDER BY kind, path')).rows.map(row));

  app.post('/admin/pages', admin, async (req, reply) => {
    const body = z.object({
      kind: z.enum(['custom', 'slot', 'home', 'layout']),
      title: z.string().trim().min(1).max(120).optional(),
      slug: z.string().trim().max(60).optional(),
      path: z.string().trim().max(100).optional(),
    }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Requête invalide' });
    const b = body.data;
    let path, title;
    if (b.kind === 'custom') {
      if (!b.title) return reply.code(400).send({ error: 'Donnez un titre à la page' });
      const slug = b.slug ? b.slug : slugify(b.title);
      if (!SLUG.test(slug)) return reply.code(400).send({ error: 'Adresse invalide : lettres minuscules, chiffres et tirets (ex. ramadan-2027)' });
      path = `/p/${slug}`; title = b.title;
    } else if (b.kind === 'home') {
      path = HOME_PATH; title = 'Accueil des membres';
    } else if (b.kind === 'layout') {
      path = LAYOUT_PATH; title = 'En-tête, menus et pied de page';
    } else {
      path = (b.path || '').replace(/\/+$/, '') || '/';
      if (!/^\/[a-z0-9_/-]{0,98}$/.test(path) || path.includes('//')) return reply.code(400).send({ error: 'Adresse invalide (ex. /pricing)' });
      if (FORBIDDEN_SLOT.test(path)) return reply.code(400).send({ error: 'On ne peut pas ajouter de blocs sur l’administration, le Studio ni l’espace Kids' });
      title = b.title || (path === '/' ? 'Accueil' : path);
    }
    if ((await pool.query('SELECT 1 FROM site_pages WHERE path = $1', [path])).rowCount) return reply.code(409).send({ error: b.kind === 'custom' ? 'Une page porte déjà cette adresse' : b.kind === 'home' ? 'L’accueil des membres existe déjà : modifiez-le dans la liste' : b.kind === 'layout' ? 'Les réglages de l’en-tête et du pied de page existent déjà : modifiez-les dans la liste' : 'Cette page a déjà des blocs : modifiez-la dans la liste' });
    const r = (await pool.query(
      'INSERT INTO site_pages (kind, path, title, draft, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [b.kind, path, title, b.kind === 'home' ? homeTemplate() : emptyContent(b.kind), req.user.sub])).rows[0];
    req.auditSummary = `Page « ${title} » (${path}) créée`;
    return reply.code(201).send(full(r));
  });

  app.get('/admin/pages/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('SELECT * FROM site_pages WHERE id = $1', [id])).rows[0];
    return r ? full(r) : reply.code(404).send({ error: 'Page introuvable' });
  });

  app.patch('/admin/pages/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ title: z.string().trim().min(1).max(120).optional(), slug: z.string().trim().max(60).optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Requête invalide' });
    const cur = (await pool.query('SELECT * FROM site_pages WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Page introuvable' });
    let path = cur.path;
    if (body.data.slug !== undefined) {
      if (cur.kind !== 'custom') return reply.code(400).send({ error: 'L’adresse d’une page existante ne se change pas' });
      if (!SLUG.test(body.data.slug)) return reply.code(400).send({ error: 'Adresse invalide : lettres minuscules, chiffres et tirets' });
      path = `/p/${body.data.slug}`;
      if (path !== cur.path && (await pool.query('SELECT 1 FROM site_pages WHERE path = $1', [path])).rowCount) return reply.code(409).send({ error: 'Une page porte déjà cette adresse' });
    }
    const r = (await pool.query('UPDATE site_pages SET title = $2, path = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING *',
      [id, body.data.title ?? cur.title, path, req.user.sub])).rows[0];
    resetPagesCache();
    req.auditSummary = `Page « ${r.title} » : ${path !== cur.path ? `adresse ${cur.path} → ${path}` : 'titre modifié'}`;
    return full(r);
  });

  app.delete('/admin/pages/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('DELETE FROM site_pages WHERE id = $1 RETURNING title, path', [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Page introuvable' });
    resetPagesCache();
    req.auditSummary = `Page « ${r.title} » (${r.path}) supprimée`;
    return reply.code(204).send();
  });

  // ---- Brouillon, publication, mise hors ligne, historique
  app.put('/admin/pages/:id/draft', { ...admin, bodyLimit: 600 * 1024 }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const cur = (await pool.query('SELECT kind FROM site_pages WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Page introuvable' });
    const { value, errors } = validate(cur.kind, req.body?.content, false);
    if (Object.keys(errors).length) return reply.code(400).send({ error: 'Certains réglages sont refusés', errors });
    const r = (await pool.query('UPDATE site_pages SET draft = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, value, req.user.sub])).rows[0];
    return full(r);
  });

  app.delete('/admin/pages/:id/draft', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('UPDATE site_pages SET draft = NULL, updated_at = now(), updated_by = $2 WHERE id = $1 RETURNING *', [id, req.user.sub])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Page introuvable' });
    req.auditSummary = `Brouillon de la page « ${r.title} » abandonné`;
    return full(r);
  });

  app.post('/admin/pages/:id/publish', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = (await client.query('SELECT * FROM site_pages WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Page introuvable' }); }
      if (cur.draft === null) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Rien à publier : aucun brouillon' }); }
      const { value, errors } = validate(cur.kind, cur.draft, true);
      if (Object.keys(errors).length) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Certains blocs sont incomplets', errors }); }
      const r = (await client.query(
        'UPDATE site_pages SET published = $2, draft = NULL, live = true, published_at = now(), updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, value, req.user.sub])).rows[0];
      await client.query('INSERT INTO site_page_versions (page_id, content, created_by) VALUES ($1, $2, $3)', [id, value, req.user.sub]);
      await client.query('DELETE FROM site_page_versions WHERE page_id = $1 AND id NOT IN (SELECT id FROM site_page_versions WHERE page_id = $1 ORDER BY id DESC LIMIT $2)', [id, KEEP_VERSIONS]);
      await client.query('COMMIT');
      resetPagesCache();
      const n = Object.values(value.zones).reduce((a, l) => a + l.length, 0);
      req.auditSummary = `Page « ${r.title} » (${r.path}) publiée (${n} bloc(s))`;
      return full(r);
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  });

  app.put('/admin/pages/:id/live', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ live: z.boolean() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Requête invalide' });
    const cur = (await pool.query('SELECT published_at FROM site_pages WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Page introuvable' });
    if (body.data.live && !cur.published_at) return reply.code(409).send({ error: 'Cette page n’a jamais été publiée' });
    const r = (await pool.query('UPDATE site_pages SET live = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, body.data.live, req.user.sub])).rows[0];
    resetPagesCache();
    req.auditSummary = `Page « ${r.title} » (${r.path}) ${r.live ? 'remise en ligne' : 'mise hors ligne'}`;
    return full(r);
  });

  app.get('/admin/pages/:id/versions', admin, async (req) => {
    const { id } = idParam.parse(req.params);
    return (await pool.query(
      `SELECT v.id, v.created_at, u.name AS by, v.content FROM site_page_versions v LEFT JOIN users u ON u.id = v.created_by
        WHERE v.page_id = $1 ORDER BY v.id DESC`, [id])).rows.map((v) => ({
      id: v.id, createdAt: v.created_at, by: v.by, blocks: Object.values(v.content?.zones || {}).reduce((a, l) => a + l.length, 0),
    }));
  });

  app.post('/admin/pages/:id/versions/:vid/restore', admin, async (req, reply) => {
    const p = z.object({ id: z.coerce.number().int().positive(), vid: z.coerce.number().int().positive() }).parse(req.params);
    const v = (await pool.query('SELECT content FROM site_page_versions WHERE id = $1 AND page_id = $2', [p.vid, p.id])).rows[0];
    if (!v) return reply.code(404).send({ error: 'Version introuvable' });
    const r = (await pool.query('UPDATE site_pages SET draft = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [p.id, v.content, req.user.sub])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Page introuvable' });
    req.auditSummary = `Ancienne version ${p.vid} de « ${r.title} » recopiée dans le brouillon`;
    return full(r);
  });

  // ------------------------------------------------------------------ Administration : images
  app.get('/admin/page-media', admin, async () => (await pool.query(
    'SELECT id, name, content_type, size_bytes, created_at FROM site_page_media ORDER BY created_at DESC')).rows.map((m) => ({
    id: m.id, name: m.name, contentType: m.content_type, size: m.size_bytes, createdAt: m.created_at, url: `/api/pages/media/${m.id}`,
  })));

  app.post('/admin/page-media', { ...admin, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(120).default('image'), file: z.string().max(4_500_000) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Requête invalide' });
    const m = body.data.file.match(/^data:[\w/.+-]*;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Fichier attendu (PNG, JPEG, WebP ou GIF)' });
    const buf = Buffer.from(m[1], 'base64');
    const format = imageFormat(buf);
    if (!format) return reply.code(400).send({ error: 'Ce fichier n’est pas une image PNG, JPEG, WebP ou GIF' });
    if (buf.length > MEDIA_MAX) return reply.code(400).send({ error: 'Image trop lourde (3 Mo maximum)' });
    const id = crypto.randomUUID();
    const key = `site/pages/${id}.${format === 'jpeg' ? 'jpg' : format}`;
    await putObject(key, buf, MEDIA_TYPES[format]);
    await pool.query('INSERT INTO site_page_media (id, name, content_type, storage_key, size_bytes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, body.data.name, MEDIA_TYPES[format], key, buf.length, req.user.sub]);
    req.auditSummary = `Image « ${body.data.name} » envoyée`;
    return reply.code(201).send({ id, name: body.data.name, contentType: MEDIA_TYPES[format], size: buf.length, url: `/api/pages/media/${id}` });
  });

  app.delete('/admin/page-media/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const m = (await pool.query('SELECT name, storage_key FROM site_page_media WHERE id = $1', [id])).rows[0];
    if (!m) return reply.code(404).send({ error: 'Image introuvable' });
    // Encore utilisée dans une page (publiée ou brouillon, ou historique récent) ? On ne supprime pas.
    const used = (await pool.query(
      `SELECT title FROM site_pages WHERE position($1 in published::text) > 0 OR position($1 in COALESCE(draft::text, '')) > 0`, [id])).rows;
    if (used.length) return reply.code(409).send({ error: `Image utilisée par : ${used.map((x) => x.title).join(', ')}. Retirez-la de ces pages avant de la supprimer.` });
    await pool.query('DELETE FROM site_page_media WHERE id = $1', [id]);
    await deleteObject(m.storage_key).catch(() => {});
    req.auditSummary = `Image « ${m.name} » supprimée`;
    return reply.code(204).send();
  });
}
