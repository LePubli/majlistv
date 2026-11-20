// Nouveau catalogue (cahier des charges du 20/11/2026) — phase 2 : administration de la taxonomie.
// Une seule table `categories` pour le catalogue adultes ET Kids (catalogue_type), sur deux niveaux (catégorie → sous-catégorie).
// Toutes les routes ci-dessous sont réservées aux administrateurs (le journal d'audit les enregistre : préfixe /categories).
//
//   GET    /categories/admin                 arbre complet (adultes + Kids, actives ou non) avec tous les champs et les compteurs
//   POST   /categories                       créer (slug automatique et unique, ordre à la suite des frères)
//   PATCH  /categories/:id                   modifier (nom, description, SEO, icône, images, couleur, traductions, activation, ordre, parent…)
//   POST   /categories/reorder               ranger des frères dans un nouvel ordre
//   DELETE /categories/:id                   supprimer : refusé tant qu'il reste des vidéos / séries / sous-catégories, sauf choix explicite
//                                            (?moveTo=<id> pour transférer, ?detach=1 pour détacher). Les vidéos ne sont JAMAIS supprimées.
//   GET    /categories/:id/talks             vidéos classées dans la catégorie (principale ou supplémentaire)
//   GET    /categories/:id/candidates?q=     vidéos que l'on peut y ajouter
//   POST   /categories/:id/talks             { add: [uuid], remove: [uuid] } : associer / dissocier des vidéos (plusieurs catégories possibles)
import { z } from 'zod';
import { pool } from '../db.js';
import { slugify } from '../slugs.js';
import { patchOf } from '../zpatch.js';

const FULL = `c.id, c.name, c.slug, c.parent_id AS "parentId", c.catalogue_type AS "catalogueType", c.description,
  c.short_description AS "shortDescription", c.display_order AS "displayOrder", c.is_active AS "isActive", c.is_featured AS "isFeatured",
  c.icon, c.image, c.hero_image AS "heroImage", c.color, c.seo_title AS "seoTitle", c.seo_description AS "seoDescription",
  c.translations, c.updated_at AS "updatedAt"`;
const COUNTS = `(SELECT count(*)::int FROM talks t WHERE t.category_id = c.id) AS "mainCount",
  (SELECT count(*)::int FROM talk_categories tc WHERE tc.category_id = c.id) AS "extraCount",
  (SELECT count(*)::int FROM series s WHERE s.category_id = c.id) AS "seriesCount",
  (SELECT count(*)::int FROM categories k WHERE k.parent_id = c.id) AS children,
  (SELECT count(*)::int FROM kid_rubrics r WHERE r.category_id = c.id) AS "rubricCount"`;

const idParam = z.object({ id: z.coerce.number().int().positive() });
const urlOrPath = z.string().trim().max(500).regex(/^(https?:\/\/|\/)[^\s]*$/, 'Adresse d\'image invalide (https://… ou /chemin)');
const trText = patchOf(z.object({
  name: z.string().trim().max(80), description: z.string().trim().max(2000), shortDescription: z.string().trim().max(300),
  seoTitle: z.string().trim().max(120), seoDescription: z.string().trim().max(300),
}).strict());
const fields = {
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(90).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug : minuscules, chiffres et tirets seulement'),
  parentId: z.number().int().positive().nullable(),
  catalogueType: z.enum(['adult', 'kids']),
  description: z.string().trim().max(2000),
  shortDescription: z.string().trim().max(300),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  icon: z.string().trim().max(40).nullable(),
  image: urlOrPath.nullable(),
  heroImage: urlOrPath.nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur : #RRGGBB').nullable(),
  seoTitle: z.string().trim().max(120),
  seoDescription: z.string().trim().max(300),
  translations: patchOf(z.object({ en: trText, ar: trText }).strict()),
  displayOrder: z.number().int().min(0).max(1000000),
};
const createSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, k === 'name' ? f : f.optional()]))).strict(); // seul le nom est obligatoire
const patchSchema = patchOf(z.object(fields).strict()).refine((x) => Object.keys(x).length > 0, 'Rien à modifier');

// Colonnes SQL de chaque champ modifiable.
const COL = { name: 'name', slug: 'slug', parentId: 'parent_id', catalogueType: 'catalogue_type', description: 'description', shortDescription: 'short_description',
  isActive: 'is_active', isFeatured: 'is_featured', icon: 'icon', image: 'image', heroImage: 'hero_image', color: 'color', seoTitle: 'seo_title',
  seoDescription: 'seo_description', translations: 'translations', displayOrder: 'display_order' };

// Retire les traductions vides (une langue sans texte n'existe pas).
function cleanTranslations(tr) {
  const out = {};
  for (const lang of Object.keys(tr || {})) {
    const o = {};
    for (const [k, v] of Object.entries(tr[lang] || {})) if (typeof v === 'string' && v.trim()) o[k] = v.trim();
    if (Object.keys(o).length) out[lang] = o;
  }
  return out;
}

export default async function categoriesAdminRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };

  const getOne = async (id) => (await pool.query(`SELECT ${FULL}, ${COUNTS} FROM categories c WHERE c.id = $1`, [id])).rows[0] || null;

  // Slug libre et unique : « base », « base-2 », « base-3 »… (selfId : la catégorie qui le porte déjà peut le garder).
  async function uniqueSlug(base, selfId = null) {
    for (let n = 1; n < 200; n += 1) {
      const cand = n === 1 ? base : `${base}-${n}`;
      const hit = (await pool.query('SELECT 1 FROM categories WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)', [cand, selfId])).rowCount;
      if (!hit) return cand;
    }
    return `${base}-${Date.now()}`;
  }

  // Parent : doit exister et être une catégorie principale (deux niveaux au maximum).
  async function checkParent(parentId, selfId = null) {
    if (parentId == null) return null;
    if (selfId != null && parentId === selfId) return 'Une catégorie ne peut pas être sa propre catégorie parente';
    const p = (await pool.query('SELECT parent_id FROM categories WHERE id = $1', [parentId])).rows[0];
    if (!p) return 'Catégorie parente introuvable';
    if (p.parent_id != null) return 'Une sous-catégorie ne peut pas avoir de sous-catégorie (deux niveaux au maximum)';
    return null;
  }
  const dupName = async (name, parentId, selfId = null) => (await pool.query(
    `SELECT 1 FROM categories WHERE lower(name) = lower($1) AND parent_id IS NOT DISTINCT FROM $2::int AND ($3::int IS NULL OR id <> $3)`, [name, parentId, selfId])).rowCount > 0;

  // ───────────────────────── Lecture ─────────────────────────
  // Arbre complet pour l'écran d'administration : adultes puis Kids, chaque catégorie suivie de ses sous-catégories.
  app.get('/categories/admin', admin, async () => (await pool.query(
    `SELECT ${FULL}, ${COUNTS}, n.name AS "fullName", (c.parent_id IS NOT NULL)::int AS depth
       FROM categories c JOIN category_names n ON n.id = c.id LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY (COALESCE(p.catalogue_type, c.catalogue_type) = 'kids'), COALESCE(p.display_order, c.display_order), COALESCE(p.id, c.id),
               (c.parent_id IS NOT NULL), c.display_order, lower(c.name)`)).rows);

  // ───────────────────────── Création ─────────────────────────
  app.post('/categories', admin, async (req, reply) => {
    const b = createSchema.parse(req.body);
    const parentId = b.parentId ?? null;
    const bad = await checkParent(parentId);
    if (bad) return reply.code(400).send({ error: bad });
    if (await dupName(b.name, parentId)) return reply.code(409).send({ error: parentId ? 'Cette catégorie a déjà une sous-catégorie de ce nom' : 'Catégorie déjà existante', code: 'name_taken' });
    const parent = parentId ? (await pool.query('SELECT slug, catalogue_type FROM categories WHERE id = $1', [parentId])).rows[0] : null;
    const catalogueType = parent ? parent.catalogue_type : (b.catalogueType || 'adult'); // une sous-catégorie suit toujours son parent
    let slug;
    if (b.slug) {
      if ((await pool.query('SELECT 1 FROM categories WHERE slug = $1', [b.slug])).rowCount) return reply.code(409).send({ error: 'Ce slug est déjà utilisé', code: 'slug_taken' });
      slug = b.slug;
    } else {
      const own = slugify(b.name) || `categorie-${Math.random().toString(36).slice(2, 8)}`;
      slug = await uniqueSlug(parent?.slug ? `${parent.slug}-${own}` : own);
    }
    const order = b.displayOrder ?? (await pool.query(
      `SELECT COALESCE(max(display_order), 0) + 10 AS n FROM categories WHERE parent_id IS NOT DISTINCT FROM $1::int AND ($1::int IS NOT NULL OR catalogue_type = $2)`,
      [parentId, catalogueType])).rows[0].n;
    try {
      const { rows } = await pool.query(
        `INSERT INTO categories(name, parent_id, slug, catalogue_type, description, short_description, display_order, is_active, is_featured,
                                icon, image, hero_image, color, seo_title, seo_description, translations)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [b.name, parentId, slug, catalogueType, b.description ?? '', b.shortDescription ?? '', order, b.isActive ?? true, b.isFeatured ?? false,
          b.icon ?? null, b.image ?? null, b.heroImage ?? null, b.color ?? null, b.seoTitle ?? '', b.seoDescription ?? '', JSON.stringify(cleanTranslations(b.translations))]);
      return reply.code(201).send(await getOne(rows[0].id));
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Catégorie ou slug déjà existant', code: 'name_taken' });
      throw err;
    }
  });

  // ───────────────────────── Modification ─────────────────────────
  app.patch('/categories/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = patchSchema.parse(req.body);
    const cur = (await pool.query('SELECT name, parent_id, catalogue_type, slug FROM categories WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const hasKids = (await pool.query('SELECT 1 FROM categories WHERE parent_id = $1', [id])).rowCount > 0;
    const parentId = b.parentId !== undefined ? b.parentId : cur.parent_id;
    if (b.parentId !== undefined && parentId != null) {
      if (hasKids) return reply.code(400).send({ error: 'Cette catégorie a des sous-catégories : elle ne peut pas devenir une sous-catégorie' });
      const bad = await checkParent(parentId, id);
      if (bad) return reply.code(400).send({ error: bad });
    }
    const name = b.name ?? cur.name;
    if ((b.name !== undefined || b.parentId !== undefined) && await dupName(name, parentId, id)) {
      return reply.code(409).send({ error: 'Une catégorie porte déjà ce nom à cet endroit', code: 'name_taken' });
    }
    if (b.slug !== undefined && b.slug !== cur.slug && (await pool.query('SELECT 1 FROM categories WHERE slug = $1 AND id <> $2', [b.slug, id])).rowCount) {
      return reply.code(409).send({ error: 'Ce slug est déjà utilisé', code: 'slug_taken' });
    }
    // Catalogue : une sous-catégorie suit son parent ; une catégorie principale peut changer de catalogue (ses sous-catégories la suivent).
    const set = { ...b };
    if (set.translations) set.translations = JSON.stringify(cleanTranslations(set.translations));
    let catalogue = b.catalogueType ?? cur.catalogue_type;
    if (parentId != null) {
      catalogue = (await pool.query('SELECT catalogue_type FROM categories WHERE id = $1', [parentId])).rows[0].catalogue_type;
      set.catalogueType = catalogue;
    }
    if (b.catalogueType !== undefined && catalogue === 'adult' && (await pool.query('SELECT 1 FROM kid_rubrics WHERE category_id = $1', [id])).rowCount) {
      return reply.code(409).send({ error: "Cet univers est utilisé par l'espace Kids : il ne peut pas passer au catalogue adultes", code: 'kids_rubric' });
    }
    // Déplacée vers un autre parent (ou promue en catégorie principale) : elle se range à la fin de ses nouveaux frères, sauf ordre explicite.
    if (b.parentId !== undefined && parentId !== cur.parent_id && b.displayOrder === undefined) {
      set.displayOrder = (await pool.query(
        `SELECT COALESCE(max(display_order), 0) + 10 AS n FROM categories WHERE id <> $3 AND parent_id IS NOT DISTINCT FROM $1::int AND ($1::int IS NOT NULL OR catalogue_type = $2)`,
        [parentId, catalogue, id])).rows[0].n;
    }
    const keys = Object.keys(set);
    const sql = keys.map((k, i) => `${COL[k]} = $${i + 2}`).join(', ');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE categories SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => set[k])]);
      if (parentId == null && catalogue !== cur.catalogue_type) await client.query('UPDATE categories SET catalogue_type = $2, updated_at = now() WHERE parent_id = $1', [id, catalogue]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return reply.code(409).send({ error: 'Nom ou slug déjà utilisé', code: 'name_taken' });
      throw err;
    } finally { client.release(); }
    return getOne(id); // la recherche se met à jour seule (la signature d'indexation contient le nom et les parents)
  });

  // ───────────────────────── Ordre ─────────────────────────
  // { ids: [3, 1, 2] } : les frères (même parent, même catalogue) sont renumérotés 10, 20, 30… dans l'ordre donné.
  app.post('/categories/reorder', admin, async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }).strict().parse(req.body);
    if (new Set(ids).size !== ids.length) return reply.code(400).send({ error: 'Identifiants en double' });
    const rows = (await pool.query('SELECT id, parent_id, catalogue_type FROM categories WHERE id = ANY($1::int[])', [ids])).rows;
    if (rows.length !== ids.length) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const same = rows.every((r) => r.parent_id === rows[0].parent_id && r.catalogue_type === rows[0].catalogue_type);
    if (!same) return reply.code(400).send({ error: 'On ne range ensemble que des catégories du même niveau et du même catalogue' });
    await pool.query(
      `UPDATE categories c SET display_order = x.ord * 10, updated_at = now()
         FROM unnest($1::int[]) WITH ORDINALITY AS x(id, ord) WHERE c.id = x.id`, [ids]);
    return { ok: true, count: ids.length };
  });

  // ───────────────────────── Suppression protégée ─────────────────────────
  // Jamais de suppression silencieuse : tant qu'une catégorie contient des vidéos, des séries ou des sous-catégories, l'API répond 409
  // avec le détail. L'administrateur choisit alors : transférer vers une autre catégorie (?moveTo=) ou détacher (?detach=1) — ou simplement
  // désactiver la catégorie (PATCH isActive). Les vidéos et les séries ne sont jamais supprimées.
  app.delete('/categories/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ moveTo: z.coerce.number().int().positive().optional(), detach: z.enum(['1', 'true']).optional() }).parse(req.query);
    const cat = await getOne(id);
    if (!cat) return reply.code(404).send({ error: 'Catégorie introuvable' });
    if (cat.rubricCount) return reply.code(409).send({ error: "Cet univers est utilisé par l'espace Kids : désactivez-le plutôt que de le supprimer", code: 'kids_rubric' });
    if (cat.children) return reply.code(409).send({ error: "Supprimez ou déplacez d'abord ses sous-catégories", code: 'has_children', children: cat.children });
    const relations = { talks: cat.mainCount, extraTalks: cat.extraCount, series: cat.seriesCount };
    const hasRelations = cat.mainCount + cat.extraCount + cat.seriesCount > 0;
    if (hasRelations && !q.moveTo && !q.detach) {
      return reply.code(409).send({ error: 'Cette catégorie contient des vidéos ou des séries : choisissez de les transférer ou de les détacher', code: 'has_relations', relations });
    }
    if (q.moveTo) {
      if (q.moveTo === id) return reply.code(400).send({ error: 'La catégorie de destination doit être différente' });
      const target = await getOne(q.moveTo);
      if (!target) return reply.code(404).send({ error: 'Catégorie de destination introuvable' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Trace de ce qui a été détaché (retour arrière possible à la main).
      await client.query(
        `INSERT INTO legacy_catalogue_backup(kind, talk_id, category_name)
           SELECT 'category_deleted', t.id, $2 FROM talks t WHERE t.category_id = $1
           UNION SELECT 'category_deleted_extra', tc.talk_id, $2 FROM talk_categories tc WHERE tc.category_id = $1`, [id, cat.name]);
      if (q.moveTo) {
        await client.query('UPDATE talks SET category_id = $2 WHERE category_id = $1', [id, q.moveTo]);
        await client.query('UPDATE series SET category_id = $2 WHERE category_id = $1', [id, q.moveTo]);
        await client.query('INSERT INTO talk_categories(talk_id, category_id) SELECT talk_id, $2 FROM talk_categories WHERE category_id = $1 ON CONFLICT DO NOTHING', [id, q.moveTo]);
        await client.query('DELETE FROM talk_categories tc USING talks t WHERE t.id = tc.talk_id AND t.category_id = tc.category_id'); // pas de doublon avec la principale
      }
      await client.query('UPDATE users SET favorite_categories = array_remove(favorite_categories, $1) WHERE $1 = ANY(favorite_categories)', [id]);
      await client.query('DELETE FROM categories WHERE id = $1', [id]); // talk_categories : cascade ; talks et series : SET NULL
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
    return { deleted: id, moved: q.moveTo ? relations : null, detached: q.moveTo ? null : relations };
  });

  // ───────────────────────── Vidéos d'une catégorie ─────────────────────────
  app.get('/categories/:id/talks', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!(await getOne(id))) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(req.query);
    return (await pool.query(
      `SELECT t.id, t.title, t.speaker, t.video_status AS "videoStatus", t.publication, (t.category_id = $1) AS "isMain"
         FROM talks t WHERE t.category_id = $1 OR EXISTS (SELECT 1 FROM talk_categories tc WHERE tc.talk_id = t.id AND tc.category_id = $1)
        ORDER BY lower(t.title) LIMIT $2`, [id, limit])).rows;
  });

  app.get('/categories/:id/candidates', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!(await getOne(id))) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query);
    return (await pool.query(
      `SELECT t.id, t.title, t.speaker FROM talks t
        WHERE t.category_id IS DISTINCT FROM $1 AND NOT EXISTS (SELECT 1 FROM talk_categories tc WHERE tc.talk_id = t.id AND tc.category_id = $1)
          AND ($2 = '' OR t.title ILIKE '%' || $2 || '%' OR t.speaker ILIKE '%' || $2 || '%')
        ORDER BY t.created_at DESC LIMIT 20`, [id, q])).rows;
  });

  // Associer / dissocier : une vidéo sans catégorie principale reçoit celle-ci ; sinon elle est ajoutée comme catégorie supplémentaire
  // (une vidéo peut figurer dans plusieurs catégories). Dissocier la principale promeut une catégorie supplémentaire s'il y en a une.
  app.post('/categories/:id/talks', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ add: z.array(z.guid()).max(200).default([]), remove: z.array(z.guid()).max(200).default([]) }).strict().parse(req.body);
    if (!(await getOne(id))) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const client = await pool.connect();
    let added = 0; let removed = 0;
    try {
      await client.query('BEGIN');
      if (b.add.length) {
        added = (await client.query('UPDATE talks SET category_id = $1 WHERE id = ANY($2::uuid[]) AND category_id IS NULL', [id, b.add])).rowCount;
        const r = await client.query(
          `INSERT INTO talk_categories(talk_id, category_id) SELECT t.id, $1 FROM talks t WHERE t.id = ANY($2::uuid[]) AND t.category_id IS DISTINCT FROM $1
             ON CONFLICT DO NOTHING`, [id, b.add]);
        added += r.rowCount;
      }
      if (b.remove.length) {
        removed = (await client.query('DELETE FROM talk_categories WHERE category_id = $1 AND talk_id = ANY($2::uuid[])', [id, b.remove])).rowCount;
        const main = await client.query('SELECT id FROM talks WHERE category_id = $1 AND id = ANY($2::uuid[])', [id, b.remove]);
        for (const { id: tid } of main.rows) {
          const next = (await client.query('SELECT category_id FROM talk_categories WHERE talk_id = $1 ORDER BY category_id LIMIT 1', [tid])).rows[0];
          await client.query('UPDATE talks SET category_id = $2 WHERE id = $1', [tid, next ? next.category_id : null]);
          if (next) await client.query('DELETE FROM talk_categories WHERE talk_id = $1 AND category_id = $2', [tid, next.category_id]);
          removed += 1;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
    return { added, removed };
  });
}
