// Coran (étape 45B).
//   GET  /quran/suras                          public : les 114 sourates (nombre de versets), état « prêt » ou non
//   GET  /quran/resources                      public : ressources activées avec leur source, licence et crédit
//   GET  /quran/suras/:n?lang=&translation=&translit=   public : versets (arabe + traduction + phonétique) ; « none » désactive
//   GET  /quran/tafsir/:slug/:n                public : commentaires d'une sourate
//   GET  /quran/search?q=&lang=                public : recherche dans le texte, les traductions et la phonétique
//   GET/POST /admin/quran/resources, PUT/DELETE /admin/quran/resources/:id, POST /admin/quran/resources/:id/import   administrateur
import { z } from 'zod';
import { pool } from '../../db.js';
import { SURAS, suraOf } from './suras.js';
import { KINDS, TOTAL_VERSES, arabicOf, checkReciterUrl, enabledResources, fetchBySura, fetchText, importRows, importTajweed, importWords, lang, parseContent, parseTajweed, parseWords, pick, publicMeta } from './lib.js';

const slugRe = /^[a-z0-9][a-z0-9_-]{1,59}$/;
const metaSchema = z.object({
  slug: z.string().regex(slugRe, 'Identifiant : minuscules, chiffres, - et _ (2 à 60 caractères).'),
  kind: z.enum(KINDS), lang: z.string().regex(/^[a-z]{2,3}$/, 'Langue sur 2 ou 3 lettres (fr, en, ar…).'),
  name: z.string().trim().min(2).max(120), author: z.string().trim().max(200).default(''),
  sourceUrl: z.string().trim().max(500).default(''), license: z.string().trim().max(300).default(''), credit: z.string().trim().max(300).default(''),
  enabled: z.boolean().default(false), position: z.number().int().min(0).max(1000).default(0),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const importSchema = z.object({ format: z.enum(['tanzil', 'json']), url: z.string().max(1000).optional(), content: z.string().max(40 * 1024 * 1024).optional() })
  .refine((b) => Boolean(b.url) !== Boolean(b.content), { message: 'Donnez soit une adresse, soit le contenu du fichier.' });

const reciterSchema = z.object({
  slug: z.string().regex(slugRe, 'Identifiant : minuscules, chiffres, - et _ (2 à 60 caractères).'),
  name: z.string().trim().min(2).max(120), urlTemplate: z.string().trim().min(10).max(500),
  sourceUrl: z.string().trim().max(500).default(''), license: z.string().trim().max(300).default(''), credit: z.string().trim().max(300).default(''),
  enabled: z.boolean().default(false), position: z.number().int().min(0).max(1000).default(0),
});
const reciterRow = (r) => ({
  id: r.id, slug: r.slug, name: r.name, urlTemplate: r.url_template, sourceUrl: r.source_url, license: r.license, credit: r.credit,
  enabled: r.enabled, position: r.position, origin: checkReciterUrl(r.url_template).origin || null,
});
const row = (r) => ({
  id: r.id, slug: r.slug, kind: r.kind, lang: r.lang, name: r.name, author: r.author, sourceUrl: r.source_url, license: r.license, credit: r.credit,
  enabled: r.enabled, position: r.position, verseCount: r.verse_count, importedAt: r.imported_at,
});
const esc = (s) => s.replace(/[\\%_]/g, '\\$&');
const stripMarks = (s) => s.replace(/[ً-ٰٟۖ-ۭـ]/g, '');

export default async function quranRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/quran/suras', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    const ar = arabicOf(await enabledResources());
    const counts = ar ? Object.fromEntries((await pool.query('SELECT sura, max(aya)::int AS n FROM quran_verses WHERE resource_id = $1 GROUP BY sura', [ar.id])).rows.map((r) => [r.sura, r.n])) : {};
    return { ready: Boolean(ar), suras: SURAS.map((s) => ({ ...s, verses: counts[s.n] || null })) };
  });

  app.get('/quran/resources', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return (await enabledResources()).map(publicMeta);
  });

  app.get('/quran/suras/:n', async (req, reply) => {
    const { n } = z.object({ n: z.coerce.number().int().min(1).max(114) }).parse(req.params);
    const q = z.object({ lang: z.string().max(10).optional(), translation: z.string().max(60).optional(), translit: z.string().max(60).optional(), words: z.enum(['0', '1']).optional(), tajweed: z.enum(['0', '1']).optional() }).parse(req.query);
    const list = await enabledResources();
    const ar = arabicOf(list);
    if (!ar) return reply.code(404).send({ error: 'Le texte du Coran n\'est pas encore disponible.' });
    const tr = pick(list, 'translation', q.translation, lang(q.lang));
    const ph = pick(list, 'transliteration', q.translit, lang(q.lang));
    const ids = [ar.id, tr?.id, ph?.id].filter(Boolean);
    const { rows } = await pool.query('SELECT resource_id, aya, text, notes FROM quran_verses WHERE sura = $1 AND resource_id = ANY($2) ORDER BY aya', [n, ids]);
    const by = (rid) => new Map(rows.filter((r) => r.resource_id === rid).map((r) => [r.aya, r.text]));
    const A = by(ar.id); const T = tr ? by(tr.id) : null; const P = ph ? by(ph.id) : null;
    const N = tr ? new Map(rows.filter((r) => r.resource_id === tr.id && r.notes).map((r) => [r.aya, r.notes])) : new Map();
    if (!A.size) return reply.code(404).send({ error: 'Cette sourate n\'est pas disponible.' });
    const wres = list.find((r) => r.kind === 'words'); const tres = list.find((r) => r.kind === 'tajweed');
    let wordsOut; let tajOut;
    if (wres && q.words === '1') wordsOut = Object.fromEntries((await pool.query('SELECT aya, words FROM quran_words WHERE resource_id = $1 AND sura = $2', [wres.id, n])).rows.map((r) => [r.aya, r.words]));
    if (tres && q.tajweed === '1') tajOut = Object.fromEntries((await pool.query('SELECT aya, marks FROM quran_tajweed WHERE resource_id = $1 AND sura = $2', [tres.id, n])).rows.map((r) => [r.aya, r.marks]));
    reply.header('cache-control', 'public, max-age=60');
    return {
      ...(wres ? { wordsMeta: publicMeta(wres) } : {}), ...(tres ? { tajweedMeta: publicMeta(tres) } : {}),
      ...(wordsOut ? { words: wordsOut } : {}), ...(tajOut ? { tajweed: tajOut } : {}),
      sura: suraOf(n),
      verses: [...A.keys()].sort((a, b) => a - b).map((aya) => ({ aya, ar: A.get(aya), ...(T ? { tr: T.get(aya) ?? null } : {}), ...(N.has(aya) ? { tn: N.get(aya) } : {}), ...(P ? { ph: P.get(aya) ?? null } : {}) })),
      text: publicMeta(ar), translation: tr ? publicMeta(tr) : null, transliteration: ph ? publicMeta(ph) : null,
      translations: list.filter((r) => r.kind === 'translation').map(publicMeta), transliterations: list.filter((r) => r.kind === 'transliteration').map(publicMeta),
      tafsirs: list.filter((r) => r.kind === 'tafsir').map(publicMeta),
    };
  });

  // Récitateurs : le navigateur lit le fichier directement chez la source (rien n'est copié ici).
  app.get('/quran/reciters', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    const { rows } = await pool.query('SELECT * FROM quran_reciters WHERE enabled ORDER BY position, id');
    return rows.map((r) => ({ slug: r.slug, name: r.name, urlTemplate: r.url_template, sourceUrl: r.source_url, license: r.license, credit: r.credit }));
  });

  app.get('/quran/tafsir/:slug/:n', async (req, reply) => {
    const { slug, n } = z.object({ slug: z.string().regex(slugRe), n: z.coerce.number().int().min(1).max(114) }).parse(req.params);
    const r = (await enabledResources()).find((x) => x.kind === 'tafsir' && x.slug === slug);
    if (!r) return reply.code(404).send({ error: 'Tafsir introuvable.' });
    const { rows } = await pool.query('SELECT aya, text FROM quran_verses WHERE resource_id = $1 AND sura = $2 ORDER BY aya', [r.id, n]);
    reply.header('cache-control', 'public, max-age=60');
    return { resource: publicMeta(r), items: rows };
  });

  app.get('/quran/search', async (req, reply) => {
    const { q, lang: l } = z.object({ q: z.string().trim().min(2).max(80), lang: z.string().max(10).optional() }).parse(req.query);
    const list = await enabledResources();
    const ar = arabicOf(list);
    if (!ar) return { results: [] };
    const searchable = list.filter((r) => ['text', 'translation', 'transliteration'].includes(r.kind)).map((r) => r.id);
    const isAr = /[؀-ۿ]/.test(q);
    const needle = `%${esc(isAr ? stripMarks(q) : q)}%`;
    const hits = (await pool.query(
      `SELECT DISTINCT v.sura, v.aya FROM quran_verses v JOIN quran_resources r ON r.id = v.resource_id
        WHERE v.resource_id = ANY($1) AND (CASE WHEN r.kind = 'text' THEN regexp_replace(v.text, '[ً-ٰٟۖ-ۭـ]', '', 'g') ELSE v.text END) ILIKE $2
        ORDER BY v.sura, v.aya LIMIT 40`, [searchable, needle])).rows;
    if (!hits.length) return { results: [] };
    const tr = pick(list, 'translation', undefined, lang(l));
    const ids = [ar.id, tr?.id].filter(Boolean);
    const { rows } = await pool.query(
      'SELECT resource_id, sura, aya, text FROM quran_verses WHERE resource_id = ANY($1) AND (sura, aya) IN (SELECT * FROM unnest($2::smallint[], $3::smallint[]))',
      [ids, hits.map((h) => h.sura), hits.map((h) => h.aya)]);
    const get = (rid, s, a) => rows.find((r) => r.resource_id === rid && r.sura === s && r.aya === a)?.text ?? null;
    return { results: hits.map((h) => ({ sura: h.sura, aya: h.aya, name: suraOf(h.sura).en, ar: get(ar.id, h.sura, h.aya), tr: tr ? get(tr.id, h.sura, h.aya) : null })) };
  });

  // ---- Administration -------------------------------------------------------------------------------------------------------
  app.get('/admin/quran/resources', adminOnly, async () => ({
    resources: (await pool.query('SELECT * FROM quran_resources ORDER BY position, id')).rows.map(row), totalExpected: TOTAL_VERSES,
  }));

  app.post('/admin/quran/resources', adminOnly, async (req, reply) => {
    const b = metaSchema.parse(req.body ?? {});
    const dup = await pool.query('SELECT 1 FROM quran_resources WHERE slug = $1', [b.slug]);
    if (dup.rowCount) return reply.code(409).send({ error: 'Cet identifiant existe déjà.' });
    const { rows } = await pool.query(
      `INSERT INTO quran_resources(slug, kind, lang, name, author, source_url, license, credit, enabled, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.slug, b.kind, b.lang, b.name, b.author, b.sourceUrl, b.license, b.credit, b.enabled, b.position]);
    req.auditSummary = `Coran : ressource « ${b.name} » (${b.kind}, ${b.lang}) créée`;
    return row(rows[0]);
  });

  app.put('/admin/quran/resources/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = metaSchema.omit({ slug: true, kind: true }).parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM quran_resources WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Ressource introuvable.' });
    if (b.enabled && !cur.verse_count) return reply.code(400).send({ error: 'Importez d\'abord le contenu avant d\'activer cette ressource.' });
    const { rows } = await pool.query(
      `UPDATE quran_resources SET lang=$2, name=$3, author=$4, source_url=$5, license=$6, credit=$7, enabled=$8, position=$9, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, b.lang, b.name, b.author, b.sourceUrl, b.license, b.credit, b.enabled, b.position]);
    req.auditSummary = `Coran : ressource « ${b.name} » ${b.enabled ? 'activée' : 'enregistrée'}`;
    return row(rows[0]);
  });

  app.delete('/admin/quran/resources/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM quran_resources WHERE id = $1 RETURNING name', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Ressource introuvable.' });
    req.auditSummary = `Coran : ressource « ${r.rows[0].name} » supprimée`;
    return { ok: true };
  });

  app.post('/admin/quran/resources/:id/import', { ...adminOnly, bodyLimit: 45 * 1024 * 1024 }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = importSchema.parse(req.body ?? {});
    const res = (await pool.query('SELECT * FROM quran_resources WHERE id = $1', [id])).rows[0];
    if (!res) return reply.code(404).send({ error: 'Ressource introuvable.' });
    let content = b.content;
    let parsed;
    if (res.kind === 'words' || res.kind === 'tajweed') {
      if (b.format !== 'json') return reply.code(400).send({ error: 'Ce type de ressource s\'importe en JSON.' });
      if (b.url) {
        try { content = await fetchText(b.url); } catch (e) { return reply.code(400).send({ error: `Téléchargement impossible : ${e.message}` }); }
      }
      let r;
      if (res.kind === 'words') r = parseWords(content);
      else {
        const ar = arabicOf(await enabledResources());
        if (!ar) return reply.code(400).send({ error: 'Importez et activez d\'abord le texte arabe : les couleurs du tajwid sont vérifiées contre lui.' });
        const len = new Map((await pool.query('SELECT sura, aya, text FROM quran_verses WHERE resource_id = $1', [ar.id])).rows.map((x) => [x.sura * 1000 + x.aya, [...x.text].length]));
        r = parseTajweed(content, len);
      }
      if (r.error) return reply.code(400).send({ error: r.error });
      if (res.kind === 'words') await importWords(res, r.rows); else await importTajweed(res, r.rows);
      const suras = new Set(r.rows.map((x) => x.sura)).size;
      req.auditSummary = `Coran : « ${res.name} » importé (${r.rows.length} versets, ${suras} sourates)`;
      return { imported: r.rows.length, skipped: r.skipped, suras, warning: r.skipped ? `${r.skipped} élément(s) écarté(s) (numérotation incomplète ou positions hors du texte).` : null };
    }
    if (b.url && b.format === 'json' && b.url.includes('{n}')) {
      // un fichier par sourate
      try { parsed = await fetchBySura(b.url); } catch (e) { return reply.code(400).send({ error: `Téléchargement impossible : ${e.message}` }); }
      const map = new Map(); for (const x of parsed.rows) map.set(x.sura * 1000 + x.aya, x);
      parsed = { rows: [...map.values()].sort((a, c) => a.sura - c.sura || a.aya - c.aya), skipped: parsed.skipped };
      if (!parsed.rows.length) return reply.code(400).send({ error: 'Aucun verset valide trouvé.' });
    } else {
      if (b.url) {
        try { content = await fetchText(b.url); } catch (e) { return reply.code(400).send({ error: `Téléchargement impossible : ${e.message}` }); }
      }
      parsed = parseContent(b.format, content);
    }
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    await importRows(res, parsed.rows);
    const suras = new Set(parsed.rows.map((r) => r.sura)).size;
    const warning = res.kind === 'text' && parsed.rows.length !== TOTAL_VERSES
      ? `Le texte contient ${parsed.rows.length} versets (le total habituel est ${TOTAL_VERSES}) : vérifiez le fichier.` : null;
    req.auditSummary = `Coran : « ${res.name} » importé (${parsed.rows.length} versets, ${suras} sourates)`;
    return { imported: parsed.rows.length, skipped: parsed.skipped, suras, warning };
  });

  // ---- Administration des récitateurs ------------------------------------------------------------------------------------------
  app.get('/admin/quran/reciters', adminOnly, async () => ({
    reciters: (await pool.query('SELECT * FROM quran_reciters ORDER BY position, id')).rows.map(reciterRow),
  }));

  app.post('/admin/quran/reciters', adminOnly, async (req, reply) => {
    const b = reciterSchema.parse(req.body ?? {});
    const chk = checkReciterUrl(b.urlTemplate);
    if (chk.error) return reply.code(400).send({ error: chk.error });
    if ((await pool.query('SELECT 1 FROM quran_reciters WHERE slug = $1', [b.slug])).rowCount) return reply.code(409).send({ error: 'Cet identifiant existe déjà.' });
    const { rows } = await pool.query(
      'INSERT INTO quran_reciters(slug, name, url_template, source_url, license, credit, enabled, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [b.slug, b.name, b.urlTemplate, b.sourceUrl, b.license, b.credit, b.enabled, b.position]);
    req.auditSummary = `Coran : récitateur « ${b.name} » créé`;
    return reciterRow(rows[0]);
  });

  app.put('/admin/quran/reciters/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = reciterSchema.omit({ slug: true }).parse(req.body ?? {});
    const chk = checkReciterUrl(b.urlTemplate);
    if (chk.error) return reply.code(400).send({ error: chk.error });
    const { rows } = await pool.query(
      'UPDATE quran_reciters SET name=$2, url_template=$3, source_url=$4, license=$5, credit=$6, enabled=$7, position=$8, updated_at=now() WHERE id=$1 RETURNING *',
      [id, b.name, b.urlTemplate, b.sourceUrl, b.license, b.credit, b.enabled, b.position]);
    if (!rows.length) return reply.code(404).send({ error: 'Récitateur introuvable.' });
    req.auditSummary = `Coran : récitateur « ${b.name} » ${b.enabled ? 'activé' : 'enregistré'}`;
    return reciterRow(rows[0]);
  });

  app.delete('/admin/quran/reciters/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM quran_reciters WHERE id = $1 RETURNING name', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Récitateur introuvable.' });
    req.auditSummary = `Coran : récitateur « ${r.rows[0].name} » supprimé`;
    return { ok: true };
  });
}
