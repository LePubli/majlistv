// Pages légales (mentions légales, CGV/CGU, confidentialité) : lecture publique en français, anglais ou arabe ; modification par les admins.
// Étape D : chaque page suit le modèle à jour (api/src/legalTemplates.js), rempli avec Admin → Paramètres → Informations légales,
// sauf si l'administrateur a saisi son propre texte (custom). La version française fait foi.
//   GET  /legal?lang=                     liste (titres dans la langue)
//   GET  /legal/:slug?lang=               page publique
//   GET  /admin/legal/:slug               admin : texte enregistré, modèle rempli, informations manquantes
//   PUT  /admin/legal/:slug               admin : texte personnalisé (fr obligatoire, en / ar facultatifs)
//   DELETE /admin/legal/:slug/custom      admin : revenir au modèle automatique
//   GET  /admin/legal/:slug/versions      admin : historique des textes personnalisés (sans le texte)
//   GET  /admin/legal/:slug/versions/:n   admin : un ancien texte en entier
//   POST /admin/legal/:slug/versions/:n/restore  admin : remet un ancien texte (devient une nouvelle version)
//   GET  /admin/legal-consents            admin : matrice de consentement (par type et version du texte accepté, sans identité)
//   GET  /admin/users/:id/consents        admin : preuves de consentement d'un membre
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting } from '../settings.js';
import { LEGAL_FIELDS, LEGAL_LANGS, LEGAL_SLUGS, LEGAL_TEMPLATES, fillTemplate } from '../legalTemplates.js';

/** Date des modèles actuels (affichée « Dernière mise à jour » pour une page qui suit le modèle). */
export const LEGAL_TEMPLATES_DATE = '2026-11-14T00:00:00.000Z';

const slugSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/) });
const langOf = (q) => (LEGAL_LANGS.includes(String(q?.lang || '').slice(0, 2)) ? String(q.lang).slice(0, 2) : 'fr');

/** Valeurs des modèles : réglages « Informations légales » + nom et adresse du site + durée de conservation des questions. */
export async function legalVars() {
  const vars = {};
  for (const [k, [setting]] of Object.entries(LEGAL_FIELDS)) vars[k] = String((await getSetting(setting)) ?? '').trim();
  vars.app = String((await getSetting('app_name')) || 'Mejliss TV');
  vars.site = String((await getSetting('web_url')) || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  let days = 90;
  try { days = Number(await getSetting('ask_keep_days')) || 90; } catch { /* module « Questions » absent */ }
  vars.askDays = String(days);
  return vars;
}

/** Page dans une langue : texte personnalisé (repli sur le français) ou modèle rempli. */
async function render(row, slug, lang, vars) {
  if (row?.custom) {
    const title = (lang !== 'fr' && row[`title_${lang}`]) || row.title;
    const body = (lang !== 'fr' && row[`body_${lang}`]) || row.body;
    return { slug, lang: body === row.body ? 'fr' : lang, title, body, custom: true, updatedAt: row.updated_at, missing: [] };
  }
  const tpl = LEGAL_TEMPLATES[slug];
  if (!tpl) return row ? { slug, lang: 'fr', title: row.title, body: row.body, custom: true, updatedAt: row.updated_at, missing: [] } : null;
  const t = tpl[lang] || tpl.fr;
  const { text, missing } = fillTemplate(t.body, vars || await legalVars(), lang);
  return { slug, lang, title: t.title, body: text, custom: false, updatedAt: LEGAL_TEMPLATES_DATE, missing };
}

/** Garde le texte enregistré comme nouvelle version (numéro suivant de la page). */
async function snapshot(slug, b, userId, restoredFrom) {
  const { rows } = await pool.query(
    `INSERT INTO legal_page_versions(slug, version, title, body, title_en, body_en, title_ar, body_ar, saved_by, restored_from)
     VALUES ($1, COALESCE((SELECT max(version) FROM legal_page_versions WHERE slug = $1), 0) + 1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING version`,
    [slug, b.title, b.body, b.titleEn || '', b.bodyEn || '', b.titleAr || '', b.bodyAr || '', userId, restoredFrom]);
  return rows[0].version;
}

export default async function legalRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/legal', async (req) => {
    const lang = langOf(req.query);
    const rows = (await pool.query('SELECT slug, title, title_en, title_ar, custom FROM legal_pages')).rows;
    const by = Object.fromEntries(rows.map((r) => [r.slug, r]));
    const slugs = [...new Set([...LEGAL_SLUGS, ...rows.map((r) => r.slug)])].sort();
    return slugs.map((slug) => {
      const r = by[slug];
      const title = r?.custom ? ((lang !== 'fr' && r[`title_${lang}`]) || r.title) : (LEGAL_TEMPLATES[slug]?.[lang]?.title || r?.title || slug);
      return { slug, title };
    });
  });

  app.get('/legal/:slug', async (req, reply) => {
    const { slug } = slugSchema.parse(req.params);
    const row = (await pool.query('SELECT * FROM legal_pages WHERE slug = $1', [slug])).rows[0];
    const page = await render(row, slug, langOf(req.query));
    if (!page) return reply.code(404).send({ error: 'Page introuvable' });
    const { missing, ...pub } = page; // la liste des informations manquantes n'est donnée qu'à l'admin
    return pub;
  });

  app.get('/admin/legal/:slug', adminOnly, async (req, reply) => {
    const { slug } = slugSchema.parse(req.params);
    const row = (await pool.query('SELECT * FROM legal_pages WHERE slug = $1', [slug])).rows[0];
    if (!row && !LEGAL_TEMPLATES[slug]) return reply.code(404).send({ error: 'Page introuvable' });
    const vars = await legalVars();
    const tpl = {};
    for (const l of LEGAL_LANGS) tpl[l] = LEGAL_TEMPLATES[slug] ? await render(null, slug, l, vars) : null;
    const missing = tpl.fr?.missing ?? [];
    return {
      slug, custom: Boolean(row?.custom), hasTemplate: Boolean(LEGAL_TEMPLATES[slug]),
      saved: row ? { title: row.title, body: row.body, titleEn: row.title_en, bodyEn: row.body_en, titleAr: row.title_ar, bodyAr: row.body_ar, updatedAt: row.updated_at } : null,
      template: Object.fromEntries(LEGAL_LANGS.map((l) => [l, tpl[l] ? { title: tpl[l].title, body: tpl[l].body } : null])),
      missing: missing.map((k) => ({ key: k, setting: LEGAL_FIELDS[k][0], label: LEGAL_FIELDS[k][1] })),
    };
  });

  app.put('/admin/legal/:slug', adminOnly, async (req) => {
    const { slug } = slugSchema.parse(req.params);
    const opt = (n) => z.string().trim().max(n).default('');
    const b = z.object({
      title: z.string().trim().min(1).max(120), body: z.string().max(60000),
      titleEn: opt(120), bodyEn: opt(60000), titleAr: opt(120), bodyAr: opt(60000),
    }).parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO legal_pages(slug, title, body, title_en, body_en, title_ar, body_ar, custom, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, title_en = EXCLUDED.title_en, body_en = EXCLUDED.body_en,
         title_ar = EXCLUDED.title_ar, body_ar = EXCLUDED.body_ar, custom = true, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING slug, title, body, updated_at AS "updatedAt"`,
      [slug, b.title, b.body, b.titleEn, b.bodyEn, b.titleAr, b.bodyAr, req.user.sub]);
    const version = await snapshot(slug, b, req.user.sub, null);
    return { ...rows[0], custom: true, version };
  });

  app.delete('/admin/legal/:slug/custom', adminOnly, async (req, reply) => {
    const { slug } = slugSchema.parse(req.params);
    if (!LEGAL_TEMPLATES[slug]) return reply.code(400).send({ error: "Cette page n'a pas de modèle automatique." });
    await pool.query('UPDATE legal_pages SET custom = false, updated_by = $2, updated_at = now() WHERE slug = $1', [slug, req.user.sub]);
    return { ok: true, custom: false };
  });

  app.get('/admin/legal/:slug/versions', adminOnly, async (req) => {
    const { slug } = slugSchema.parse(req.params);
    const { rows } = await pool.query(
      `SELECT v.version, v.title, v.restored_from AS "restoredFrom", v.created_at AS "createdAt", u.name AS "author",
              length(v.body) AS chars, (v.body_en <> '') AS en, (v.body_ar <> '') AS ar
         FROM legal_page_versions v LEFT JOIN users u ON u.id = v.saved_by
        WHERE v.slug = $1 ORDER BY v.version DESC LIMIT 100`, [slug]);
    return rows;
  });

  const versionParams = z.object({ slug: slugSchema.shape.slug, n: z.coerce.number().int().min(1) });

  app.get('/admin/legal/:slug/versions/:n', adminOnly, async (req, reply) => {
    const { slug, n } = versionParams.parse(req.params);
    const row = (await pool.query(
      `SELECT version, title, body, title_en AS "titleEn", body_en AS "bodyEn", title_ar AS "titleAr", body_ar AS "bodyAr", created_at AS "createdAt"
         FROM legal_page_versions WHERE slug = $1 AND version = $2`, [slug, n])).rows[0];
    return row || reply.code(404).send({ error: 'Version introuvable' });
  });

  app.post('/admin/legal/:slug/versions/:n/restore', adminOnly, async (req, reply) => {
    const { slug, n } = versionParams.parse(req.params);
    const v = (await pool.query(
      `SELECT title, body, title_en AS "titleEn", body_en AS "bodyEn", title_ar AS "titleAr", body_ar AS "bodyAr"
         FROM legal_page_versions WHERE slug = $1 AND version = $2`, [slug, n])).rows[0];
    if (!v) return reply.code(404).send({ error: 'Version introuvable' });
    await pool.query(
      `INSERT INTO legal_pages(slug, title, body, title_en, body_en, title_ar, body_ar, custom, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, title_en = EXCLUDED.title_en, body_en = EXCLUDED.body_en,
         title_ar = EXCLUDED.title_ar, body_ar = EXCLUDED.body_ar, custom = true, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [slug, v.title, v.body, v.titleEn, v.bodyEn, v.titleAr, v.bodyAr, req.user.sub]);
    const version = await snapshot(slug, v, req.user.sub, n);
    req.auditSummary = `Page légale « ${slug} » : version ${n} remise en place (devient la version ${version})`;
    return { ok: true, version, restoredFrom: n };
  });

  // Matrice de consentement : combien d'acceptations par type et par version du texte (aucune identité, aucune adresse IP).
  app.get('/admin/legal-consents', adminOnly, async () => {
    const { rows } = await pool.query(
      `SELECT kind, version, count(*)::int AS total, count(DISTINCT COALESCE(user_id::text, email))::int AS members,
              min(created_at) AS "first", max(created_at) AS "last"
         FROM consents GROUP BY kind, version ORDER BY kind, max(created_at) DESC`);
    const total = (await pool.query('SELECT count(*)::int AS n FROM consents')).rows[0].n;
    return { total, rows };
  });

  // Preuves de consentement d'un utilisateur (en cas de litige).
  app.get('/admin/users/:id/consents', adminOnly, async (req) => {
    const { id } = z.object({ id: z.guid() }).parse(req.params);
    const { rows } = await pool.query(
      'SELECT kind, version, text, context, ip, created_at AS "createdAt" FROM consents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [id]);
    return rows;
  });
}
