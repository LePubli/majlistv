// Pages légales (mentions légales, CGV/CGU, confidentialité) : lecture publique en français, anglais ou arabe ; modification par les admins.
// Étape D : chaque page suit le modèle à jour (api/src/legalTemplates.js), rempli avec Admin → Paramètres → Informations légales,
// sauf si l'administrateur a saisi son propre texte (custom). La version française fait foi.
//   GET  /legal?lang=                     liste (titres dans la langue)
//   GET  /legal/:slug?lang=               page publique
//   GET  /admin/legal/:slug               admin : texte enregistré, modèle rempli, informations manquantes
//   PUT  /admin/legal/:slug               admin : texte personnalisé (fr obligatoire, en / ar facultatifs)
//   DELETE /admin/legal/:slug/custom      admin : revenir au modèle automatique
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
    return { ...rows[0], custom: true };
  });

  app.delete('/admin/legal/:slug/custom', adminOnly, async (req, reply) => {
    const { slug } = slugSchema.parse(req.params);
    if (!LEGAL_TEMPLATES[slug]) return reply.code(400).send({ error: "Cette page n'a pas de modèle automatique." });
    await pool.query('UPDATE legal_pages SET custom = false, updated_by = $2, updated_at = now() WHERE slug = $1', [slug, req.user.sub]);
    return { ok: true, custom: false };
  });

  // Preuves de consentement d'un utilisateur (en cas de litige).
  app.get('/admin/users/:id/consents', adminOnly, async (req) => {
    const { id } = z.object({ id: z.guid() }).parse(req.params);
    const { rows } = await pool.query(
      'SELECT kind, version, text, context, ip, created_at AS "createdAt" FROM consents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [id]);
    return rows;
  });
}
