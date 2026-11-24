// Lot T — Thèmes uploadables « Mejliss » (Admin → Apparence → Thèmes Mejliss).
//
// Public :
//   GET  /theme-pack/:slug/*                 image ou police d'un thème installé
// Administrateur :
//   GET  /admin/theme-packs                  thèmes installés
//   POST /admin/theme-packs/inspect          { file: data-URL base64 } → contrôle d'un .zip SANS l'installer (erreurs, avertissements, résumé)
//   POST /admin/theme-packs                  { file } → installe (remplace une version précédente du même id)
//   POST /admin/theme-packs/:slug/activate   { applyPages } → active le thème (jetons, polices, CSS, thème de base ; pages en brouillon)
//   POST /admin/theme-packs/deactivate       revient à l'état d'avant l'activation
//   DELETE /admin/theme-packs/:slug          supprime un thème inactif
//   GET  /admin/theme-packs/example.zip      thème d'exemple complet (le kit)
//   GET  /admin/theme-packs/guide.md         guide pour IA, généré depuis le code (jamais périmé)
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { putObject, deleteObject, getObjectBuffer } from '../storage.js';
import { saveSettings, getSetting } from '../settings.js';
import { resetThemeCache } from './appearance.js';
import { resetPagesCache } from './pages.js';
import { parsePack, mapPackImages, packImageRefs, IMG_TYPES, FONT_TYPES } from '../themePack.js';
import { fontFormat } from '../fileSniff.js';
import { HOME_PATH, CATALOGUE_PATH, WATCH_PATH, LAYOUT_PATH, GLOBAL_PREFIX, FUNC_PAGES, funcPath } from '../blocks.js';
import { validate, emptyContent } from '../pageContent.js';
import { buildExampleZip, buildGuide } from '../themeKit.js';

const PACK_MAX = 30 * 1024 * 1024;
const row = (r) => ({
  slug: r.slug, name: r.name, version: r.version, author: r.author, description: r.description, base: r.base, active: r.active,
  installedAt: r.installed_at, activatedAt: r.activated_at, hasCss: Boolean(r.css), tokens: Object.keys(r.tokens || {}).length, fonts: (r.fonts || []).length,
  assets: Object.keys(r.files || {}).filter((n) => /\.(png|jpe?g|webp|gif)$/i.test(n)).length,
  pages: Object.keys(r.payload?.pages?.slots || {}).length + ['home', 'catalogue', 'watch', 'layout'].filter((k) => r.payload?.pages?.[k]).length + Object.keys(r.payload?.pages?.func || {}).length + (r.payload?.pages?.custom || []).length,
  globals: (r.payload?.globals || []).length, templates: (r.payload?.templates || []).length,
  preview: r.manifest?.preview ? `/api/theme-pack/${r.slug}/${r.manifest.preview}` : null,
});
const decode = (file) => {
  const m = String(file || '').match(/^data:[\w/.+-]*;base64,([A-Za-z0-9+/=]+)$/);
  return m ? Buffer.from(m[1], 'base64') : null;
};

export default async function themePackRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };
  const big = { ...admin, bodyLimit: 42 * 1024 * 1024 };

  // ---- Fichiers d'un thème installé
  app.get('/theme-pack/:slug/*', async (req, reply) => {
    const slug = z.string().regex(/^[a-z0-9-]{2,40}$/).parse(req.params.slug);
    const path = String(req.params['*'] || '');
    const t = (await pool.query('SELECT files FROM theme_packs WHERE slug = $1', [slug])).rows[0];
    const f = t?.files?.[path];
    if (!f) return reply.code(404).send({ error: 'Fichier introuvable' });
    const buf = await getObjectBuffer(f.key);
    reply.header('cache-control', 'public, max-age=300');
    reply.header('x-content-type-options', 'nosniff');
    return reply.type(f.type).send(buf);
  });

  app.get('/admin/theme-packs', admin, async () => (await pool.query('SELECT * FROM theme_packs ORDER BY active DESC, name')).rows.map(row));

  // ---- Contrôle sans installer
  app.post('/admin/theme-packs/inspect', big, async (req, reply) => {
    const body = z.object({ file: z.string().max(PACK_MAX * 1.4) }).safeParse(req.body ?? {});
    const buf = body.success ? decode(body.data.file) : null;
    if (!buf) return reply.code(400).send({ error: 'Fichier .zip attendu' });
    if (buf.length > PACK_MAX) return reply.code(400).send({ error: 'Thème trop lourd (30 Mo au maximum)' });
    const p = parsePack(buf);
    return { ok: p.ok, errors: p.errors, warnings: p.warnings, summary: p.summary || null };
  });

  // ---- Installation
  app.post('/admin/theme-packs', big, async (req, reply) => {
    const body = z.object({ file: z.string().max(PACK_MAX * 1.4) }).safeParse(req.body ?? {});
    const buf = body.success ? decode(body.data.file) : null;
    if (!buf) return reply.code(400).send({ error: 'Fichier .zip attendu' });
    if (buf.length > PACK_MAX) return reply.code(400).send({ error: 'Thème trop lourd (30 Mo au maximum)' });
    const p = parsePack(buf);
    if (!p.ok) return reply.code(400).send({ error: 'Ce thème n’est pas valide', errors: p.errors, warnings: p.warnings });
    const slug = p.manifest.id;
    const old = (await pool.query('SELECT files, active FROM theme_packs WHERE slug = $1', [slug])).rows[0];
    // Fichiers (images, polices) dans le stockage, sous un préfixe propre à cette installation.
    const stamp = crypto.randomUUID().slice(0, 8);
    const files = {};
    for (const [name, data] of p.files) {
      const x = name.split('.').pop().toLowerCase();
      const type = IMG_TYPES[{ png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' }[x]] || FONT_TYPES[{ woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[x]];
      if (!type) continue; // textes : déjà lus (CSS, pages)
      const key = `site/theme-packs/${slug}/${stamp}/${name}`;
      await putObject(key, data, type);
      files[name] = { key, type, size: data.length };
    }
    const payload = { pages: p.pages, globals: p.globals, templates: p.templates };
    const manifest = { ...p.manifest };
    await pool.query(
      `INSERT INTO theme_packs (slug, name, version, author, description, base, manifest, css, tokens, fonts, files, payload, installed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, version = EXCLUDED.version, author = EXCLUDED.author, description = EXCLUDED.description, base = EXCLUDED.base,
         manifest = EXCLUDED.manifest, css = EXCLUDED.css, tokens = EXCLUDED.tokens, fonts = EXCLUDED.fonts, files = EXCLUDED.files, payload = EXCLUDED.payload,
         installed_at = now(), installed_by = EXCLUDED.installed_by`,
      [slug, p.manifest.name.trim(), p.manifest.version, p.manifest.author || '', p.manifest.description || '', p.manifest.base, manifest, p.css, p.tokens, JSON.stringify(p.fonts), files, payload, req.user.sub]);
    for (const f of Object.values(old?.files || {})) deleteObject(f.key).catch(() => {});
    if (old?.active) resetThemeCache(); // mise à jour d'un thème actif : son CSS change tout de suite (les jetons et pages se réappliquent en réactivant)
    req.auditSummary = `Thème Mejliss « ${p.manifest.name} » ${p.manifest.version} installé`;
    const r = (await pool.query('SELECT * FROM theme_packs WHERE slug = $1', [slug])).rows[0];
    return reply.code(201).send({ ...row(r), warnings: p.warnings });
  });

  // ---- Activation
  app.post('/admin/theme-packs/:slug/activate', admin, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/) }).parse(req.params);
    const body = z.object({ applyPages: z.boolean().default(true) }).parse(req.body ?? {});
    const t = (await pool.query('SELECT * FROM theme_packs WHERE slug = $1', [slug])).rows[0];
    if (!t) return reply.code(404).send({ error: 'Thème introuvable' });
    const report = { applied: [], skipped: [] };
    const userId = req.user.sub;

    // 1. État d'avant (pour « revenir au thème précédent ») : on ne l'écrase pas si un autre thème Mejliss était déjà actif.
    const cur = (await pool.query('SELECT slug, previous FROM theme_packs WHERE active')).rows[0];
    const prevThemeId = (await pool.query('SELECT id FROM themes WHERE is_active LIMIT 1')).rows[0]?.id ?? null;
    const previous = cur?.previous ?? { skin: await getSetting('skin_default'), themeId: prevThemeId };

    // 2. Polices du thème
    for (const f of t.fonts) {
      const have = (await pool.query('SELECT 1 FROM theme_fonts WHERE family = $1 AND weight = $2 AND style = $3', [f.family, f.weight, f.style])).rowCount;
      if (have) { report.skipped.push(`Police « ${f.family} ${f.weight} » déjà présente`); continue; }
      const file = t.files[f.file];
      const buf = file ? await getObjectBuffer(file.key) : null;
      const format = buf ? fontFormat(buf) : null;
      if (!format) { report.skipped.push(`Police « ${f.family} » illisible`); continue; }
      const id = crypto.randomUUID();
      const key = `site/fonts/${id}.${{ woff2: 'woff2', woff: 'woff', truetype: 'ttf', opentype: 'otf' }[format]}`;
      await putObject(key, buf, FONT_TYPES[format]);
      await pool.query('INSERT INTO theme_fonts (id, family, weight, style, format, storage_key, size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, f.family, f.weight, f.style, format, key, buf.length]);
      report.applied.push(`Police « ${f.family} ${f.weight} » ajoutée`);
    }

    // 3. Jetons : un thème « Mejliss — nom » (remplacé à chaque activation), rendu actif
    const tname = `Mejliss — ${t.name}`.slice(0, 60);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let tid = (await client.query('SELECT id FROM themes WHERE name = $1', [tname])).rows[0]?.id;
      if (tid) await client.query('UPDATE themes SET published = $2, draft = NULL, published_at = now(), updated_by = $3 WHERE id = $1', [tid, t.tokens, userId]);
      else tid = (await client.query('INSERT INTO themes (name, published, published_at, updated_by) VALUES ($1, $2, now(), $3) RETURNING id', [tname, t.tokens, userId])).rows[0].id;
      await client.query('UPDATE themes SET is_active = false WHERE is_active AND id <> $1', [tid]);
      await client.query('UPDATE themes SET is_active = true, updated_at = now() WHERE id = $1', [tid]);
      await client.query('UPDATE theme_packs SET active = false WHERE active AND slug <> $1', [slug]);
      await client.query('UPDATE theme_packs SET active = true, activated_at = now(), previous = $2 WHERE slug = $1', [slug, { ...previous, packThemeId: tid }]);
      await client.query('COMMIT');
      report.applied.push(`Jetons de couleurs, polices et arrondis appliqués (${Object.keys(t.tokens).length})`);
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }

    // 4. Thème de base (skin) et CSS du thème
    await saveSettings({ skin_default: t.base }, userId);
    resetThemeCache();
    report.applied.push(`Thème de base « ${t.base} »${t.css ? ' + feuille de style du thème' : ''}`);

    // 5. Pages, sections globales et modèles : toujours en BROUILLON ou en simple réserve, jamais publiés d'office
    if (body.applyPages) await applyPayload(t, userId, report);
    resetPagesCache();
    req.auditSummary = `Thème Mejliss « ${t.name} » activé`;
    return { ok: true, report };
  });

  async function uploadPackImage(t, path, cache, userId) {
    if (cache.has(path)) return cache.get(path);
    const f = t.files[path];
    if (!f) return null;
    const buf = await getObjectBuffer(f.key);
    const id = crypto.randomUUID();
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[f.type];
    const key = `site/pages/${id}.${ext}`;
    await putObject(key, buf, f.type);
    await pool.query('INSERT INTO site_page_media (id, name, content_type, storage_key, size_bytes, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [id, `${t.name} — ${path.split('/').pop()}`.slice(0, 120), f.type, key, buf.length, userId]);
    cache.set(path, id);
    return id;
  }
  async function resolveImages(t, content, cache, userId) {
    const map = new Map();
    for (const p of packImageRefs(content)) map.set(p, await uploadPackImage(t, p, cache, userId));
    return mapPackImages(content, (p) => map.get(p));
  }
  async function putDraft(kind, path, title, content, userId, report, label) {
    const v = validate(kind, content, false, path);
    if (Object.keys(v.errors).length) { report.skipped.push(`${label} : contenu refusé (${Object.values(v.errors)[0]})`); return false; }
    const ex = (await pool.query('SELECT id FROM site_pages WHERE path = $1', [path])).rows[0];
    if (ex) await pool.query('UPDATE site_pages SET draft = $2, updated_at = now(), updated_by = $3 WHERE id = $1', [ex.id, v.value, userId]);
    else await pool.query('INSERT INTO site_pages (kind, path, title, draft, updated_by) VALUES ($1,$2,$3,$4,$5)', [kind, path, title, v.value, userId]);
    return true;
  }
  async function applyPayload(t, userId, report) {
    const pl = t.payload || {}; const cache = new Map(); const pg = pl.pages || {};
    const special = { home: [HOME_PATH, 'Accueil des membres'], catalogue: [CATALOGUE_PATH, 'Catalogue'], watch: [WATCH_PATH, 'Fiche vidéo'], layout: [LAYOUT_PATH, 'En-tête et pied de page'] };
    for (const [k, [path, title]] of Object.entries(special)) {
      if (!pg[k]) continue;
      const c = await resolveImages(t, pg[k], cache, userId);
      if (await putDraft(k, path, title, c, userId, report, title)) report.applied.push(`« ${title} » : brouillon du thème (à publier depuis l’éditeur)`);
    }
    for (const [path, content] of Object.entries(pg.slots || {})) {
      const c = await resolveImages(t, content, cache, userId);
      if (await putDraft('slot', path, path === '/' ? 'Accueil' : path, c, userId, report, path)) report.applied.push(`Page ${path} : brouillon du thème`);
    }
    for (const [id, content] of Object.entries(pg.func || {})) {
      if (!FUNC_PAGES[id]) continue;
      const c = await resolveImages(t, content, cache, userId);
      if (await putDraft('func', funcPath(id), FUNC_PAGES[id].label, c, userId, report, funcPath(id))) report.applied.push(`Page « ${FUNC_PAGES[id].label} » : brouillon du thème (à publier depuis l’éditeur)`);
    }
    for (const p of pg.custom || []) {
      const path = `/p/${p.slug}`;
      if ((await pool.query('SELECT 1 FROM site_pages WHERE path = $1', [path])).rowCount) { report.skipped.push(`Page ${path} existe déjà : conservée`); continue; }
      const c = await resolveImages(t, p.content, cache, userId);
      if (await putDraft('custom', path, p.title, c, userId, report, path)) report.applied.push(`Page ${path} créée en brouillon`);
    }
    for (const g of pl.globals || []) {
      const path = `${GLOBAL_PREFIX}${g.slug}`;
      if ((await pool.query('SELECT 1 FROM site_pages WHERE path = $1', [path])).rowCount) { report.skipped.push(`Section globale « ${g.title} » existe déjà : conservée`); continue; }
      const c = await resolveImages(t, g.content, cache, userId);
      const v = validate('global', c, true, path);
      if (Object.keys(v.errors).length) { report.skipped.push(`Section globale « ${g.title} » : contenu refusé`); continue; }
      const r = (await pool.query('INSERT INTO site_pages (kind, path, title, draft, published, live, published_at, updated_by) VALUES ($1,$2,$3,NULL,$4,true,now(),$5) RETURNING id', ['global', path, g.title, v.value, userId])).rows[0];
      await pool.query('INSERT INTO site_page_versions (page_id, content, created_by) VALUES ($1,$2,$3)', [r.id, v.value, userId]);
      report.applied.push(`Section globale « ${g.title} » créée`);
    }
    for (const m of pl.templates || []) {
      if ((await pool.query('SELECT 1 FROM site_templates WHERE name = $1', [m.name])).rowCount) { report.skipped.push(`Modèle « ${m.name} » existe déjà`); continue; }
      const c = await resolveImages(t, m.content, cache, userId);
      const v = validate(m.kind === 'section' ? 'custom' : m.pageKind, c, false, '');
      if (Object.keys(v.errors).length) { report.skipped.push(`Modèle « ${m.name} » : contenu refusé`); continue; }
      await pool.query('INSERT INTO site_templates (kind, page_kind, name, description, content, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [m.kind, m.pageKind, m.name, m.description || '', v.value, userId]);
      report.applied.push(`Modèle « ${m.name} » ajouté`);
    }
  }

  // ---- Retour à l'état d'avant
  app.post('/admin/theme-packs/deactivate', admin, async (req, reply) => {
    const t = (await pool.query('SELECT slug, name, previous FROM theme_packs WHERE active')).rows[0];
    if (!t) return reply.code(409).send({ error: 'Aucun thème Mejliss n’est actif' });
    const prev = t.previous || {};
    if (prev.skin !== undefined) await saveSettings({ skin_default: prev.skin || null }, req.user.sub);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE themes SET is_active = false WHERE is_active');
      if (prev.themeId && (await client.query('SELECT 1 FROM themes WHERE id = $1', [prev.themeId])).rowCount) await client.query('UPDATE themes SET is_active = true WHERE id = $1', [prev.themeId]);
      else await client.query('UPDATE themes SET is_active = true WHERE id = (SELECT id FROM themes ORDER BY id LIMIT 1)');
      await client.query('UPDATE theme_packs SET active = false, previous = NULL WHERE slug = $1', [t.slug]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    resetThemeCache();
    req.auditSummary = `Thème Mejliss « ${t.name} » désactivé`;
    return { ok: true };
  });

  app.delete('/admin/theme-packs/:slug', admin, async (req, reply) => {
    const { slug } = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/) }).parse(req.params);
    const t = (await pool.query('SELECT name, active, files FROM theme_packs WHERE slug = $1', [slug])).rows[0];
    if (!t) return reply.code(404).send({ error: 'Thème introuvable' });
    if (t.active) return reply.code(409).send({ error: 'Ce thème est actif : désactivez-le d’abord' });
    await pool.query('DELETE FROM theme_packs WHERE slug = $1', [slug]);
    for (const f of Object.values(t.files || {})) deleteObject(f.key).catch(() => {});
    req.auditSummary = `Thème Mejliss « ${t.name} » supprimé`;
    return { ok: true };
  });

  // ---- Le kit
  app.get('/admin/theme-packs/example.zip', admin, async (req, reply) => {
    reply.header('content-disposition', 'attachment; filename="mejliss-theme-exemple-aurore.zip"');
    return reply.type('application/zip').send(buildExampleZip());
  });
  app.get('/admin/theme-packs/guide.md', admin, async (req, reply) => {
    reply.header('content-disposition', 'attachment; filename="GUIDE-THEME-IA.md"');
    return reply.type('text/markdown; charset=utf-8').send(buildGuide());
  });
}
