// Import de playlists, de chaînes ou d'albums, de comptes YouTube / Vimeo / Dailymotion :
// 1) l'organisateur colle l'adresse -> le transcripteur liste les vidéos (sans rien télécharger) ;
// 2) il coche celles à importer -> les conférences sont créées (transcription si l'accord de l'auteur est confirmé).
import { z } from 'zod';
import { pool } from '../db.js';
import { TRANSLATION_LANGS, baseLang } from '../langs.js';

const idSchema = z.object({ id: z.string().uuid() });
const ALLOWED_HOSTS = /^(www\.|m\.|music\.|geo\.)?(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|archive\.org)$/i;

const urlSchema = z.string().trim().url().max(500).refine((u) => {
  try { return ALLOWED_HOSTS.test(new URL(u).hostname); } catch { return false; }
}, 'Adresse YouTube, Vimeo, Dailymotion ou archive.org attendue');

const confirmSchema = z.object({
  ids: z.array(z.string().regex(/^[\w.-]{1,100}$/)).min(1).max(2000), // identifiants archive.org : jusqu'à 100 caractères
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('fr'),
  categoryId: z.number().int().positive().nullable().optional(),
  access: z.enum(['free', 'premium']).default('free'),
  speaker: z.string().trim().max(200).default(''),
  translateTo: z.array(z.enum(TRANSLATION_LANGS)).max(TRANSLATION_LANGS.length).default([]),
  rightsConfirmed: z.boolean().default(false),
});

const view = (j) => ({
  id: j.id, url: j.url, status: j.status, title: j.title, error: j.error, imported: j.imported,
  createdAt: j.created_at, count: Array.isArray(j.entries) ? j.entries.length : 0, entries: j.entries,
});

export default async function importRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const mine = async (req, id) => {
    const { rows } = await pool.query('SELECT * FROM import_jobs WHERE id = $1 AND ($2 OR organizer_id = $3)', [id, req.user.role === 'admin', req.user.sub]);
    return rows[0];
  };

  app.post('/imports', { ...organizer, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { url } = z.object({ url: urlSchema }).parse(req.body);
    const running = await pool.query("SELECT count(*)::int AS n FROM import_jobs WHERE organizer_id = $1 AND status = 'listing'", [req.user.sub]);
    if (running.rows[0].n >= 3) return reply.code(429).send({ error: 'Trois analyses sont déjà en cours, patientez' });
    const { rows } = await pool.query('INSERT INTO import_jobs(organizer_id, url) VALUES ($1, $2) RETURNING *', [req.user.sub, url]);
    return reply.code(202).send(view(rows[0]));
  });

  app.get('/imports', organizer, async (req) => {
    const { rows } = await pool.query(
      `SELECT id, url, status, title, error, imported, created_at, jsonb_array_length(entries) AS n
       FROM import_jobs WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 20`, [req.user.sub]);
    return rows.map((j) => ({ id: j.id, url: j.url, status: j.status, title: j.title, error: j.error, imported: j.imported, createdAt: j.created_at, count: j.n }));
  });

  app.get('/imports/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Import introuvable' });
    // « Déjà importée » recalculé à chaque lecture (une vidéo a pu être ajoutée entre-temps).
    if (job.status === 'listed' && job.entries.length) {
      const { rows } = await pool.query(
        `SELECT source, video_ref FROM talks WHERE (source, video_ref) IN (SELECT x->>'source', x->>'id' FROM jsonb_array_elements($1::jsonb) x)`,
        [JSON.stringify(job.entries)]);
      const have = new Set(rows.map((r) => `${r.source}:${r.video_ref}`));
      job.entries = job.entries.map((e) => ({ ...e, already: have.has(`${e.source}:${e.id}`) }));
    }
    return view(job);
  });

  // Création des conférences pour les vidéos cochées.
  app.post('/imports/:id/confirm', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = confirmSchema.parse(req.body);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Import introuvable' });
    if (!['listed', 'imported'].includes(job.status)) return reply.code(409).send({ error: "La liste n'est pas encore prête" });
    const wanted = new Set(b.ids);
    const picked = job.entries.filter((e) => wanted.has(e.id));
    const langs = [...new Set(b.translateTo)].filter((l) => l !== baseLang(b.language));
    const client = await pool.connect();
    let created = 0;
    let skipped = 0;
    try {
      await client.query('BEGIN');
      for (const e of picked) {
        const dup = await client.query('SELECT 1 FROM talks WHERE source = $1 AND video_ref = $2 LIMIT 1', [e.source, e.id]);
        if (dup.rowCount) { skipped += 1; continue; }
        const { rows } = await client.query(
          `INSERT INTO talks(organizer_id, title, speaker, language, category_id, access, source, video_ref, video_status,
                             transcript_status, rights_confirmed, duration_seconds, external_thumb)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9, $10, $11, $12) RETURNING id`,
          [job.organizer_id, e.title || e.id, b.speaker, b.language, b.categoryId ?? null, b.access, e.source, e.id,
            b.rightsConfirmed ? 'pending' : 'unavailable', b.rightsConfirmed, e.duration ?? null, e.thumb ?? null]
        );
        if (b.rightsConfirmed && langs.length) {
          await client.query('INSERT INTO transcript_translations(talk_id, lang) SELECT $1, unnest($2::text[])', [rows[0].id, langs]);
        }
        created += 1;
      }
      await client.query("UPDATE import_jobs SET status = 'imported', imported = imported + $2, updated_at = now() WHERE id = $1", [id, created]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue' });
      throw err;
    } finally {
      client.release();
    }
    return { created, skipped };
  });

  app.delete('/imports/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Import introuvable' });
    await pool.query('DELETE FROM import_jobs WHERE id = $1', [id]);
    return reply.code(204).send();
  });

  // Relancer une analyse échouée (ex. après avoir ajouté des cookies YouTube).
  app.post('/imports/:id/retry', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Import introuvable' });
    await pool.query("UPDATE import_jobs SET status = 'listing', attempts = 0, error = NULL, updated_at = now() - interval '1 hour' WHERE id = $1", [id]);
    return reply.code(202).send({ status: 'listing' });
  });
}
