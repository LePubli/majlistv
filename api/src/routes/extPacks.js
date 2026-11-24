// Lot X1 — Extensions déclaratives Mejliss (Admin → Extensions).
//
// Administrateur :
//   GET    /admin/ext-packs                 extensions installées (+ réglages, fonctions, valeurs)
//   POST   /admin/ext-packs/inspect         { file: data-URL base64 } → contrôle d'un .zip SANS l'installer
//   POST   /admin/ext-packs                 { file } → installe (remplace une version précédente du même id ; refusé si un bloc retiré est encore utilisé)
//   POST   /admin/ext-packs/:slug/activate  active l'extension (ses blocs apparaissent dans l'éditeur)
//   POST   /admin/ext-packs/:slug/deactivate  désactive (refusé tant que des pages utilisent ses blocs : la liste est renvoyée)
//   DELETE /admin/ext-packs/:slug           supprime une extension inactive
//   PUT    /admin/ext-packs/:slug/values    { settings: {cle: valeur}, features: {cle: bool} }
//   GET    /admin/ext-packs/example.zip     extension d'exemple complète (le kit)
//   GET    /admin/ext-packs/guide.md        guide pour IA, généré depuis le code
import { z } from 'zod';
import { pool } from '../db.js';
import { parseExtPack } from '../extPack.js';
import { reloadExtensions, extUsage, settingValues, featureValues } from '../extensions.js';
import { resetPagesCache } from './pages.js';
import { validUrl } from '../blocks.js';
import { buildExtExampleZip, buildExtGuide } from '../extKit.js';

const PACK_MAX = 6 * 1024 * 1024;
const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(24) });
const decode = (file) => {
  const m = String(file || '').match(/^data:[\w/.+-]*;base64,([A-Za-z0-9+/=]+)$/);
  return m ? Buffer.from(m[1], 'base64') : null;
};
const row = (r, vals) => ({
  slug: r.slug, name: r.name, version: r.version, author: r.author, description: r.description, active: r.active,
  installedAt: r.installed_at, activatedAt: r.activated_at,
  blocks: Object.values(r.payload?.blocks || {}).map((b) => ({ type: b.type, label: b.label, kind: b.kind })),
  settings: r.payload?.settings || [], features: r.payload?.features || [],
  values: { settings: settingValues(r.payload, vals), features: featureValues(r.payload, vals) },
});
const valuesOf = async (slug) => {
  const o = {}; for (const v of (await pool.query('SELECT key, value FROM ext_values WHERE ext = $1', [slug])).rows) o[v.key] = v.value; return o;
};

export default async function extPackRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };
  const big = { ...admin, bodyLimit: 10 * 1024 * 1024 };

  app.get('/admin/ext-packs', admin, async () => {
    const rows = (await pool.query('SELECT * FROM ext_packs ORDER BY active DESC, name')).rows;
    return Promise.all(rows.map(async (r) => row(r, await valuesOf(r.slug))));
  });

  app.post('/admin/ext-packs/inspect', big, async (req, reply) => {
    const body = z.object({ file: z.string().max(PACK_MAX * 1.4) }).safeParse(req.body ?? {});
    const buf = body.success ? decode(body.data.file) : null;
    if (!buf) return reply.code(400).send({ error: 'Fichier .zip attendu' });
    if (buf.length > PACK_MAX) return reply.code(400).send({ error: 'Extension trop lourde (6 Mo au maximum)' });
    const p = parseExtPack(buf);
    return { ok: p.ok, errors: p.errors, warnings: p.warnings, summary: p.summary || null };
  });

  app.post('/admin/ext-packs', big, async (req, reply) => {
    const body = z.object({ file: z.string().max(PACK_MAX * 1.4) }).safeParse(req.body ?? {});
    const buf = body.success ? decode(body.data.file) : null;
    if (!buf) return reply.code(400).send({ error: 'Fichier .zip attendu' });
    if (buf.length > PACK_MAX) return reply.code(400).send({ error: 'Extension trop lourde (6 Mo au maximum)' });
    const p = parseExtPack(buf);
    if (!p.ok) return reply.code(400).send({ error: 'Cette extension n’est pas valide', errors: p.errors, warnings: p.warnings });
    const slug = p.manifest.id;
    const old = (await pool.query('SELECT payload FROM ext_packs WHERE slug = $1', [slug])).rows[0];
    // Mise à jour : un bloc qui disparaît ne doit plus être utilisé par une page.
    if (old) {
      const gone = Object.keys(old.payload?.blocks || {}).filter((t) => !p.payload.blocks[t]);
      for (const t of gone) {
        const used = await extUsage(slug, [t]);
        if (used.length) return reply.code(409).send({ error: `Le bloc « ${old.payload.blocks[t].label} » n’existe plus dans cette version mais ${used.length} page(s) l’utilisent : retirez-le d’abord`, usedIn: used });
      }
    }
    await pool.query(
      `INSERT INTO ext_packs (slug, name, version, author, description, manifest, css, payload, installed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, version = EXCLUDED.version, author = EXCLUDED.author, description = EXCLUDED.description,
         manifest = EXCLUDED.manifest, css = EXCLUDED.css, payload = EXCLUDED.payload, installed_at = now(), installed_by = EXCLUDED.installed_by`,
      [slug, p.manifest.name.trim(), p.manifest.version, p.manifest.author || '', p.manifest.description || '', p.manifest, p.css, p.payload, req.user.sub]);
    await reloadExtensions(); resetPagesCache?.();
    req.auditSummary = `Extension « ${p.manifest.name} » ${p.manifest.version} installée`;
    const r = (await pool.query('SELECT * FROM ext_packs WHERE slug = $1', [slug])).rows[0];
    return reply.code(201).send({ ...row(r, await valuesOf(slug)), warnings: p.warnings });
  });

  app.post('/admin/ext-packs/:slug/activate', admin, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const r = (await pool.query('UPDATE ext_packs SET active = true, activated_at = now() WHERE slug = $1 RETURNING *', [slug])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Extension introuvable' });
    await reloadExtensions(); resetPagesCache?.();
    req.auditSummary = `Extension « ${r.name} » activée`;
    return row(r, await valuesOf(slug));
  });

  app.post('/admin/ext-packs/:slug/deactivate', admin, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const cur = (await pool.query('SELECT * FROM ext_packs WHERE slug = $1', [slug])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Extension introuvable' });
    const used = await extUsage(slug);
    if (used.length) return reply.code(409).send({ error: `${used.length} page(s) ou modèle(s) utilisent encore des blocs de cette extension : retirez-les d’abord`, usedIn: used });
    const r = (await pool.query('UPDATE ext_packs SET active = false WHERE slug = $1 RETURNING *', [slug])).rows[0];
    await reloadExtensions(); resetPagesCache?.();
    req.auditSummary = `Extension « ${r.name} » désactivée`;
    return row(r, await valuesOf(slug));
  });

  app.delete('/admin/ext-packs/:slug', admin, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const cur = (await pool.query('SELECT * FROM ext_packs WHERE slug = $1', [slug])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Extension introuvable' });
    if (cur.active) return reply.code(409).send({ error: 'Désactivez d’abord l’extension' });
    const used = await extUsage(slug);
    if (used.length) return reply.code(409).send({ error: `${used.length} page(s) ou modèle(s) utilisent encore des blocs de cette extension : retirez-les d’abord`, usedIn: used });
    await pool.query('DELETE FROM ext_packs WHERE slug = $1', [slug]);
    await reloadExtensions();
    req.auditSummary = `Extension « ${cur.name} » supprimée`;
    return reply.code(204).send();
  });

  // Réglages et fonctions d'une extension (valeurs contrôlées d'après la description de l'extension).
  app.put('/admin/ext-packs/:slug/values', admin, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const body = z.object({ settings: z.record(z.string(), z.unknown()).prefault({}), features: z.record(z.string(), z.boolean()).prefault({}) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Requête invalide' });
    const cur = (await pool.query('SELECT * FROM ext_packs WHERE slug = $1', [slug])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Extension introuvable' });
    const errors = {}; const set = [];
    for (const [k, v] of Object.entries(body.data.settings)) {
      const s = (cur.payload.settings || []).find((x) => x.key === k);
      if (!s) { errors[k] = 'Réglage inconnu'; continue; }
      let ok = false;
      if (s.type === 'text') ok = typeof v === 'string' && v.length <= 300 && !/[\r\n]/.test(v);
      else if (s.type === 'number') ok = Number.isInteger(v) && Math.abs(v) <= 1e9;
      else if (s.type === 'bool') ok = typeof v === 'boolean';
      else if (s.type === 'color') ok = typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
      else if (s.type === 'url') ok = typeof v === 'string' && (v === '' || validUrl(v));
      else if (s.type === 'select') ok = typeof v === 'string' && s.options.some(([o]) => o === v);
      if (!ok) errors[k] = 'Valeur non valide';
      else set.push([`s:${k}`, v]);
    }
    for (const [k, v] of Object.entries(body.data.features)) {
      if (!(cur.payload.features || []).some((f) => f.key === k)) { errors[k] = 'Fonction inconnue'; continue; }
      set.push([`f:${k}`, v]);
    }
    if (Object.keys(errors).length) return reply.code(400).send({ error: 'Certains réglages sont refusés', errors });
    for (const [key, value] of set) await pool.query('INSERT INTO ext_values (ext, key, value) VALUES ($1,$2,$3) ON CONFLICT (ext, key) DO UPDATE SET value = EXCLUDED.value', [slug, key, JSON.stringify(value)]);
    await reloadExtensions(); resetPagesCache?.();
    req.auditSummary = `Réglages de l’extension « ${cur.name} » modifiés`;
    return row(cur, await valuesOf(slug));
  });

  // ---- Kit
  app.get('/admin/ext-packs/example.zip', admin, async (req, reply) => {
    reply.header('content-disposition', 'attachment; filename="extension-exemple.zip"');
    return reply.type('application/zip').send(buildExtExampleZip());
  });
  app.get('/admin/ext-packs/guide.md', admin, async (req, reply) => {
    reply.header('content-disposition', 'attachment; filename="GUIDE-EXTENSIONS-IA.md"');
    return reply.type('text/markdown; charset=utf-8').send(buildExtGuide());
  });
}
