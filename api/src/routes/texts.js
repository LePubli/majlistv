// Étape I2 — Textes modifiables (Admin → Textes).
//
// Les textes d'origine vivent dans web/lib/i18n.js (1 562 clés × fr / en / ar). Cette API ne garde que les textes
// modifiés (table site_texts) ; le site les superpose aux textes d'origine à chaque page.
//
// Public :
//   GET    /texts                       { version, texts: { fr: {clé: texte}, en: {...}, ar: {...} } }
// Administrateur :
//   GET    /admin/texts                 liste des textes modifiés [{ key, lang, value, updatedAt }]
//   PUT    /admin/texts                 { changes: [{ key, lang, value }] } — value = null : rétablir l'original
//   DELETE /admin/texts?lang=fr         rétablir TOUS les textes d'origine (d'une langue, ou des trois sans ?lang)
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';

const LANGS = ['fr', 'en', 'ar'];
const MAX_CHANGES = 1000; // par envoi
const MAX_ROWS = 8000;    // garde-fou : 3 langues × ~1 600 clés = 4 800 au maximum en usage normal

let cache = null;
export const resetTextsCache = () => { cache = null; };

// Textes modifiés regroupés par langue + « version » (change dès qu'un texte change).
export async function siteTexts() {
  if (cache) return cache;
  const rows = (await pool.query('SELECT key, lang, value FROM site_texts ORDER BY lang, key')).rows;
  const texts = { fr: {}, en: {}, ar: {} };
  for (const r of rows) texts[r.lang][r.key] = r.value;
  cache = { version: crypto.createHash('sha1').update(JSON.stringify(texts)).digest('hex').slice(0, 12), texts };
  return cache;
}

const change = z.object({
  key: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/, 'Clé invalide'),
  lang: z.enum(LANGS),
  // Un texte vide n'a pas de sens (le site afficherait un trou) : pour revenir à l'original on envoie null.
  value: z.string().max(2000, 'Texte trop long (2000 caractères maximum)').nullable(),
});

export default async function textsRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };

  app.get('/texts', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=10');
    return siteTexts();
  });

  app.get('/admin/texts', admin, async () => {
    const rows = (await pool.query('SELECT key, lang, value, updated_at FROM site_texts ORDER BY key, lang')).rows;
    return rows.map((r) => ({ key: r.key, lang: r.lang, value: r.value, updatedAt: r.updated_at }));
  });

  app.put('/admin/texts', admin, async (req, reply) => {
    const body = z.object({ changes: z.array(change).min(1).max(MAX_CHANGES) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message || 'Requête invalide', issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    // Un texte contenant seulement des espaces ou un caractère de contrôle est refusé ; les retours à la ligne sont permis.
    const bad = [];
    body.data.changes.forEach((c, i) => {
      if (c.value === null) return;
      if (!c.value.trim()) bad.push({ index: i, key: c.key, lang: c.lang, error: 'Texte vide' });
      else if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(c.value)) bad.push({ index: i, key: c.key, lang: c.lang, error: 'Caractère de contrôle interdit' });
    });
    if (bad.length) return reply.code(400).send({ error: 'Certains textes sont refusés', errors: bad });
    // Dernier mot gagne si une même (clé, langue) est envoyée deux fois.
    const last = new Map(body.data.changes.map((c) => [c.lang + '\u0000' + c.key, c]));
    const client = await pool.connect();
    let set = 0, restored = 0;
    try {
      await client.query('BEGIN');
      for (const c of last.values()) {
        if (c.value === null) {
          restored += (await client.query('DELETE FROM site_texts WHERE key = $1 AND lang = $2', [c.key, c.lang])).rowCount;
        } else {
          await client.query(
            `INSERT INTO site_texts (key, lang, value, updated_by) VALUES ($1, $2, $3, $4)
             ON CONFLICT (key, lang) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
            [c.key, c.lang, c.value, req.user.sub]);
          set++;
        }
      }
      const total = Number((await client.query('SELECT count(*) FROM site_texts')).rows[0].count);
      if (total > MAX_ROWS) { await client.query('ROLLBACK'); return reply.code(400).send({ error: `Trop de textes modifiés (${MAX_ROWS} au maximum)` }); }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
    resetTextsCache();
    req.auditSummary = `Textes : ${set} modifié(s), ${restored} rétabli(s) à l'original`;
    return { ok: true, set, restored, version: (await siteTexts()).version };
  });

  app.delete('/admin/texts', admin, async (req, reply) => {
    const q = z.object({ lang: z.enum(LANGS).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'Langue inconnue' });
    const n = q.data.lang
      ? (await pool.query('DELETE FROM site_texts WHERE lang = $1', [q.data.lang])).rowCount
      : (await pool.query('DELETE FROM site_texts')).rowCount;
    resetTextsCache();
    req.auditSummary = `Textes d'origine rétablis (${n} texte(s)${q.data.lang ? ', langue ' + q.data.lang : ''})`;
    return { ok: true, restored: n };
  });
}
