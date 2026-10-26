// Étape 23b — Veille des chaînes : l'administrateur suit des chaînes / comptes YouTube, Dailymotion ou Vimeo ;
// le transcripteur les relit à intervalle régulier (réglage watch_interval_hours, 6 h par défaut) et les nouvelles
// vidéos arrivent dans une liste à traiter : « Ajouter » (avec l'attestation des droits) ou « Ignorer ».
// Rien n'est ajouté au catalogue sans une action de l'administrateur. Aucune notification hors de l'admin.
import { z } from 'zod';
import { pool } from '../db.js';
import { TRANSLATION_LANGS, baseLang } from '../langs.js';
import { getNumber } from '../settings.js';

const idSchema = z.object({ id: z.string().uuid() });
const HOSTS = {
  youtube: /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)$/i,
  dailymotion: /^(www\.|m\.|geo\.)?(dailymotion\.com|dai\.ly)$/i,
  vimeo: /^(www\.)?vimeo\.com$/i,
};

/** Plateforme d'une adresse suivie, ou null si elle n'est pas acceptée. */
export function watchPlatform(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    for (const [name, re] of Object.entries(HOSTS)) if (re.test(u.hostname)) return name;
  } catch { /* adresse invalide */ }
  return null;
}

const addSchema = z.object({
  url: z.string().trim().url().max(500),
  label: z.string().trim().max(120).default(''),
});
const patchSchema = z.object({ active: z.boolean().optional(), label: z.string().trim().max(120).optional() }).refine((b) => Object.keys(b).length > 0, 'Aucun changement');
const itemsQuery = z.object({
  status: z.enum(['new', 'ignored', 'added', 'seen']).default('new'),
  sourceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
const ignoreSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
const addItemSchema = z.object({
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('fr'),
  categoryId: z.number().int().positive().nullable().optional(),
  access: z.enum(['free', 'premium']).default('free'),
  speaker: z.string().trim().max(200).default(''),
  translateTo: z.array(z.enum(TRANSLATION_LANGS)).max(TRANSLATION_LANGS.length).default([]),
  // Attestation : l'administrateur déclare avoir l'accord de l'auteur (sans elle : pas de transcription).
  rightsConfirmed: z.boolean().default(false),
});

export default async function watchRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  // Pastille du menu : nombre de nouvelles vidéos à traiter.
  app.get('/admin/watch/count', adminOnly, async () => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM watch_items WHERE status = 'new'");
    return { new: rows[0].n };
  });

  app.get('/admin/watch', adminOnly, async () => {
    const { rows } = await pool.query(
      `SELECT s.id, s.url, s.platform, s.label, s.active, s.baselined, s.check_requested AS "checkRequested",
              s.last_check_at AS "lastCheckAt", s.last_ok_at AS "lastOkAt", s.last_error AS "lastError", s.last_count AS "lastCount", s.created_at AS "createdAt",
              (SELECT count(*)::int FROM watch_items i WHERE i.source_id = s.id AND i.status = 'new') AS "newCount"
       FROM watch_sources s ORDER BY s.created_at DESC`);
    return { sources: rows, intervalHours: await getNumber('watch_interval_hours') };
  });

  app.post('/admin/watch', { ...adminOnly, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = addSchema.parse(req.body);
    const platform = watchPlatform(b.url);
    if (!platform) return reply.code(400).send({ error: 'Adresse YouTube, Dailymotion ou Vimeo attendue (chaîne, compte, playlist ou album)' });
    const n = await pool.query('SELECT count(*)::int AS n FROM watch_sources');
    if (n.rows[0].n >= 100) return reply.code(400).send({ error: 'Cent sources suivies au maximum' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO watch_sources(url, platform, label, check_requested, created_by) VALUES ($1, $2, $3, true, $4) RETURNING id`,
        [b.url, platform, b.label, req.user.sub]);
      req.auditSummary = `Veille : source ajoutée (${platform}) ${b.url}`;
      return reply.code(201).send({ id: rows[0].id });
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Cette source est déjà suivie' });
      throw err;
    }
  });

  app.patch('/admin/watch/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body);
    const { rowCount } = await pool.query(
      'UPDATE watch_sources SET active = COALESCE($2, active), label = COALESCE($3, label) WHERE id = $1', [id, b.active ?? null, b.label ?? null]);
    if (!rowCount) return reply.code(404).send({ error: 'Source introuvable' });
    req.auditSummary = `Veille : source ${b.active === undefined ? 'renommée' : b.active ? 'reprise' : 'mise en pause'}`;
    return { ok: true };
  });

  app.delete('/admin/watch/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rowCount } = await pool.query('DELETE FROM watch_sources WHERE id = $1', [id]);
    if (!rowCount) return reply.code(404).send({ error: 'Source introuvable' });
    req.auditSummary = 'Veille : source supprimée';
    return reply.code(204).send();
  });

  // « Vérifier maintenant » : le transcripteur la prend dans la minute.
  app.post('/admin/watch/:id/check', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rowCount } = await pool.query('UPDATE watch_sources SET check_requested = true, active = true WHERE id = $1', [id]);
    if (!rowCount) return reply.code(404).send({ error: 'Source introuvable' });
    req.auditSummary = 'Veille : vérification demandée';
    return reply.code(202).send({ ok: true });
  });

  app.get('/admin/watch/items', adminOnly, async (req) => {
    const q = itemsQuery.parse(req.query);
    const { rows } = await pool.query(
      `SELECT i.id, i.platform, i.video_id AS "videoId", i.title, i.duration, i.thumb, i.status, i.found_at AS "foundAt",
              i.talk_id AS "talkId", s.id AS "sourceId", COALESCE(NULLIF(s.label, ''), s.url) AS "sourceLabel"
       FROM watch_items i JOIN watch_sources s ON s.id = i.source_id
       WHERE i.status = $1 AND ($2::uuid IS NULL OR i.source_id = $2)
       ORDER BY i.found_at DESC, i.title LIMIT $3`, [q.status, q.sourceId ?? null, q.limit]);
    return rows;
  });

  app.post('/admin/watch/items/ignore', adminOnly, async (req) => {
    const { ids } = ignoreSchema.parse(req.body);
    const { rowCount } = await pool.query("UPDATE watch_items SET status = 'ignored', handled_at = now() WHERE id = ANY($1::uuid[]) AND status = 'new'", [ids]);
    req.auditSummary = `Veille : ${rowCount} vidéo(s) ignorée(s)`;
    return { ignored: rowCount };
  });

  // Remet une vidéo ignorée dans la liste à traiter.
  app.post('/admin/watch/items/:id/restore', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rowCount } = await pool.query("UPDATE watch_items SET status = 'new', handled_at = NULL WHERE id = $1 AND status = 'ignored'", [id]);
    if (!rowCount) return reply.code(404).send({ error: 'Vidéo introuvable' });
    return { ok: true };
  });

  // « Ajouter » : crée la conférence (publiée, comme un import depuis une liste), avec l'attestation des droits.
  app.post('/admin/watch/items/:id/add', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = addItemSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const it = (await client.query("SELECT * FROM watch_items WHERE id = $1 AND status IN ('new', 'ignored') FOR UPDATE", [id])).rows[0];
      if (!it) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Vidéo introuvable ou déjà traitée' }); }
      const dup = (await client.query('SELECT id FROM talks WHERE source = $1 AND video_ref = $2 LIMIT 1', [it.platform, it.video_id])).rows[0];
      if (dup) {
        await client.query("UPDATE watch_items SET status = 'added', talk_id = $2, handled_at = now() WHERE id = $1", [id, dup.id]);
        await client.query('COMMIT');
        return reply.code(200).send({ talkId: dup.id, already: true });
      }
      const langs = [...new Set(b.translateTo)].filter((l) => l !== baseLang(b.language));
      const { rows } = await client.query(
        `INSERT INTO talks(organizer_id, title, speaker, language, category_id, access, source, video_ref, video_status,
                           transcript_status, rights_confirmed, duration_seconds, external_thumb)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9, $10, $11, $12) RETURNING id`,
        [req.user.sub, it.title || it.video_id, b.speaker, b.language, b.categoryId ?? null, b.access, it.platform, it.video_id,
          b.rightsConfirmed ? 'pending' : 'unavailable', b.rightsConfirmed, it.duration ?? null, it.thumb ?? null]);
      if (b.rightsConfirmed && langs.length) {
        await client.query('INSERT INTO transcript_translations(talk_id, lang) SELECT $1, unnest($2::text[])', [rows[0].id, langs]);
      }
      await client.query("UPDATE watch_items SET status = 'added', talk_id = $2, handled_at = now() WHERE id = $1", [id, rows[0].id]);
      await client.query('COMMIT');
      req.auditSummary = `Veille : « ${(it.title || it.video_id).slice(0, 120)} » ajoutée (${it.platform}${b.rightsConfirmed ? ', droits attestés' : ', sans transcription'})`;
      return reply.code(201).send({ talkId: rows[0].id });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue' });
      throw err;
    } finally {
      client.release();
    }
  });
}
