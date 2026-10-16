// Étape B : formats de contenu (conférence, cours, récitation…) et page « Catalogue » façon Netflix.
// GET /formats        : liste publique (le site affiche le nom dans la langue du visiteur).
// POST/PATCH/DELETE   : administrateur (Admin → Catégories et formats).
// GET /catalogue      : une rangée par format (+ « Nouveautés ») et la bannière à la une ; mêmes règles de visibilité que l'accueil.
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { getNumber } from '../settings.js';
import { adultSql } from '../taxonomy.js';

const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, t.category_id AS "categoryId", c.name AS category, t.level,
  f.slug AS format, t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, t.description`;
const FROM = 'FROM talks t LEFT JOIN category_names c ON c.id = t.category_id LEFT JOIN formats f ON f.id = t.format_id';
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };

async function card(r, { withDescription = false } = {}) {
  const out = { ...r };
  out.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
  out.summary = clip(r.description, withDescription ? 240 : 170);
  for (const k of ['poster_key', 'external_thumb', 'description']) delete out[k];
  if (out.source === 'upload') delete out.video_ref;
  return out;
}

const body = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
  nameFr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(60).default(''),
  nameAr: z.string().trim().max(60).default(''),
  position: z.number().int().min(0).max(9999).optional(),
});
const patch = body.omit({ slug: true }).partial().refine((x) => Object.keys(x).length > 0);
const idP = z.object({ id: z.coerce.number().int().positive() });
const SEL = 'SELECT id, slug, name_fr AS "nameFr", name_en AS "nameEn", name_ar AS "nameAr", position FROM formats';

export default async function formatRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };

  app.get('/formats', async () => (await pool.query(`${SEL} ORDER BY position, id`)).rows);

  // Version admin : avec le nombre de contenus par format.
  app.get('/formats/stats', admin, async () => (await pool.query(
    `SELECT f.id, f.slug, f.name_fr AS "nameFr", f.name_en AS "nameEn", f.name_ar AS "nameAr", f.position,
            (SELECT count(*)::int FROM talks t WHERE t.format_id = f.id) AS count FROM formats f ORDER BY f.position, f.id`)).rows);

  app.post('/formats', admin, async (req, reply) => {
    const b = body.parse(req.body);
    const pos = b.position ?? ((await pool.query('SELECT COALESCE(max(position), 0) + 10 AS p FROM formats')).rows[0].p);
    try {
      const { rows } = await pool.query(
        'INSERT INTO formats(slug, name_fr, name_en, name_ar, position) VALUES ($1, $2, $3, $4, $5) RETURNING id, slug, name_fr AS "nameFr", name_en AS "nameEn", name_ar AS "nameAr", position',
        [b.slug, b.nameFr, b.nameEn, b.nameAr, pos]);
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Un format porte déjà ce code' });
      throw err;
    }
  });

  app.patch('/formats/:id', admin, async (req, reply) => {
    const { id } = idP.parse(req.params);
    const b = patch.parse(req.body);
    const map = { nameFr: 'name_fr', nameEn: 'name_en', nameAr: 'name_ar', position: 'position' };
    const sets = []; const vals = [id];
    for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${col} = $${vals.length}`); }
    const { rows } = await pool.query(`UPDATE formats SET ${sets.join(', ')} WHERE id = $1 RETURNING id, slug, name_fr AS "nameFr", name_en AS "nameEn", name_ar AS "nameAr", position`, vals);
    if (!rows[0]) return reply.code(404).send({ error: 'Format introuvable' });
    return rows[0];
  });

  // Les contenus du format supprimé restent en ligne, simplement sans format.
  app.delete('/formats/:id', admin, async (req, reply) => {
    const { id } = idP.parse(req.params);
    const r = await pool.query('DELETE FROM formats WHERE id = $1', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Format introuvable' });
    return reply.code(204).send();
  });

  // Page Catalogue : bannière à la une (comme l'accueil), « Nouveautés », puis une rangée par format qui contient des contenus.
  app.get('/catalogue', async () => {
    const size = await getNumber('home_row_size');
    const vis = `${visibleSql('t')} AND ${adultSql('t')}`;
    const base = `${FROM} WHERE t.video_status = 'ready' AND ${vis}`;
    let { rows: hero } = await pool.query(`SELECT ${CARD} ${base} AND t.featured ORDER BY t.featured_at DESC LIMIT 5`);
    const fallback = hero.length === 0;
    if (fallback) hero = (await pool.query(`SELECT ${CARD} ${base} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT 1`)).rows;
    const rows = [];
    const fresh = (await pool.query(`SELECT ${CARD} ${base} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $1`, [size])).rows;
    if (fresh.length) rows.push({ key: 'new', format: null, talks: await Promise.all(fresh.map((x) => card(x))) });
    const formats = (await pool.query(`${SEL} ORDER BY position, id`)).rows;
    for (const f of formats) {
      const r = (await pool.query(`SELECT ${CARD} ${base} AND t.format_id = $1 ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $2`, [f.id, size])).rows;
      if (!r.length) continue;
      const total = (await pool.query(`SELECT count(*)::int AS n FROM talks t WHERE t.video_status = 'ready' AND ${vis} AND t.format_id = $1`, [f.id])).rows[0].n;
      rows.push({ key: `format:${f.slug}`, format: f, total, talks: await Promise.all(r.map((x) => card(x))) });
    }
    return { hero: { fallback, items: await Promise.all(hero.map((r) => card(r, { withDescription: true }))) }, rows };
  });
}
