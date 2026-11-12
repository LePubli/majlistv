// Audyn — étape 1 : socle et gestion.
//  Studio (administrateur) : liste, création, modification, suppression ; couverture ; envoi des chapitres (multipart direct navigateur → stockage) ;
//    ordre et titres des chapitres ; journal des attestations de droits.
//   GET /studio/audyn · POST /studio/audyn · GET|PATCH|DELETE /studio/audyn/:id · POST /studio/audyn/:id/cover-url · POST /studio/audyn/:id/cover
//   POST /studio/audyn/:id/uploads · POST /studio/audyn/uploads/:uid/complete · DELETE /studio/audyn/uploads/:uid
//   PATCH|DELETE /studio/audyn/:id/chapters/:cid · PUT /studio/audyn/:id/chapters-order · GET /studio/audyn-rights
//  Import depuis un lien (vidéo YouTube, archive.org… : seul le son est gardé, l'image peut devenir la couverture ; le travail est fait
//  par le service de transcription, transcriber/src/audyn_import.py) :
//   GET|POST /studio/audyn/:id/link-imports · POST /studio/audyn/link-imports/:jid/cancel · POST /studio/audyn/:id/cover-from-link
//   POST /studio/audyn/:id/chapters/:cid/resplit (« Redécouper » un chapitre importé selon les chapitres de la vidéo)
//  Public (les livres audio adultes ; les histoires du soir enfants passent par l'espace Kids, étape 4) :
//   GET /audyn · GET /audyn/:id · GET /audyn/:id/chapters/:cid/play (lien d'écoute) · GET /audyn/:id/chapters/:cid/preview (aperçu coupé par le serveur)
//  Accès : formule « Apprentissage » (ou contenu marqué « ouvert à tous ») ; sinon aperçu gratuit du premier chapitre, coupé par le serveur.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { patchOf } from '../../zpatch.js';
import {
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../../db.js';
import { config } from '../../config.js';
import { getNumber } from '../../settings.js';
import { hasLearningTier } from '../../access.js';
import { storage, presignGet, presignPut, headObject, deleteKeys } from '../../storage.js';
import { classifyUrl, storageProblem, userLabel } from '../../mediaImport.js';
import kidsStories from './kidsStories.js';
import { AUDIENCES, ACCESS, COVER_MAX_MB, audioInfo, coverInfo, clean, fullAccess, previewBytes, publishError, sumDuration, validOrder } from './lib.js';

const PART_SIZE = 32 * 1024 * 1024; // sous la limite de 64 Mo de Nginx (comme les envois de vidéos)
const bucket = config.s3.bucket;
const idSchema = z.object({ id: z.guid() });
const uidSchema = z.object({ uid: z.guid() });
const chSchema = z.object({ id: z.guid(), cid: z.guid() });
const itemBody = z.object({
  title: z.string().trim().min(1).max(200), narrator: z.string().trim().max(200).default(''), author: z.string().trim().max(200).default(''),
  description: z.string().trim().max(4000).default(''), audience: z.enum(AUDIENCES).default('adults'), category: z.string().trim().max(80).default(''),
  language: z.string().trim().regex(/^[a-z]{2,3}$/).default('fr'), access: z.enum(ACCESS).default('learning'),
}).strict();
const itemPatch = patchOf(itemBody).extend({ status: z.enum(['draft', 'published']).optional() }).strict();
const startBody = z.object({
  filename: z.string().trim().min(1).max(255), size: z.number().int().positive(), contentType: z.string().max(60),
  title: z.string().trim().max(200).default(''), durationSeconds: z.number().int().min(0).max(172800).default(0),
  rights: z.literal(true, { error: "Cochez l'attestation : vous avez les droits de diffusion de ce fichier" }),
}).strict();
const completeBody = z.object({
  parts: z.array(z.object({ PartNumber: z.number().int().min(1).max(10000), ETag: z.string().min(1) })).min(1).max(10000),
}).strict();

const itemRow = (r, extra = {}) => ({
  id: r.id, title: r.title, narrator: r.narrator, author: r.author, description: r.description, audience: r.audience, category: r.category,
  language: r.language, access: r.access, status: r.status, hasCover: Boolean(r.cover_key), createdAt: r.created_at, updatedAt: r.updated_at, ...extra,
});
const chapterRow = (c) => ({
  id: c.id, position: c.position, title: c.title, durationSeconds: c.duration_seconds, size: Number(c.size), contentType: c.content_type, sourceUrl: c.source_url || null,
});
// Import depuis un lien : voix française de la plateforme si elle existe ('fr', comme l'import de vidéos) ou voix d'origine.
const linkBody = z.object({
  url: z.string().trim().min(1).max(1000),
  rights: z.literal(true, { error: "Cochez l'attestation : vous avez les droits de diffusion de ce son" }),
  audioLang: z.enum(['fr', 'original']).default('fr'),
  cover: z.enum(['auto', 'replace', 'none']).default('auto'),
  split: z.boolean().default(true), // un fichier par chapitre de la vidéo (repères de l'auteur), s'il y en a au moins 2
}).strict();
const LINK_ACTIVE = ['pending', 'downloading'];
const jobRow = (j) => ({
  id: j.id, kind: j.kind, url: j.source_url, origin: j.origin, title: j.title, status: j.status, progress: j.progress, error: j.error || null,
  note: j.note || null, audioLang: j.audio_lang || null, audioUsed: j.audio_used || null, added: j.added, parentId: j.parent_id || null,
  split: j.split !== false, parts: j.parts || 0, replaceChapter: j.replace_chapter || null,
  chapterId: j.chapter_id || null, active: LINK_ACTIVE.includes(j.status), createdAt: j.created_at, finishedAt: j.finished_at,
});
const jidSchema = z.object({ jid: z.guid() });

export default async function audynRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  const pub = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };
  const off = (reply) => reply.code(503).send({ error: 'Stockage non configuré' });
  const cover = async (r) => (r.cover_key && storage ? presignGet(r.cover_key).catch(() => null) : null);

  async function chaptersOf(itemId) {
    return (await pool.query('SELECT * FROM audyn_chapters WHERE item_id = $1 ORDER BY position', [itemId])).rows;
  }
  async function dropObjects(keys) { if (storage && keys.length) await deleteKeys(keys).catch(() => {}); }

  // ------------------------------------------------------------------ Studio : contenus
  app.get('/studio/audyn', adminOnly, async () => {
    const { rows } = await pool.query(
      `SELECT i.*, (SELECT count(*)::int FROM audyn_chapters c WHERE c.item_id = i.id) AS chapters,
              (SELECT COALESCE(sum(duration_seconds), 0)::int FROM audyn_chapters c WHERE c.item_id = i.id) AS duration
         FROM audyn_items i ORDER BY i.created_at DESC`);
    return {
      items: rows.map((r) => itemRow(r, { chapters: r.chapters, durationSeconds: r.duration })),
      storage: Boolean(storage), audiences: AUDIENCES,
      limits: { maxMb: await getNumber('mod_audyn_max_mb'), previewSeconds: await getNumber('mod_audyn_preview_seconds'), coverMb: COVER_MAX_MB },
    };
  });

  app.post('/studio/audyn', adminOnly, async (req, reply) => {
    const b = itemBody.parse(req.body ?? {});
    const { rows } = await pool.query(
      `INSERT INTO audyn_items(title, narrator, author, description, audience, category, language, access, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [clean(b.title, 200), clean(b.narrator, 200), clean(b.author, 200), b.description, b.audience, clean(b.category, 80), b.language, b.access, req.user.sub]);
    req.auditSummary = `Audyn : « ${rows[0].title} » créé`;
    return reply.code(201).send(itemRow(rows[0]));
  });

  app.get('/studio/audyn/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = (await pool.query('SELECT * FROM audyn_items WHERE id = $1', [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Contenu introuvable' });
    const chapters = await chaptersOf(id);
    return {
      ...itemRow(r, { coverUrl: await cover(r), durationSeconds: sumDuration(chapters) }), chapters: chapters.map(chapterRow),
      canCoverFromLink: chapters.some((c) => c.source_url), // un chapitre importé depuis un lien : son image peut devenir la couverture
    };
  });

  app.patch('/studio/audyn/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = itemPatch.parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM audyn_items WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Contenu introuvable' });
    if (b.status === 'published') {
      const err = publishError({ ...cur, ...b }, await chaptersOf(id));
      if (err) return reply.code(400).send({ error: err, code: 'cannot_publish' });
    }
    const set = ['updated_at = now()']; const args = [id];
    const put = (col, v) => { args.push(v); set.push(`${col} = $${args.length}`); };
    for (const k of ['title', 'narrator', 'author']) if (b[k] !== undefined) put(k, clean(b[k], 200));
    if (b.description !== undefined) put('description', b.description);
    if (b.audience !== undefined) put('audience', b.audience);
    if (b.category !== undefined) put('category', clean(b.category, 80));
    if (b.language !== undefined) put('language', b.language);
    if (b.access !== undefined) put('access', b.access);
    if (b.status !== undefined) put('status', b.status);
    const { rows } = await pool.query(`UPDATE audyn_items SET ${set.join(', ')} WHERE id = $1 RETURNING *`, args);
    req.auditSummary = `Audyn : « ${rows[0].title} » modifié${b.status ? ` (${b.status === 'published' ? 'publié' : 'repassé en brouillon'})` : ''}`;
    return itemRow(rows[0]);
  });

  app.delete('/studio/audyn/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = (await pool.query('SELECT * FROM audyn_items WHERE id = $1', [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Contenu introuvable' });
    const keys = (await chaptersOf(id)).map((c) => c.audio_key);
    if (r.cover_key) keys.push(r.cover_key);
    const pending = (await pool.query("SELECT object_key, s3_upload_id FROM audyn_uploads WHERE item_id = $1 AND status = 'pending'", [id])).rows;
    if (storage) for (const u of pending) await storage.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.object_key, UploadId: u.s3_upload_id })).catch(() => {});
    await pool.query('DELETE FROM audyn_items WHERE id = $1', [id]);
    await dropObjects(keys);
    req.auditSummary = `Audyn : « ${r.title} » supprimé`;
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Studio : couverture
  app.post('/studio/audyn/:id/cover-url', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const b = z.object({ contentType: z.string().max(60), size: z.number().int().positive() }).strict().parse(req.body ?? {});
    const info = coverInfo(b.contentType);
    if (!info) return reply.code(400).send({ error: 'Couverture : image jpeg, png ou webp', code: 'bad_type' });
    if (b.size > COVER_MAX_MB * 1048576) return reply.code(400).send({ error: `Couverture trop lourde (${COVER_MAX_MB} Mo maximum)`, code: 'too_big' });
    if (!(await pool.query('SELECT 1 FROM audyn_items WHERE id = $1', [id])).rowCount) return reply.code(404).send({ error: 'Contenu introuvable' });
    const key = `audyn/${id}/cover-${randomUUID()}.${info.ext}`;
    return { key, url: await presignPut(key, info.type) };
  });

  app.post('/studio/audyn/:id/cover', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const b = z.object({ key: z.string().max(300) }).strict().parse(req.body ?? {});
    if (!b.key.startsWith(`audyn/${id}/cover-`)) return reply.code(400).send({ error: 'Couverture invalide', code: 'bad_key' });
    const cur = (await pool.query('SELECT cover_key FROM audyn_items WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Contenu introuvable' });
    let size;
    try { size = Number((await headObject(b.key)).ContentLength); } catch { return reply.code(400).send({ error: "L'image n'a pas été reçue : recommencez l'envoi", code: 'missing' }); }
    if (size > COVER_MAX_MB * 1048576) { await dropObjects([b.key]); return reply.code(400).send({ error: `Couverture trop lourde (${COVER_MAX_MB} Mo maximum)`, code: 'too_big' }); }
    await pool.query('UPDATE audyn_items SET cover_key = $2, updated_at = now() WHERE id = $1', [id, b.key]);
    if (cur.cover_key && cur.cover_key !== b.key) await dropObjects([cur.cover_key]);
    req.auditSummary = 'Audyn : couverture changée';
    return { ok: true };
  });

  // ------------------------------------------------------------------ Studio : envoi des chapitres
  app.post('/studio/audyn/:id/uploads', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const b = startBody.parse(req.body ?? {});
    const info = audioInfo(b.contentType);
    if (!info) return reply.code(400).send({ error: 'Format non accepté : MP3 ou M4A', code: 'bad_type' });
    const maxMb = await getNumber('mod_audyn_max_mb');
    if (b.size > maxMb * 1048576) return reply.code(413).send({ error: `Fichier trop lourd (${maxMb} Mo maximum) : découpez-le en chapitres`, code: 'too_big' });
    if (!(await pool.query('SELECT 1 FROM audyn_items WHERE id = $1', [id])).rowCount) return reply.code(404).send({ error: 'Contenu introuvable' });
    const key = `audyn/${id}/${randomUUID()}.${info.ext}`;
    const { UploadId } = await storage.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: info.type }));
    const title = clean(b.title, 200) || clean(b.filename.replace(/\.[^.]+$/, ''), 200) || 'Chapitre';
    const { rows } = await pool.query(
      `INSERT INTO audyn_uploads(item_id, user_id, object_key, s3_upload_id, filename, title, content_type, size, duration_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [id, req.user.sub, key, UploadId, b.filename, title, info.type, b.size, b.durationSeconds]);
    const count = Math.ceil(b.size / PART_SIZE);
    const urls = await Promise.all(Array.from({ length: count }, (_, i) =>
      getSignedUrl(storage, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber: i + 1 }), { expiresIn: 6 * 3600 })));
    return reply.code(201).send({ id: rows[0].id, partSize: PART_SIZE, urls });
  });

  app.post('/studio/audyn/uploads/:uid/complete', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { uid } = uidSchema.parse(req.params);
    const { parts } = completeBody.parse(req.body ?? {});
    const u = (await pool.query("SELECT * FROM audyn_uploads WHERE id = $1 AND status = 'pending'", [uid])).rows[0];
    if (!u) return reply.code(404).send({ error: 'Envoi introuvable' });
    await storage.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: u.object_key, UploadId: u.s3_upload_id, MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }));
    let size;
    try { size = Number((await headObject(u.object_key)).ContentLength); } catch { size = Number(u.size); }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const item = (await client.query('SELECT id, title FROM audyn_items WHERE id = $1 FOR UPDATE', [u.item_id])).rows[0];
      if (!item) { await client.query('ROLLBACK'); await dropObjects([u.object_key]); return reply.code(404).send({ error: 'Contenu introuvable' }); }
      const pos = (await client.query('SELECT COALESCE(max(position), 0) + 1 AS p FROM audyn_chapters WHERE item_id = $1', [u.item_id])).rows[0].p;
      const ch = (await client.query(
        `INSERT INTO audyn_chapters(item_id, position, title, audio_key, content_type, size, duration_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [u.item_id, pos, u.title, u.object_key, u.content_type, size, u.duration_seconds])).rows[0];
      await client.query("UPDATE audyn_uploads SET status = 'completed' WHERE id = $1", [uid]);
      await client.query('UPDATE audyn_items SET updated_at = now() WHERE id = $1', [u.item_id]);
      const who = (await client.query('SELECT name, email FROM users WHERE id = $1', [req.user.sub])).rows[0];
      await client.query(
        `INSERT INTO audyn_rights_log(item_id, item_title, chapter_id, filename, size, user_id, user_label) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [u.item_id, item.title, ch.id, u.filename, size, req.user.sub, who ? `${who.name} <${who.email}>` : String(req.user.sub)]);
      await client.query('COMMIT');
      req.auditSummary = `Audyn : chapitre « ${u.title} » ajouté à « ${item.title} » (droits attestés)`;
      return reply.code(201).send(chapterRow(ch));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  });

  app.delete('/studio/audyn/uploads/:uid', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { uid } = uidSchema.parse(req.params);
    const u = (await pool.query("DELETE FROM audyn_uploads WHERE id = $1 AND status = 'pending' RETURNING object_key, s3_upload_id", [uid])).rows[0];
    if (u) await storage.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.object_key, UploadId: u.s3_upload_id })).catch(() => {});
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Studio : chapitres
  app.patch('/studio/audyn/:id/chapters/:cid', adminOnly, async (req, reply) => {
    const { id, cid } = chSchema.parse(req.params);
    const b = z.object({ title: z.string().trim().min(1).max(200) }).strict().parse(req.body ?? {});
    const { rows } = await pool.query('UPDATE audyn_chapters SET title = $3 WHERE id = $2 AND item_id = $1 RETURNING *', [id, cid, clean(b.title, 200)]);
    if (!rows[0]) return reply.code(404).send({ error: 'Chapitre introuvable' });
    return chapterRow(rows[0]);
  });

  app.delete('/studio/audyn/:id/chapters/:cid', adminOnly, async (req, reply) => {
    const { id, cid } = chSchema.parse(req.params);
    const c = (await pool.query('DELETE FROM audyn_chapters WHERE id = $2 AND item_id = $1 RETURNING audio_key, title', [id, cid])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Chapitre introuvable' });
    await dropObjects([c.audio_key]);
    // Les positions restent consécutives (1, 2, 3…) et un contenu sans chapitre repasse en brouillon.
    const left = await chaptersOf(id);
    for (let i = 0; i < left.length; i += 1) await pool.query('UPDATE audyn_chapters SET position = $2 WHERE id = $1', [left[i].id, i + 1]);
    if (!left.length) await pool.query("UPDATE audyn_items SET status = 'draft', updated_at = now() WHERE id = $1", [id]);
    req.auditSummary = `Audyn : chapitre « ${c.title} » supprimé`;
    return reply.code(204).send();
  });

  app.put('/studio/audyn/:id/chapters-order', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ ids: z.array(z.guid()).max(500) }).strict().parse(req.body ?? {});
    const cur = await chaptersOf(id);
    const ids = validOrder(b.ids, cur.map((c) => c.id));
    if (!ids) return reply.code(400).send({ error: "L'ordre doit contenir exactement les chapitres du contenu", code: 'bad_order' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); // contrainte d'unicité différée : l'ordre change d'un coup
      for (let i = 0; i < ids.length; i += 1) await client.query('UPDATE audyn_chapters SET position = $2 WHERE id = $1', [ids[i], i + 1]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
    return { ok: true };
  });

  app.get('/studio/audyn-rights', adminOnly, async () => (await pool.query(
    'SELECT * FROM audyn_rights_log ORDER BY id DESC LIMIT 200')).rows
    .map((r) => ({ id: Number(r.id), itemId: r.item_id, itemTitle: r.item_title, filename: r.filename, size: Number(r.size), by: r.user_label, at: r.created_at, sourceUrl: r.source_url || null })));

  // ------------------------------------------------------------------ Studio : import depuis un lien
  // La demande est ouverte ici ; le service de transcription télécharge le son (une playlist devient une demande par vidéo), le convertit
  // en MP3, crée le chapitre, note l'attestation dans le journal et pose la couverture. Les erreurs sont lisibles sur la demande.
  const openJob = async (itemId, b, kind, req, replaceChapter = null) => {
    const c = classifyUrl(b.url);
    if (c.error) return { code: 400, body: { error: c.error, code: c.code } };
    const full = await storageProblem();
    if (full) return { code: 409, body: { error: full, code: 'storage_full' } };
    const busy = await pool.query(`SELECT 1 FROM audyn_imports WHERE item_id = $1 AND source_url = $2 AND kind = $3 AND status IN ('pending', 'downloading')
                                     AND replace_chapter IS NOT DISTINCT FROM $4`, [itemId, c.url, kind, replaceChapter]);
    if (busy.rowCount) return { code: 409, body: { error: 'Ce lien est déjà en cours de récupération pour ce contenu', code: 'busy' } };
    const { rows } = await pool.query(
      `INSERT INTO audyn_imports(item_id, kind, source_url, origin, archive_file, audio_lang, cover, requested_by, requested_by_name, split, replace_chapter, title)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [itemId, kind, c.url, c.origin, c.archive?.file || null, kind === 'audio' && b.audioLang === 'fr' ? 'fr' : null, b.cover, req.user.sub, await userLabel(req.user.sub),
        b.split !== false, replaceChapter, b.title || '']);
    return { code: 202, body: jobRow(rows[0]), url: c.url };
  };

  app.get('/studio/audyn/:id/link-imports', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await pool.query('SELECT 1 FROM audyn_items WHERE id = $1', [id])).rowCount) return reply.code(404).send({ error: 'Contenu introuvable' });
    // En cours, plus les demandes finies des dernières 24 heures (les plus récentes d'abord ; une playlist reste groupée dans l'ordre).
    const { rows } = await pool.query(
      `SELECT * FROM audyn_imports WHERE item_id = $1 AND (status IN ('pending', 'downloading') OR created_at > now() - interval '24 hours')
        ORDER BY created_at DESC, seq LIMIT 120`, [id]);
    return { imports: rows.map(jobRow), active: rows.some((r) => LINK_ACTIVE.includes(r.status)) };
  });

  app.post('/studio/audyn/:id/link-imports', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const b = linkBody.parse(req.body ?? {});
    const item = (await pool.query('SELECT title FROM audyn_items WHERE id = $1', [id])).rows[0];
    if (!item) return reply.code(404).send({ error: 'Contenu introuvable' });
    const r = await openJob(id, b, 'audio', req);
    if (r.code === 202) req.auditSummary = `Audyn : son demandé depuis un lien pour « ${item.title} » (droits attestés) : ${r.url}`;
    return reply.code(r.code).send(r.body);
  });

  app.post('/studio/audyn/:id/cover-from-link', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const b = z.object({ chapterId: z.guid().optional() }).strict().parse(req.body ?? {});
    if (!(await pool.query('SELECT 1 FROM audyn_items WHERE id = $1', [id])).rowCount) return reply.code(404).send({ error: 'Contenu introuvable' });
    // Le chapitre demandé, sinon le premier chapitre importé depuis un lien.
    const ch = (await pool.query(
      `SELECT source_url FROM audyn_chapters WHERE item_id = $1 AND source_url IS NOT NULL AND ($2::uuid IS NULL OR id = $2) ORDER BY position LIMIT 1`,
      [id, b.chapterId ?? null])).rows[0];
    if (!ch) return reply.code(400).send({ error: "Aucun chapitre de ce contenu ne vient d'un lien vidéo", code: 'no_source' });
    const r = await openJob(id, { url: ch.source_url, cover: 'replace' }, 'cover', req);
    if (r.code === 202) req.auditSummary = `Audyn : couverture demandée depuis la vidéo ${r.url}`;
    return reply.code(r.code).send(r.body);
  });

  // « Redécouper » : le son de la vidéo d'origine est retéléchargé et découpé selon ses chapitres ; le chapitre est remplacé, à sa
  // place, par les morceaux. Rien ne change si la vidéo n'a pas (ou plus) de chapitres : le service le vérifie avant de télécharger.
  app.post('/studio/audyn/:id/chapters/:cid/resplit', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const { id, cid } = chSchema.parse(req.params);
    z.object({ rights: z.literal(true, { error: "Cochez l'attestation : vous avez les droits de diffusion de ce son" }) }).strict().parse(req.body ?? {});
    const ch = (await pool.query('SELECT title, source_url FROM audyn_chapters WHERE id = $2 AND item_id = $1', [id, cid])).rows[0];
    if (!ch) return reply.code(404).send({ error: 'Chapitre introuvable' });
    if (!ch.source_url) return reply.code(400).send({ error: "Ce chapitre n'a pas été importé depuis une vidéo", code: 'no_source' });
    // Même voix que lors de l'import du chapitre (voix française par défaut).
    const prev = (await pool.query(`SELECT audio_lang FROM audyn_imports WHERE chapter_id = $1 OR replace_chapter = $1 ORDER BY created_at DESC LIMIT 1`, [cid])).rows[0];
    const r = await openJob(id, { url: ch.source_url, cover: 'none', split: true, audioLang: prev && !prev.audio_lang ? 'original' : 'fr', title: ch.title }, 'audio', req, cid);
    if (r.code === 202) req.auditSummary = `Audyn : redécoupage du chapitre « ${ch.title} » selon les chapitres de la vidéo (droits attestés)`;
    return reply.code(r.code).send(r.body);
  });

  app.post('/studio/audyn/link-imports/:jid/cancel', adminOnly, async (req, reply) => {
    const { jid } = jidSchema.parse(req.params);
    // En attente : annulée tout de suite. En cours : le service s'arrête au prochain point de contrôle (fichiers effacés).
    const now = await pool.query(
      `UPDATE audyn_imports SET status = 'canceled', finished_at = now(), updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`, [jid]);
    if (now.rowCount) return { canceled: true, import: jobRow(now.rows[0]) };
    const run = await pool.query(`UPDATE audyn_imports SET cancel_requested = true, updated_at = now() WHERE id = $1 AND status = 'downloading' RETURNING *`, [jid]);
    if (run.rowCount) return { canceled: false, stopping: true, import: jobRow(run.rows[0]) };
    return reply.code(404).send({ error: 'Demande introuvable ou déjà terminée' });
  });

  // ------------------------------------------------------------------ Public : livres audio (adultes)
  const publicWhere = "i.status = 'published' AND i.audience IN ('adults', 'both') AND EXISTS (SELECT 1 FROM audyn_chapters c WHERE c.item_id = i.id)";

  app.get('/audyn', pub, async (req) => {
    const q = z.object({ category: z.string().trim().max(80).optional(), q: z.string().trim().max(80).optional() }).parse(req.query ?? {});
    const args = []; let where = publicWhere;
    if (q.category) { args.push(q.category); where += ` AND i.category = $${args.length}`; }
    if (q.q) { args.push(`%${q.q.replace(/[%_]/g, ' ')}%`); where += ` AND (i.title ILIKE $${args.length} OR i.narrator ILIKE $${args.length} OR i.author ILIKE $${args.length})`; }
    const viewer = await app.optionalUser(req);
    const learning = viewer ? await hasLearningTier(viewer.sub) : false;
    const { rows } = await pool.query(
      `SELECT i.*, (SELECT count(*)::int FROM audyn_chapters c WHERE c.item_id = i.id) AS chapters,
              (SELECT COALESCE(sum(duration_seconds), 0)::int FROM audyn_chapters c WHERE c.item_id = i.id) AS duration
         FROM audyn_items i WHERE ${where} ORDER BY i.created_at DESC LIMIT 200`, args);
    const cats = (await pool.query(`SELECT DISTINCT i.category FROM audyn_items i WHERE ${publicWhere} AND i.category <> '' ORDER BY 1`)).rows.map((r) => r.category);
    return {
      items: await Promise.all(rows.map(async (r) => ({
        id: r.id, title: r.title, narrator: r.narrator, author: r.author, category: r.category, language: r.language,
        chapters: r.chapters, durationSeconds: r.duration, coverUrl: await cover(r), full: fullAccess(r, learning),
      }))),
      categories: cats,
    };
  });

  async function publicItem(id) {
    return (await pool.query(`SELECT i.* FROM audyn_items i WHERE i.id = $1 AND ${publicWhere}`, [id])).rows[0];
  }

  app.get('/audyn/:id', pub, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await publicItem(id);
    if (!r) return reply.code(404).send({ error: 'Contenu introuvable' });
    const viewer = await app.optionalUser(req);
    const learning = viewer ? await hasLearningTier(viewer.sub) : false;
    const chapters = await chaptersOf(id);
    const full = fullAccess(r, learning);
    return {
      id: r.id, title: r.title, narrator: r.narrator, author: r.author, description: r.description, category: r.category, language: r.language,
      coverUrl: await cover(r), durationSeconds: sumDuration(chapters),
      access: { full, previewSeconds: full ? 0 : await getNumber('mod_audyn_preview_seconds'), learningRequired: r.access === 'learning' },
      chapters: chapters.map((c, i) => ({ ...chapterRow(c), playable: full || i === 0 })),
    };
  });

  // Lien d'écoute : lien signé du fichier (membre « Apprentissage ») ou adresse de l'aperçu coupé (premier chapitre, sans abonnement).
  app.get('/audyn/:id/chapters/:cid/play', pub, async (req, reply) => {
    if (!storage) return off(reply);
    const { id, cid } = chSchema.parse(req.params);
    const r = await publicItem(id);
    if (!r) return reply.code(404).send({ error: 'Contenu introuvable' });
    const chapters = await chaptersOf(id);
    const idx = chapters.findIndex((c) => c.id === cid);
    if (idx < 0) return reply.code(404).send({ error: 'Chapitre introuvable' });
    const viewer = await app.optionalUser(req);
    const full = fullAccess(r, viewer ? await hasLearningTier(viewer.sub) : false);
    if (full) return { preview: false, url: await presignGet(chapters[idx].audio_key), expiresIn: 3600 };
    if (idx !== 0) return reply.code(403).send({ error: "Ce chapitre est réservé aux membres de la formule « Apprentissage »", code: 'learning_required' });
    return { preview: true, url: `/audyn/${id}/chapters/${cid}/preview`, limitSeconds: await getNumber('mod_audyn_preview_seconds') };
  });

  // Aperçu : le serveur ne renvoie que le début du fichier (la coupure ne dépend donc pas de l'application).
  app.get('/audyn/:id/chapters/:cid/preview', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!storage) return off(reply);
    const { id, cid } = chSchema.parse(req.params);
    const r = (await pool.query("SELECT i.* FROM audyn_items i WHERE i.id = $1 AND i.status = 'published'", [id])).rows[0]; // livres adultes ET histoires du soir
    if (!r) return reply.code(404).send({ error: 'Contenu introuvable' });
    const chapters = await chaptersOf(id);
    const c = chapters[0];
    if (!c || c.id !== cid) return reply.code(403).send({ error: 'Aperçu limité au premier chapitre', code: 'learning_required' });
    const n = previewBytes(Number(c.size), c.duration_seconds, await getNumber('mod_audyn_preview_seconds'));
    const obj = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: c.audio_key, Range: `bytes=0-${Math.max(0, n - 1)}` }));
    reply.header('Content-Type', c.content_type).header('Content-Length', String(n)).header('Cache-Control', 'private, max-age=300').header('Accept-Ranges', 'none');
    return reply.send(obj.Body);
  });

  // ------------------------------------------------------------------ Histoires du soir (espace Kids)
  await kidsStories(app, { chaptersOf, cover, chapterRow, off });
}
