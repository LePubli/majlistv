// Étape I1 — Apparence : thèmes (brouillon, publication, historique), polices importées.
//
// Public :
//   GET  /theme                         feuille de style du thème actif { version, css } (lue par le site à chaque page)
//   GET  /theme/fonts/:id               fichier d'une police importée
// Administrateur :
//   GET  /admin/theme/schema            liste des réglages, groupes et polices intégrées
//   GET  /admin/themes                  liste des thèmes
//   POST /admin/themes                  nouveau thème { name, copyFrom?, values? } (copie ou import JSON)
//   GET  /admin/themes/:id              un thème (publié + brouillon)
//   PATCH /admin/themes/:id             renommer { name }
//   DELETE /admin/themes/:id            supprimer (jamais le thème actif)
//   PUT  /admin/themes/:id/draft        enregistrer le brouillon { values }
//   DELETE /admin/themes/:id/draft      abandonner le brouillon
//   POST /admin/themes/:id/publish      publier le brouillon (une version est gardée dans l'historique)
//   POST /admin/themes/:id/activate     rendre ce thème visible sur le site
//   GET  /admin/themes/:id/versions     historique des publications
//   POST /admin/themes/:id/versions/:vid/restore   recopier une ancienne version dans le brouillon
//   GET/POST /admin/theme/fonts, DELETE /admin/theme/fonts/:id   polices importées
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { putObject, deleteObject, getObjectBuffer } from '../storage.js';
import { TOKENS, GROUPS, BUILTIN_FONTS, cleanValues, buildCss, contrastIssues, validFontName } from '../themeCss.js';

const KEEP_VERSIONS = 50;
const FONT_MAX = 2 * 1024 * 1024; // 2 Mo par fichier
const FONT_TYPES = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', opentype: 'font/otf' };

// Reconnaît le format d'une police à ses premiers octets (on ne se fie jamais à l'extension).
export function fontFormat(buf) {
  const sig = buf.subarray(0, 4);
  if (sig.toString('latin1') === 'wOF2') return 'woff2';
  if (sig.toString('latin1') === 'wOFF') return 'woff';
  if (sig.toString('latin1') === 'OTTO') return 'opentype';
  if (sig.equals(Buffer.from([0, 1, 0, 0])) || sig.toString('latin1') === 'true') return 'truetype';
  return null;
}

const idParam = z.object({ id: z.coerce.number().int().positive() });
const nameSchema = z.string().trim().min(1).max(60);
const fontRow = 'id, family, weight, style, format, size_bytes AS "sizeBytes", created_at AS "createdAt"';

async function fontList() {
  return (await pool.query(`SELECT ${fontRow} FROM theme_fonts ORDER BY family, weight, style`)).rows;
}

// Feuille de style du thème actif, gardée en mémoire jusqu'à la prochaine modification.
let cache = null;
export const resetThemeCache = () => { cache = null; };
export async function activeThemeCss() {
  if (cache) return cache;
  const t = (await pool.query('SELECT id, published, published_at FROM themes WHERE is_active LIMIT 1')).rows[0];
  const fonts = await fontList();
  const css = buildCss(t?.published || {}, fonts);
  cache = { version: crypto.createHash('sha1').update(css).digest('hex').slice(0, 12), css, themeId: t?.id || null };
  return cache;
}

function view(r) {
  return {
    id: r.id, name: r.name, isActive: r.is_active, published: r.published, draft: r.draft,
    hasDraft: r.draft !== null, publishedAt: r.published_at, updatedAt: r.updated_at,
  };
}

export default async function appearanceRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };

  // ------------------------------------------------------------------ Public
  app.get('/theme', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=15');
    const { version, css } = await activeThemeCss();
    return { version, css };
  });

  app.get('/theme/fonts/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const f = (await pool.query('SELECT storage_key, format FROM theme_fonts WHERE id = $1', [id])).rows[0];
    if (!f) return reply.code(404).send({ error: 'Police introuvable' });
    const buf = await getObjectBuffer(f.storage_key);
    // Le fichier ne change jamais (une nouvelle version = un nouvel identifiant) : longue durée de cache.
    reply.header('cache-control', 'public, max-age=31536000, immutable');
    return reply.type(FONT_TYPES[f.format]).send(buf);
  });

  // ------------------------------------------------------------------ Administration
  app.get('/admin/theme/schema', admin, async () => ({ tokens: TOKENS, groups: GROUPS, builtinFonts: BUILTIN_FONTS }));

  app.get('/admin/themes', admin, async () => (await pool.query(
    'SELECT * FROM themes ORDER BY is_active DESC, name')).rows.map((r) => {
    const { published, draft, ...rest } = view(r);
    return { ...rest, changed: Object.keys(published).length };
  }));

  app.post('/admin/themes', admin, async (req, reply) => {
    const body = z.object({ name: nameSchema, copyFrom: z.number().int().positive().optional(), values: z.record(z.string()).optional() }).parse(req.body ?? {});
    let values = {};
    if (body.values) {
      const res = cleanValues(body.values, (await fontList()).map((x) => x.family));
      if (Object.keys(res.errors).length) return reply.code(400).send({ error: 'Réglages invalides', errors: res.errors });
      values = res.values;
    } else if (body.copyFrom) {
      const src = (await pool.query('SELECT published, draft FROM themes WHERE id = $1', [body.copyFrom])).rows[0];
      if (!src) return reply.code(404).send({ error: 'Thème à copier introuvable' });
      values = src.published;
    }
    const r = (await pool.query(
      'INSERT INTO themes (name, published, published_at, updated_by) VALUES ($1, $2, now(), $3) RETURNING *', [body.name, values, req.user.sub])).rows[0];
    req.auditSummary = `Nouveau thème « ${body.name} »`;
    return reply.code(201).send(view(r));
  });

  app.get('/admin/themes/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('SELECT * FROM themes WHERE id = $1', [id])).rows[0];
    return r ? view(r) : reply.code(404).send({ error: 'Thème introuvable' });
  });

  app.patch('/admin/themes/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { name } = z.object({ name: nameSchema }).parse(req.body ?? {});
    const r = (await pool.query('UPDATE themes SET name = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, name, req.user.sub])).rows[0];
    return r ? view(r) : reply.code(404).send({ error: 'Thème introuvable' });
  });

  app.delete('/admin/themes/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('SELECT name, is_active FROM themes WHERE id = $1', [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Thème introuvable' });
    if (r.is_active) return reply.code(409).send({ error: 'Le thème actif ne peut pas être supprimé : activez-en un autre d’abord.' });
    await pool.query('DELETE FROM themes WHERE id = $1', [id]);
    req.auditSummary = `Thème « ${r.name} » supprimé`;
    return reply.code(204).send();
  });

  app.put('/admin/themes/:id/draft', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { values } = z.object({ values: z.record(z.string()) }).parse(req.body ?? {});
    const fonts = await fontList();
    const res = cleanValues(values, fonts.map((x) => x.family));
    if (Object.keys(res.errors).length) return reply.code(400).send({ error: 'Réglages invalides', errors: res.errors });
    const r = (await pool.query('UPDATE themes SET draft = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, res.values, req.user.sub])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Thème introuvable' });
    return { ...view(r), issues: contrastIssues(res.values) };
  });

  app.delete('/admin/themes/:id/draft', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('UPDATE themes SET draft = NULL, updated_at = now() WHERE id = $1 RETURNING *', [id])).rows[0];
    return r ? view(r) : reply.code(404).send({ error: 'Thème introuvable' });
  });

  app.post('/admin/themes/:id/publish', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = (await client.query('SELECT * FROM themes WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Thème introuvable' }); }
      if (cur.draft === null) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Aucun brouillon à publier' }); }
      // Une police supprimée entre-temps : la valeur est retirée plutôt que de publier un réglage cassé.
      const { values } = cleanValues(cur.draft, (await client.query('SELECT family FROM theme_fonts')).rows.map((x) => x.family));
      const r = (await client.query(
        'UPDATE themes SET published = $2, draft = NULL, published_at = now(), updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, values, req.user.sub])).rows[0];
      await client.query('INSERT INTO theme_versions (theme_id, vals, created_by) VALUES ($1, $2, $3)', [id, values, req.user.sub]);
      await client.query(
        `DELETE FROM theme_versions WHERE theme_id = $1 AND id NOT IN (SELECT id FROM theme_versions WHERE theme_id = $1 ORDER BY id DESC LIMIT ${KEEP_VERSIONS})`, [id]);
      await client.query('COMMIT');
      resetThemeCache();
      req.auditSummary = `Thème « ${r.name} » publié (${Object.keys(values).length} réglage(s) modifié(s))`;
      return view(r);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/admin/themes/:id/activate', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = (await client.query('SELECT name FROM themes WHERE id = $1', [id])).rows[0];
      if (!r) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Thème introuvable' }); }
      await client.query('UPDATE themes SET is_active = false WHERE is_active AND id <> $1', [id]);
      await client.query('UPDATE themes SET is_active = true, updated_at = now() WHERE id = $1', [id]);
      await client.query('COMMIT');
      resetThemeCache();
      req.auditSummary = `Thème « ${r.name} » activé`;
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/admin/themes/:id/versions', admin, async (req) => {
    const { id } = idParam.parse(req.params);
    return (await pool.query(
      `SELECT v.id, v.created_at AS "createdAt", u.name AS "by", (SELECT count(*)::int FROM jsonb_object_keys(v.vals)) AS changed
         FROM theme_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.theme_id = $1 ORDER BY v.id DESC`, [id])).rows;
  });

  app.post('/admin/themes/:id/versions/:vid/restore', admin, async (req, reply) => {
    const { id, vid } = z.object({ id: z.coerce.number().int().positive(), vid: z.coerce.number().int().positive() }).parse(req.params);
    const v = (await pool.query('SELECT vals FROM theme_versions WHERE id = $2 AND theme_id = $1', [id, vid])).rows[0];
    if (!v) return reply.code(404).send({ error: 'Version introuvable' });
    const r = (await pool.query('UPDATE themes SET draft = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING *', [id, v.vals, req.user.sub])).rows[0];
    req.auditSummary = `Ancienne version ${vid} recopiée dans le brouillon`;
    return view(r);
  });

  // ---- Polices importées
  app.get('/admin/theme/fonts', admin, async () => fontList());

  app.post('/admin/theme/fonts', { ...admin, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const body = z.object({
      family: z.string().trim(),
      weight: z.string().trim().regex(/^[1-9]00(?: [1-9]00)?$/).default('400'),
      style: z.enum(['normal', 'italic']).default('normal'),
      file: z.string().max(3_000_000),
    }).parse(req.body ?? {});
    if (!validFontName(body.family) || BUILTIN_FONTS.includes(body.family)) return reply.code(400).send({ error: 'Nom de police invalide (2 à 40 lettres, chiffres, espaces ou tirets ; différent des polices intégrées)' });
    const m = body.file.match(/^data:[\w/.+-]*;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Fichier attendu (WOFF2, WOFF, TTF ou OTF)' });
    const buf = Buffer.from(m[1], 'base64');
    const format = fontFormat(buf);
    if (!format) return reply.code(400).send({ error: 'Ce fichier n’est pas une police WOFF2, WOFF, TTF ou OTF' });
    if (buf.length > FONT_MAX) return reply.code(400).send({ error: 'Police trop lourde (2 Mo maximum)' });
    const dup = (await pool.query('SELECT 1 FROM theme_fonts WHERE family = $1 AND weight = $2 AND style = $3', [body.family, body.weight, body.style])).rowCount;
    if (dup) return reply.code(409).send({ error: 'Cette police existe déjà avec la même graisse et le même style' });
    const id = crypto.randomUUID();
    const ext = { woff2: 'woff2', woff: 'woff', truetype: 'ttf', opentype: 'otf' }[format];
    const key = `site/fonts/${id}.${ext}`;
    await putObject(key, buf, FONT_TYPES[format]);
    const r = (await pool.query(
      `INSERT INTO theme_fonts (id, family, weight, style, format, storage_key, size_bytes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${fontRow}`,
      [id, body.family, body.weight, body.style, format, key, buf.length])).rows[0];
    resetThemeCache();
    req.auditSummary = `Police « ${body.family} » importée`;
    return reply.code(201).send(r);
  });

  app.delete('/admin/theme/fonts/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const f = (await pool.query('SELECT family, storage_key FROM theme_fonts WHERE id = $1', [id])).rows[0];
    if (!f) return reply.code(404).send({ error: 'Police introuvable' });
    // Encore utilisée ? (seulement si c'est le dernier fichier de cette famille)
    const others = (await pool.query('SELECT count(*)::int AS n FROM theme_fonts WHERE family = $1 AND id <> $2', [f.family, id])).rows[0].n;
    if (!others) {
      const used = (await pool.query(
        `SELECT name FROM themes WHERE EXISTS (SELECT 1 FROM jsonb_each_text(published) e WHERE e.value = $1)
            OR EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(draft, '{}'::jsonb)) e WHERE e.value = $1)`, [f.family])).rows;
      if (used.length) return reply.code(409).send({ error: `Police utilisée par : ${used.map((x) => x.name).join(', ')}. Choisissez une autre police dans ces thèmes avant de la supprimer.` });
    }
    await pool.query('DELETE FROM theme_fonts WHERE id = $1', [id]);
    await deleteObject(f.storage_key).catch(() => {});
    resetThemeCache();
    req.auditSummary = `Police « ${f.family} » supprimée`;
    return reply.code(204).send();
  });
}
