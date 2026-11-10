// Projet « Menus » — menus nommés, créés dans Admin → Menus et affectés à des emplacements (site, application).
//   GET    /menus/resolved           public : menus affectés, adresses résolues (conférence → /conferences/…, série, collection, chaîne, page)
//   GET    /admin/menus              administrateur : menus, affectations, emplacements et choix possibles
//   POST   /admin/menus              créer un menu { name, from? } (from : « current:web_top »… = repartir du menu actuel du site, ou « copy:<id> »)
//   PATCH  /admin/menus/:id          renommer et/ou remplacer les éléments { name?, items? }
//   DELETE /admin/menus/:id          supprimer (les emplacements concernés reprennent le menu d'origine)
//   PUT    /admin/menus/locations    affecter { web_top: <id>|null, … } (un menu doit convenir à l'emplacement)
//   GET    /admin/menus/lookup       chercher un contenu à relier : ?kind=talk|series|collection|channel|page&q=…
// Réservé aux administrateurs. L'affichage selon le public (visiteur, membre, équipe) est une commodité d'affichage, pas une protection.
import { z } from 'zod';
import { pool } from '../db.js';
import { LOCATIONS, LOCATION_KEYS, KINDS, APP_SCREENS, cleanMenuGeneric, fitsLocation, MAX_NAME } from '../menus.js';
import { MENUS } from '../navcfg.js';

const idSchema = z.object({ id: z.string().uuid() });
const nameSchema = z.string().trim().min(1).max(MAX_NAME);
const pad = (s) => String(s || '');
let seq = 0;
const nid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');

// Menu d'origine du site → éléments d'un menu : sert de point de départ « comme aujourd'hui ».
// Les éléments « masqués par défaut » restent masqués (comme sur le site).
const fromDefaults = (builtin) => builtin.map(([key, , hid]) => ({ id: nid('i'), kind: 'builtin', ref: key, ...(hid ? { hidden: true } : {}) }));
export async function templateItems(loc) {
  if (loc === 'web_top') return fromDefaults(MENUS.main.builtin);
  if (loc === 'web_bar') return fromDefaults(MENUS.bar.builtin);
  if (loc === 'web_footer') return fromDefaults(MENUS.footer.builtin);
  if (loc === 'web_side') {
    const out = [];
    for (const [g, title] of MENUS.side.groups) {
      out.push({ id: nid('h'), kind: 'heading', label: { fr: title } });
      out.push(...fromDefaults(MENUS.side.builtin[g]));
    }
    // Le menu d'origine remplit « Catégories » tout seul ; dans un menu personnalisé ce sont des liens ordinaires, modifiables.
    try {
      const cats = (await pool.query('SELECT id, name FROM categories ORDER BY name')).rows;
      const room = LOCATIONS.web_side.max - out.length - 1;
      if (cats.length && room > 0) {
        out.push({ id: nid('h'), kind: 'heading', label: { fr: 'Catégories' } });
        cats.slice(0, room).forEach((c) => out.push({ id: nid('c'), kind: 'url', ref: `/catalogue?cat=${c.id}`, label: { fr: String(c.name).replace(/[<>\u0000-\u001F]/g, '').slice(0, 60) || 'Catégorie' } }));
      }
    } catch { /* pas de catégories */ }
    return out;
  }
  return [];
}

// Adresses résolues : seuls les contenus existants et publiés restent (un lien vers un contenu supprimé disparaît du menu sans erreur).
async function resolveTree(items) {
  const refs = { talk: new Set(), series: new Set(), collection: new Set(), channel: new Set(), page: new Set() };
  const walk = (list, f) => list.forEach((it) => { f(it); if (it.children) walk(it.children, f); });
  walk(items, (it) => { if (refs[it.kind]) refs[it.kind].add(it.ref); });
  const found = { talk: new Map(), series: new Map(), collection: new Map(), channel: new Map(), page: new Map() };
  const safe = async (fn) => { try { await fn(); } catch { /* module absent : ses liens disparaissent */ } };
  const { visibleSql } = await import('../visibility.js');
  if (refs.talk.size) await safe(async () => (await pool.query(`SELECT t.id, t.slug, t.title FROM talks t WHERE t.id = ANY($1::uuid[]) AND ${visibleSql('t')}`, [[...refs.talk]])).rows.forEach((r) => found.talk.set(r.id, { href: `/conferences/${r.slug || ''}`.replace(/\/$/, ''), title: r.title, ok: Boolean(r.slug) })));
  if (refs.series.size) await safe(async () => (await pool.query('SELECT id, title FROM series WHERE id = ANY($1::uuid[]) AND published', [[...refs.series]])).rows.forEach((r) => found.series.set(r.id, { href: `/series/${r.id}`, title: r.title, ok: true })));
  if (refs.collection.size) await safe(async () => (await pool.query('SELECT id, title FROM collections WHERE id = ANY($1::uuid[]) AND published', [[...refs.collection]])).rows.forEach((r) => found.collection.set(r.id, { href: `/collections/${r.id}`, title: r.title, ok: true })));
  if (refs.channel.size) await safe(async () => (await pool.query('SELECT slug FROM speakers WHERE slug = ANY($1::text[])', [[...refs.channel]])).rows.forEach((r) => found.channel.set(r.slug, { href: `/chaines/${r.slug}`, title: r.slug, ok: true })));
  if (refs.page.size) await safe(async () => (await pool.query("SELECT path, title FROM site_pages WHERE kind = 'custom' AND live AND path = ANY($1::text[])", [[...refs.page]])).rows.forEach((r) => found.page.set(r.path, { href: r.path, title: r.title, ok: true })));
  const conv = (it) => {
    if (it.hidden) return null;
    const o = { id: it.id, kind: it.kind };
    for (const k of ['icon', 'audience', 'devices', 'newTab']) if (it[k]) o[k] = it[k];
    if (it.label) o.label = it.label;
    if (it.kind === 'builtin') o.key = it.ref;
    else if (it.kind === 'url') o.href = it.ref;
    else if (it.kind === 'appscreen') { o.screen = it.ref; if (!o.label) o.label = { fr: APP_SCREENS.find(([k]) => k === it.ref)?.[1] || it.ref }; }
    else if (it.kind !== 'heading') {
      const f = found[it.kind].get(it.ref);
      if (!f || !f.ok) return null;
      o.href = f.href;
      o.ref = it.ref; // l'application ouvre ses propres écrans (identifiant de la conférence, de la série…)
      if (!o.label) o.label = { fr: f.title };
    }
    if (it.children) { const ch = it.children.map(conv).filter(Boolean); if (ch.length) o.children = ch; }
    return o;
  };
  return items.map(conv).filter(Boolean);
}

export default async function menusRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  // ---------- Public ----------
  app.get('/menus/resolved', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=10');
    const rows = (await pool.query('SELECT l.location, m.items FROM menu_locations l JOIN menus m ON m.id = l.menu_id')).rows;
    const locations = {};
    for (const r of rows) locations[r.location] = await resolveTree(r.items || []);
    return { locations };
  });

  // ---------- Administration ----------
  async function overview() {
    const menus = (await pool.query('SELECT id, name, items, updated_at FROM menus ORDER BY lower(name)')).rows.map((m) => ({ id: m.id, name: m.name, items: m.items, updatedAt: m.updated_at }));
    const locations = Object.fromEntries(LOCATION_KEYS.map((k) => [k, null]));
    (await pool.query('SELECT location, menu_id FROM menu_locations')).rows.forEach((r) => { locations[r.location] = r.menu_id; });
    return { menus, locations };
  }
  app.get('/admin/menus', adminOnly, async () => ({
    ...(await overview()),
    spec: {
      locations: Object.fromEntries(LOCATION_KEYS.map((k) => [k, { label: LOCATIONS[k].label, hint: LOCATIONS[k].hint, children: LOCATIONS[k].children, max: LOCATIONS[k].max, builtin: LOCATIONS[k].builtin, noHeading: Boolean(LOCATIONS[k].noHeading), required: LOCATIONS[k].required || [] }])),
      kinds: KINDS, appScreens: APP_SCREENS,
    },
  }));

  const createSchema = z.object({ name: nameSchema, from: z.string().max(60).optional() });
  app.post('/admin/menus', adminOnly, async (req, reply) => {
    const b = createSchema.parse(req.body);
    let items = [];
    if (b.from?.startsWith('current:')) {
      const loc = b.from.slice(8);
      if (!LOCATIONS[loc]) return reply.code(400).send({ error: 'Emplacement inconnu' });
      items = await templateItems(loc);
    } else if (b.from?.startsWith('copy:')) {
      const id = b.from.slice(5);
      if (!idSchema.safeParse({ id }).success) return reply.code(400).send({ error: 'Menu à copier invalide' });
      const src = (await pool.query('SELECT items FROM menus WHERE id = $1', [id])).rows[0];
      if (!src) return reply.code(404).send({ error: 'Menu à copier introuvable' });
      // Copie : de nouveaux identifiants d'éléments, au cas où les deux menus seraient comparés ou fusionnés plus tard.
      const re = (list) => list.map((it) => ({ ...it, id: nid('i'), ...(it.children ? { children: re(it.children) } : {}) }));
      items = re(src.items);
    }
    const c = cleanMenuGeneric(items);
    if (c.error) return reply.code(400).send({ error: `Le point de départ n’est pas valide : ${c.error}` });
    try {
      const r = (await pool.query('INSERT INTO menus (name, items, created_by) VALUES ($1, $2, $3) RETURNING id', [b.name, JSON.stringify(c.items), req.user.sub])).rows[0];
      req.auditSummary = `Menu créé : « ${b.name} »`;
      return reply.code(201).send({ id: r.id });
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Un menu porte déjà ce nom' });
      throw e;
    }
  });

  const patchSchema = z.object({ name: nameSchema.optional(), items: z.array(z.any()).max(60).optional() }).refine((b) => Object.keys(b).length > 0, 'Aucun changement');
  app.patch('/admin/menus/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body);
    const cur = (await pool.query('SELECT name FROM menus WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Menu introuvable' });
    let items;
    if (b.items) {
      const c = cleanMenuGeneric(b.items);
      if (c.error) return reply.code(400).send({ error: c.error });
      items = c.items;
      // Un menu déjà affecté doit continuer à convenir à son emplacement (pas de sous-menu dans la barre du bas, liens légaux du pied de page…).
      const where = (await pool.query('SELECT location FROM menu_locations WHERE menu_id = $1', [id])).rows;
      for (const w of where) {
        const msg = fitsLocation(items, w.location);
        if (msg) return reply.code(400).send({ error: `Ce menu est affecté à « ${LOCATIONS[w.location].label} » : ${msg}` });
      }
      // Les contenus du catalogue et les pages liés doivent exister (un lien vers un contenu inconnu est refusé à l'enregistrement).
      const missing = await missingRefs(items);
      if (missing) return reply.code(400).send({ error: missing });
    }
    try {
      await pool.query('UPDATE menus SET name = COALESCE($2, name), items = COALESCE($3::jsonb, items), updated_at = now() WHERE id = $1', [id, b.name ?? null, items ? JSON.stringify(items) : null]);
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Un menu porte déjà ce nom' });
      throw e;
    }
    req.auditSummary = `Menu modifié : « ${b.name || cur.name} »`;
    return { ok: true };
  });

  app.delete('/admin/menus/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM menus WHERE id = $1 RETURNING name', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Menu introuvable' });
    req.auditSummary = `Menu supprimé : « ${r.rows[0].name} »`;
    return { ok: true };
  });

  // Affectation : { web_top: <id>|null, … } ; seuls les emplacements cités changent.
  const locSchema = z.record(z.string().uuid().nullable());
  app.put('/admin/menus/locations', adminOnly, async (req, reply) => {
    const b = locSchema.parse(req.body);
    const entries = Object.entries(b);
    if (!entries.length) return reply.code(400).send({ error: 'Aucun emplacement' });
    for (const [loc, id] of entries) {
      if (!LOCATIONS[loc]) return reply.code(400).send({ error: 'Emplacement inconnu' });
      if (id) {
        const m = (await pool.query('SELECT name, items FROM menus WHERE id = $1', [id])).rows[0];
        if (!m) return reply.code(404).send({ error: 'Menu introuvable' });
        const msg = fitsLocation(m.items, loc);
        if (msg) return reply.code(400).send({ error: `« ${m.name} » ne convient pas à « ${LOCATIONS[loc].label} » : ${msg}` });
      }
    }
    for (const [loc, id] of entries) {
      await pool.query('INSERT INTO menu_locations (location, menu_id) VALUES ($1, $2) ON CONFLICT (location) DO UPDATE SET menu_id = $2, updated_at = now()', [loc, id]);
    }
    req.auditSummary = `Menus affectés : ${entries.map(([l, i]) => `${LOCATIONS[l].label} ${i ? '→ menu' : '→ menu d’origine'}`).join(' ; ')}`;
    return { ok: true };
  });

  async function missingRefs(items) {
    const refs = { talk: new Set(), series: new Set(), collection: new Set(), channel: new Set(), page: new Set() };
    const walk = (list) => list.forEach((it) => { if (refs[it.kind]) refs[it.kind].add(it.ref); if (it.children) walk(it.children); });
    walk(items);
    const q = {
      talk: ['SELECT id::text AS k FROM talks WHERE id = ANY($1::uuid[])', 'Une conférence liée n’existe plus'],
      series: ['SELECT id::text AS k FROM series WHERE id = ANY($1::uuid[])', 'Une série liée n’existe plus'],
      collection: ['SELECT id::text AS k FROM collections WHERE id = ANY($1::uuid[])', 'Une collection liée n’existe plus'],
      channel: ['SELECT slug AS k FROM speakers WHERE slug = ANY($1::text[])', 'Une chaîne liée n’existe plus'],
      page: ["SELECT path AS k FROM site_pages WHERE kind = 'custom' AND path = ANY($1::text[])", 'Une page liée n’existe plus'],
    };
    for (const [kind, set] of Object.entries(refs)) {
      if (!set.size) continue;
      let have;
      try { have = new Set((await pool.query(q[kind][0], [[...set]])).rows.map((r) => r.k)); } catch { return `Les liens de type « ${kind} » ne sont pas disponibles sur ce site`; }
      for (const r of set) if (!have.has(r)) return q[kind][1];
    }
    return null;
  }

  app.get('/admin/menus/lookup', adminOnly, async (req) => {
    const q = z.object({ kind: z.enum(['talk', 'series', 'collection', 'channel', 'page']), q: z.string().trim().max(80).default('') }).parse(req.query);
    const like = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
    const run = async (sql, args) => { try { return (await pool.query(sql, args)).rows; } catch { return []; } };
    let rows = [];
    if (q.kind === 'talk') rows = await run('SELECT id::text AS ref, title AS label, speaker AS sub FROM talks WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT 15', [like]);
    if (q.kind === 'series') rows = await run('SELECT id::text AS ref, title AS label, \'\' AS sub FROM series WHERE title ILIKE $1 ORDER BY title LIMIT 15', [like]);
    if (q.kind === 'collection') rows = await run('SELECT id::text AS ref, title AS label, \'\' AS sub FROM collections WHERE title ILIKE $1 ORDER BY title LIMIT 15', [like]);
    if (q.kind === 'channel') rows = await run('SELECT slug AS ref, slug AS label, \'\' AS sub FROM speakers WHERE slug ILIKE $1 ORDER BY slug LIMIT 15', [like]);
    if (q.kind === 'page') rows = await run("SELECT path AS ref, title AS label, path AS sub FROM site_pages WHERE kind = 'custom' AND (title ILIKE $1 OR path ILIKE $1) ORDER BY title LIMIT 15", [like]);
    return { results: rows.map((r) => ({ ref: r.ref, label: pad(r.label), sub: pad(r.sub) })) };
  });
}
