// Ouvrages (étape 25) : fiche, éditions par langue (PDF ou liens boutique), rattachement aux conférences et séries.
//  - Public : liste et fiche des ouvrages publiés, ouvrages d'une conférence / d'une série.
//  - Membres Apprentissage : lien de téléchargement personnel à durée limitée ; le PDF est filigrané (e-mail + date) à chaque téléchargement.
//  - Studio : création, couverture, PDF (envoi direct vers le stockage), « droits confirmés », liens boutique, rattachements, publication.
// Un PDF n'est jamais diffusé tant que la case « droits confirmés » n'est pas cochée.
import { z } from 'zod';
import { pool } from '../db.js';
import { getNumber, getSetting } from '../settings.js';
import { hasLearningTier } from '../access.js';
import { visibleSql } from '../visibility.js';
import { storage, presignGet, presignPut, putObject, deleteObject, headObject, getObjectBuffer } from '../storage.js';
import { watermarkPdf, inspectPdf, signDownload, verifyDownload } from '../books.js';

const idSchema = z.object({ id: z.string().uuid() });
const langSchema = z.string().regex(/^[a-z]{2,3}$/);
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const patchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  author: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  published: z.boolean().optional(),
  talkIds: z.array(z.string().uuid()).max(100).optional(),
  seriesIds: z.array(z.string().uuid()).max(100).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });

export default async function bookRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const auth = { preHandler: app.authenticate };
  const off = (reply) => reply.code(503).send({ error: 'Stockage non configuré' });
  const coverUrl = async (b) => (b.cover_key ? presignGet(b.cover_key) : null);

  // Éditions publiques d'un ouvrage : PDF (si droits confirmés) et liens boutique, regroupés par langue.
  async function editions(bookId) {
    const [f, l] = await Promise.all([
      pool.query('SELECT lang, pages, size_bytes FROM book_files WHERE book_id = $1 AND rights_confirmed ORDER BY lang', [bookId]),
      pool.query('SELECT id, lang, label, url FROM book_links WHERE book_id = $1 ORDER BY lang, position, label', [bookId]),
    ]);
    const by = new Map();
    const get = (lang) => { if (!by.has(lang)) by.set(lang, { lang, pdf: null, links: [] }); return by.get(lang); };
    for (const r of f.rows) get(r.lang).pdf = { pages: r.pages, sizeBytes: Number(r.size_bytes) };
    for (const r of l.rows) get(r.lang).links.push({ id: r.id, label: r.label, url: r.url });
    return [...by.values()].sort((a, b) => a.lang.localeCompare(b.lang));
  }
  const HAS_EDITION = `(EXISTS (SELECT 1 FROM book_files f WHERE f.book_id = b.id AND f.rights_confirmed) OR EXISTS (SELECT 1 FROM book_links l WHERE l.book_id = b.id))`;
  const LANGS = `(SELECT COALESCE(array_agg(DISTINCT x.lang ORDER BY x.lang), '{}') FROM (
      SELECT f.lang FROM book_files f WHERE f.book_id = b.id AND f.rights_confirmed UNION SELECT l.lang FROM book_links l WHERE l.book_id = b.id) x)`;
  const card = async (b) => ({ id: b.id, title: b.title, author: b.author, summary: b.description.replace(/\s+/g, ' ').slice(0, 200), coverUrl: await coverUrl(b), langs: b.langs });

  // ------------------------------------------------------------------ Public
  app.get('/books', async () => {
    const { rows } = await pool.query(
      `SELECT b.*, ${LANGS} AS langs FROM books b WHERE b.published AND ${HAS_EDITION} ORDER BY b.updated_at DESC LIMIT 200`);
    return Promise.all(rows.map(card));
  });

  app.get('/books/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query('SELECT b.* FROM books b WHERE b.id = $1 AND b.published', [id]);
    const b = rows[0];
    if (!b) return reply.code(404).send({ error: 'Ouvrage introuvable' });
    const eds = await editions(id);
    if (!eds.length) return reply.code(404).send({ error: 'Ouvrage introuvable' });
    const [talks, series, viewer] = await Promise.all([
      pool.query(`SELECT t.id, t.title FROM book_talks bt JOIN talks t ON t.id = bt.talk_id WHERE bt.book_id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} ORDER BY t.title`, [id]),
      pool.query('SELECT s.id, s.title FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = $1 AND s.published ORDER BY s.title', [id]),
      app.optionalUser(req),
    ]);
    return {
      id: b.id, title: b.title, author: b.author, description: b.description, coverUrl: await coverUrl(b), updatedAt: b.updated_at,
      editions: eds, talks: talks.rows, series: series.rows,
      canDownload: viewer ? await hasLearningTier(viewer.sub) : false, loggedIn: Boolean(viewer),
    };
  });

  // Ouvrages liés à une conférence (directement ou par sa série) / à une série.
  app.get('/talks/:id/books', async (req) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (b.id) b.*, ${LANGS} AS langs FROM books b
        WHERE b.published AND ${HAS_EDITION} AND (
          EXISTS (SELECT 1 FROM book_talks bt WHERE bt.book_id = b.id AND bt.talk_id = $1)
          OR EXISTS (SELECT 1 FROM book_series bs JOIN series_episodes e ON e.series_id = bs.series_id WHERE bs.book_id = b.id AND e.talk_id = $1))
        ORDER BY b.id LIMIT 10`, [id]);
    return Promise.all(rows.map(card));
  });
  app.get('/series/:id/books', async (req) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(
      `SELECT b.*, ${LANGS} AS langs FROM books b JOIN book_series bs ON bs.book_id = b.id AND bs.series_id = $1
        WHERE b.published AND ${HAS_EDITION} ORDER BY b.title LIMIT 10`, [id]);
    return Promise.all(rows.map(card));
  });

  // Lien de téléchargement personnel (Apprentissage), valable quelques minutes.
  app.post('/books/:id/download-link', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lang } = z.object({ lang: langSchema }).parse(req.body ?? {});
    if (!(await hasLearningTier(req.user.sub))) return reply.code(403).send({ error: "Le téléchargement fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });
    const f = (await pool.query(
      `SELECT 1 FROM book_files f JOIN books b ON b.id = f.book_id WHERE f.book_id = $1 AND f.lang = $2 AND f.rights_confirmed AND b.published`, [id, lang])).rows[0];
    if (!f) return reply.code(404).send({ error: "Ce PDF n'est pas disponible" });
    const max = await getNumber('book_download_daily_max');
    const n = (await pool.query("SELECT count(*)::int AS n FROM book_downloads WHERE user_id = $1 AND created_at > now() - interval '24 hours'", [req.user.sub])).rows[0].n;
    if (n >= max) return reply.code(429).send({ error: `Limite de ${max} téléchargements par jour atteinte`, code: 'daily_limit' });
    const minutes = await getNumber('book_link_minutes');
    return { url: `/books/download?t=${signDownload({ b: id, l: lang, u: req.user.sub }, minutes)}`, expiresInMinutes: minutes };
  });

  // Le PDF filigrané (adresse e-mail + date) est fabriqué à la demande ; rien n'est stocké.
  app.get('/books/download', async (req, reply) => {
    const d = verifyDownload(req.query.t);
    if (!d) return reply.code(410).send({ error: 'Lien expiré : demandez-en un nouveau depuis la page de l’ouvrage', code: 'expired' });
    if (!storage) return off(reply);
    if (!(await hasLearningTier(d.u))) return reply.code(403).send({ error: "Réservé à l'offre Mejliss Apprentissage", code: 'learning_required' });
    const { rows } = await pool.query(
      `SELECT f.file_key, b.title, u.email FROM book_files f JOIN books b ON b.id = f.book_id, users u
        WHERE f.book_id = $1 AND f.lang = $2 AND f.rights_confirmed AND b.published AND u.id = $3 AND u.disabled_at IS NULL`, [d.b, d.l, d.u]);
    const r = rows[0];
    if (!r) return reply.code(404).send({ error: "Ce PDF n'est plus disponible" });
    const date = new Date().toISOString().slice(0, 10);
    const out = await watermarkPdf(await getObjectBuffer(r.file_key), r.email, date);
    await pool.query('INSERT INTO book_downloads(user_id, book_id, lang) VALUES ($1, $2, $3)', [d.u, d.b, d.l]);
    const name = `${r.title}-${d.l}`.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'ouvrage';
    reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${name}.pdf"`).header('cache-control', 'private, no-store');
    return reply.send(out);
  });

  // ------------------------------------------------------------------ Studio
  async function owned(req, reply, id) {
    const { rows } = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
    const b = rows[0];
    if (!b || (req.user.role !== 'admin' && b.owner_id !== req.user.sub)) {
      reply.code(404).send({ error: 'Ouvrage introuvable' });
      return null;
    }
    return b;
  }
  async function full(b) {
    const [files, links, talks, series] = await Promise.all([
      pool.query('SELECT lang, file_name, size_bytes, pages, rights_confirmed, rights_at, created_at FROM book_files WHERE book_id = $1 ORDER BY lang', [b.id]),
      pool.query('SELECT id, lang, label, url FROM book_links WHERE book_id = $1 ORDER BY lang, position, label', [b.id]),
      pool.query('SELECT t.id, t.title FROM book_talks bt JOIN talks t ON t.id = bt.talk_id WHERE bt.book_id = $1 ORDER BY t.title', [b.id]),
      pool.query('SELECT s.id, s.title FROM book_series bs JOIN series s ON s.id = bs.series_id WHERE bs.book_id = $1 ORDER BY s.title', [b.id]),
    ]);
    return {
      id: b.id, title: b.title, author: b.author, description: b.description, published: b.published, coverUrl: await coverUrl(b), updatedAt: b.updated_at,
      files: files.rows.map((f) => ({ lang: f.lang, fileName: f.file_name, sizeBytes: Number(f.size_bytes), pages: f.pages, rightsConfirmed: f.rights_confirmed, rightsAt: f.rights_at })),
      links: links.rows, talks: talks.rows, series: series.rows,
    };
  }

  app.get('/studio/books', organizer, async (req) => {
    const admin = req.user.role === 'admin';
    const { rows } = await pool.query(
      `SELECT b.*, ${LANGS} AS langs, (SELECT count(*)::int FROM book_downloads d WHERE d.book_id = b.id) AS downloads FROM books b
        WHERE ($1 OR b.owner_id = $2) ORDER BY b.updated_at DESC LIMIT 200`, [admin, req.user.sub]);
    return Promise.all(rows.map(async (b) => ({ id: b.id, title: b.title, author: b.author, published: b.published, coverUrl: await coverUrl(b), langs: b.langs, downloads: b.downloads, updatedAt: b.updated_at })));
  });

  app.post('/studio/books', organizer, async (req, reply) => {
    const b = z.object({ title: z.string().trim().min(1).max(200), author: z.string().trim().max(200).default(''), description: z.string().trim().max(5000).default('') }).parse(req.body ?? {});
    const { rows } = await pool.query('INSERT INTO books(owner_id, title, author, description) VALUES ($1, $2, $3, $4) RETURNING *', [req.user.sub, b.title, b.author, b.description]);
    return reply.code(201).send(await full(rows[0]));
  });

  app.get('/studio/books/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = await owned(req, reply, id);
    if (!b) return;
    return full(b);
  });

  // Conférences / séries que l'organisateur peut rattacher (les siennes ; toutes pour un admin).
  app.get('/studio/books-targets', organizer, async (req) => {
    const admin = req.user.role === 'admin';
    const [t, s] = await Promise.all([
      pool.query('SELECT id, title FROM talks WHERE ($1 OR organizer_id = $2) ORDER BY created_at DESC LIMIT 500', [admin, req.user.sub]),
      pool.query('SELECT id, title FROM series WHERE ($1 OR owner_id = $2) ORDER BY created_at DESC LIMIT 200', [admin, req.user.sub]),
    ]);
    return { talks: t.rows, series: s.rows };
  });

  app.patch('/studio/books/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const body = patchBody.parse(req.body ?? {});
    const b = await owned(req, reply, id);
    if (!b) return;
    const admin = req.user.role === 'admin';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (body.published === true && !(await editions(id)).length) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Ajoutez au moins un PDF (droits confirmés) ou un lien boutique avant de publier', code: 'no_edition' });
      }
      await client.query(
        `UPDATE books SET title = COALESCE($2, title), author = COALESCE($3, author), description = COALESCE($4, description), published = COALESCE($5, published), updated_at = now() WHERE id = $1`,
        [id, body.title ?? null, body.author ?? null, body.description ?? null, body.published ?? null]);
      if (body.talkIds) {
        const ok = (await client.query('SELECT id FROM talks WHERE id = ANY($1::uuid[]) AND ($2 OR organizer_id = $3)', [body.talkIds, admin, req.user.sub])).rows.map((r) => r.id);
        await client.query('DELETE FROM book_talks WHERE book_id = $1', [id]);
        if (ok.length) await client.query('INSERT INTO book_talks(book_id, talk_id) SELECT $1, unnest($2::uuid[])', [id, ok]);
      }
      if (body.seriesIds) {
        const ok = (await client.query('SELECT id FROM series WHERE id = ANY($1::uuid[]) AND ($2 OR owner_id = $3)', [body.seriesIds, admin, req.user.sub])).rows.map((r) => r.id);
        await client.query('DELETE FROM book_series WHERE book_id = $1', [id]);
        if (ok.length) await client.query('INSERT INTO book_series(book_id, series_id) SELECT $1, unnest($2::uuid[])', [id, ok]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return full((await pool.query('SELECT * FROM books WHERE id = $1', [id])).rows[0]);
  });

  app.delete('/studio/books/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = await owned(req, reply, id);
    if (!b) return;
    const keys = (await pool.query('SELECT file_key FROM book_files WHERE book_id = $1', [id])).rows.map((r) => r.file_key);
    await pool.query('DELETE FROM books WHERE id = $1', [id]);
    if (storage) for (const k of [...keys, b.cover_key].filter(Boolean)) await deleteObject(k).catch(() => {});
    return reply.code(204).send();
  });

  // Couverture (JPEG / PNG / WebP en data-URL, 2,5 Mo max).
  app.post('/studio/books/:id/cover', { ...organizer, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { image } = z.object({ image: z.string().max(3_500_000) }).strict().parse(req.body ?? {});
    const b = await owned(req, reply, id);
    if (!b) return;
    if (!storage) return off(reply);
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Image JPEG, PNG ou WebP attendue' });
    const buf = Buffer.from(m[2], 'base64');
    const magic = (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
      || (m[1] === 'image/png' && buf.subarray(1, 4).toString() === 'PNG')
      || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!magic || buf.length > 2.5 * 1024 * 1024) return reply.code(400).send({ error: 'Image invalide ou trop lourde (2,5 Mo maximum)' });
    const key = `books/${id}/cover-${Date.now()}.${IMG_TYPES[m[1]]}`;
    await putObject(key, buf, m[1]);
    await pool.query('UPDATE books SET cover_key = $2, updated_at = now() WHERE id = $1', [id, key]);
    if (b.cover_key) await deleteObject(b.cover_key).catch(() => {});
    return reply.code(201).send({ coverUrl: await presignGet(key) });
  });

  // PDF d'une langue : 1) lien d'envoi direct navigateur → stockage, 2) confirmation (vérification du fichier + case « droits confirmés »).
  app.post('/studio/books/:id/pdf/:lang/upload-url', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const lang = langSchema.parse(req.params.lang);
    const b = await owned(req, reply, id);
    if (!b) return;
    if (!storage) return off(reply);
    const { size } = z.object({ size: z.number().int().positive().optional() }).parse(req.body ?? {});
    const max = (await getNumber('book_pdf_max_mb')) * 1024 * 1024;
    if (size && size > max) return reply.code(400).send({ error: `PDF trop lourd (${Math.round(max / 1048576)} Mo maximum)`, code: 'too_big' });
    const key = `books/${id}/${lang}-${Date.now()}.pdf`;
    return { key, url: await presignPut(key, 'application/pdf'), maxBytes: max };
  });

  app.post('/studio/books/:id/pdf/:lang/confirm', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const lang = langSchema.parse(req.params.lang);
    const body = z.object({ key: z.string().min(1).max(300), fileName: z.string().trim().max(255).default(''), rightsConfirmed: z.boolean() }).parse(req.body ?? {});
    const b = await owned(req, reply, id);
    if (!b) return;
    if (!storage) return off(reply);
    if (!body.rightsConfirmed) return reply.code(400).send({ error: 'Cochez « droits confirmés » : vous devez avoir le droit de diffuser ce PDF', code: 'rights_required' });
    if (!body.key.startsWith(`books/${id}/${lang}-`) || !body.key.endsWith('.pdf')) return reply.code(400).send({ error: 'Fichier inattendu' });
    const drop = () => deleteObject(body.key).catch(() => {});
    let size;
    try { size = Number((await headObject(body.key)).ContentLength); } catch { return reply.code(400).send({ error: "Le fichier n'a pas été reçu : recommencez l'envoi", code: 'missing' }); }
    const max = (await getNumber('book_pdf_max_mb')) * 1024 * 1024;
    if (size > max) { await drop(); return reply.code(400).send({ error: `PDF trop lourd (${Math.round(max / 1048576)} Mo maximum)`, code: 'too_big' }); }
    let info;
    try { info = await inspectPdf(await getObjectBuffer(body.key)); } catch (err) { await drop(); return reply.code(400).send({ error: err.message, code: 'bad_pdf' }); }
    const old = (await pool.query('SELECT file_key FROM book_files WHERE book_id = $1 AND lang = $2', [id, lang])).rows[0];
    await pool.query(
      `INSERT INTO book_files(book_id, lang, file_key, file_name, size_bytes, pages, rights_confirmed, rights_by, rights_at) VALUES ($1, $2, $3, $4, $5, $6, true, $7, now())
       ON CONFLICT (book_id, lang) DO UPDATE SET file_key = $3, file_name = $4, size_bytes = $5, pages = $6, rights_confirmed = true, rights_by = $7, rights_at = now(), created_at = now()`,
      [id, lang, body.key, body.fileName, size, info.pages, req.user.sub]);
    await pool.query('UPDATE books SET updated_at = now() WHERE id = $1', [id]);
    if (old && old.file_key !== body.key) await deleteObject(old.file_key).catch(() => {});
    return reply.code(201).send(await full((await pool.query('SELECT * FROM books WHERE id = $1', [id])).rows[0]));
  });

  // Retirer la diffusion d'un PDF sans le supprimer (droits remis en cause), ou la rétablir.
  app.patch('/studio/books/:id/pdf/:lang', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const lang = langSchema.parse(req.params.lang);
    const { rightsConfirmed } = z.object({ rightsConfirmed: z.boolean() }).parse(req.body ?? {});
    const b = await owned(req, reply, id);
    if (!b) return;
    const r = await pool.query('UPDATE book_files SET rights_confirmed = $3, rights_by = $4, rights_at = now() WHERE book_id = $1 AND lang = $2', [id, lang, rightsConfirmed, req.user.sub]);
    if (!r.rowCount) return reply.code(404).send({ error: 'PDF introuvable' });
    if (!rightsConfirmed && b.published && !(await editions(id)).length) await pool.query('UPDATE books SET published = false WHERE id = $1', [id]); // plus rien à diffuser
    await pool.query('UPDATE books SET updated_at = now() WHERE id = $1', [id]);
    return full((await pool.query('SELECT * FROM books WHERE id = $1', [id])).rows[0]);
  });

  app.delete('/studio/books/:id/pdf/:lang', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const lang = langSchema.parse(req.params.lang);
    const b = await owned(req, reply, id);
    if (!b) return;
    const row = (await pool.query('DELETE FROM book_files WHERE book_id = $1 AND lang = $2 RETURNING file_key', [id, lang])).rows[0];
    if (!row) return reply.code(404).send({ error: 'PDF introuvable' });
    if (storage) await deleteObject(row.file_key).catch(() => {});
    if (b.published && !(await editions(id)).length) await pool.query('UPDATE books SET published = false WHERE id = $1', [id]);
    return reply.code(204).send();
  });

  // Liens boutique.
  const linkBody = z.object({ lang: langSchema, label: z.string().trim().min(1).max(80), url: z.string().trim().max(1000).url().refine((u) => /^https?:\/\//i.test(u), 'Adresse http(s) attendue') });
  app.post('/studio/books/:id/links', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const body = linkBody.parse(req.body ?? {});
    if (!(await owned(req, reply, id))) return;
    const n = (await pool.query('SELECT count(*)::int AS n FROM book_links WHERE book_id = $1 AND lang = $2', [id, body.lang])).rows[0].n;
    if (n >= 10) return reply.code(400).send({ error: '10 liens par langue au plus' });
    const { rows } = await pool.query('INSERT INTO book_links(book_id, lang, label, url, position) VALUES ($1, $2, $3, $4, $5) RETURNING id, lang, label, url', [id, body.lang, body.label, body.url, n]);
    await pool.query('UPDATE books SET updated_at = now() WHERE id = $1', [id]);
    return reply.code(201).send(rows[0]);
  });
  app.delete('/studio/books/:id/links/:lid', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lid } = z.object({ lid: z.string().uuid() }).parse(req.params);
    const b = await owned(req, reply, id);
    if (!b) return;
    const r = await pool.query('DELETE FROM book_links WHERE id = $1 AND book_id = $2', [lid, id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Lien introuvable' });
    if (b.published && !(await editions(id)).length) await pool.query('UPDATE books SET published = false WHERE id = $1', [id]);
    await pool.query('UPDATE books SET updated_at = now() WHERE id = $1', [id]);
    return reply.code(204).send();
  });
}
