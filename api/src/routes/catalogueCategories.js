// Nouveau catalogue (cahier des charges du 20/11/2026) — phase 3 : catégories du catalogue ADULTES côté public.
//   GET /catalogue/categories?lang=fr|en|ar          les catégories actives avec leurs sous-catégories et le VRAI nombre de vidéos visibles
//   GET /catalogue/categories/:slug?lang=fr|en|ar    une catégorie ou sous-catégorie : textes dans la langue, SEO, parent, frères, fil d'Ariane
// Les vidéos d'une catégorie se lisent avec GET /talks?category=<id>&limit=&offset= (même règles de visibilité que ce fichier).
// Une catégorie inactive, ou dont le parent est inactif, ou du catalogue Kids, est introuvable (404) : elle n'existe pas pour le public.
import { z } from 'zod';
import { pool } from '../db.js';
import { visibleSql } from '../visibility.js';
import { inCategorySql, adultSql } from '../taxonomy.js';
import { presignGet } from '../storage.js';

const langQ = z.object({ lang: z.enum(['fr', 'en', 'ar']).default('fr') });
const COUNT = `(SELECT count(*)::int FROM talks t WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${adultSql('t')} AND ${inCategorySql('t', 'c.id')})`;
const COLS = `c.id, c.slug, c.name, c.parent_id AS "parentId", c.icon, c.color, c.image, c.hero_image AS "heroImage", c.is_featured AS "isFeatured",
  c.description, c.short_description AS "shortDescription", c.seo_title AS "seoTitle", c.seo_description AS "seoDescription", c.translations, ${COUNT} AS count`;
const PUBLIC = `c.catalogue_type = 'adult' AND c.is_active AND (p.id IS NULL OR p.is_active)`;
const ORDER = `ORDER BY c.display_order, lower(c.name)`;

// Textes d'une catégorie dans la langue demandée ; ce qui manque retombe sur le français.
export function localize(row, lang) {
  const tr = lang !== 'fr' ? (row.translations?.[lang] || {}) : {};
  const out = {
    id: row.id, slug: row.slug, parentId: row.parentId, icon: row.icon, color: row.color, image: row.image, heroImage: row.heroImage, isFeatured: row.isFeatured, count: row.count,
    name: tr.name || row.name, shortDescription: tr.shortDescription || row.shortDescription, description: tr.description || row.description,
    seoTitle: tr.seoTitle || row.seoTitle, seoDescription: tr.seoDescription || row.seoDescription,
  };
  return out;
}

export default async function catalogueCategoriesRoutes(app) {
  // Image d'une catégorie envoyée depuis l'admin : renvoie vers un lien temporaire du stockage (adresse stable pour le site).
  app.get('/catalogue/category-image/:id/:kind', async (req, reply) => {
    const { id, kind } = z.object({ id: z.coerce.number().int().positive(), kind: z.enum(['image', 'hero']) }).parse(req.params);
    const col = kind === 'hero' ? 'hero_image_key' : 'image_key';
    const k = (await pool.query(`SELECT ${col} AS k FROM categories WHERE id = $1`, [id])).rows[0]?.k;
    if (!k) return reply.code(404).send({ error: 'Image introuvable' });
    reply.header('cache-control', 'public, max-age=600');
    return reply.redirect(await presignGet(k), 302);
  });

  app.get('/catalogue/categories', async (req, reply) => {
    const { lang } = langQ.parse(req.query);
    const rows = (await pool.query(
      `SELECT ${COLS} FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE ${PUBLIC} ${ORDER}`)).rows.map((r) => localize(r, lang));
    const tops = rows.filter((r) => r.parentId == null).map((r) => ({ ...r, children: rows.filter((x) => x.parentId === r.id) }));
    reply.header('cache-control', 'public, max-age=60');
    return { total: (await pool.query(`SELECT count(*)::int AS n FROM talks t WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${adultSql('t')}`)).rows[0].n, categories: tops };
  });

  app.get('/catalogue/categories/:slug', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) }).parse(req.params);
    const { lang } = langQ.parse(req.query);
    const one = (await pool.query(`SELECT ${COLS} FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.slug = $1 AND ${PUBLIC}`, [slug])).rows[0];
    if (!one) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const cat = localize(one, lang);
    const rootId = one.parentId ?? one.id;
    const root = one.parentId == null ? cat : localize((await pool.query(`SELECT ${COLS} FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.id = $1`, [rootId])).rows[0], lang);
    const children = (await pool.query(`SELECT ${COLS} FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.parent_id = $1 AND ${PUBLIC} ${ORDER}`, [rootId])).rows.map((r) => localize(r, lang));
    reply.header('cache-control', 'public, max-age=60');
    return { ...cat, root: { id: root.id, slug: root.slug, name: root.name, count: root.count }, children,
      breadcrumbs: one.parentId == null ? [{ slug: cat.slug, name: cat.name }] : [{ slug: root.slug, name: root.name }, { slug: cat.slug, name: cat.name }] };
  });
}
