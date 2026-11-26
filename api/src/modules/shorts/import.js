// Import de shorts depuis la page « Shorts » d'une chaîne YouTube (ou une liste de lecture) : shorts AUTONOMES, sans conférence.
//   POST /studio/shorts/import                 { url } : lance la lecture de la liste (le transcripteur la remplit : table import_jobs, purpose 'shorts')
//   GET  /studio/shorts/import/:id             état de la liste ; « déjà importé » recalculé à chaque lecture
//   POST /studio/shorts/import/:id/start       { ids, mode: 'copy' | 'youtube', rights: true, categoryId, categoryIds, catalogue, kidsBands, author, status }
//   POST /studio/shorts/:id/copy-retry         relance la copie d'un short dont le téléchargement a échoué
// mode « copy »    : le transcripteur télécharge la vidéo, l'envoie dans Garage (shorts/<id>.mp4) ; visible une fois la copie faite ;
// mode « youtube » : rien n'est copié, la vidéo est lue depuis YouTube (lecteur intégré).
// Chaque import garde la case « droits » cochée (texte, personne, date) : journal conservé avec le short.
import { z } from 'zod';
import { pool } from '../../db.js';
import { getSetting, isOn } from '../../settings.js';

export const RIGHTS_COPY = 'Je certifie détenir les droits sur ces vidéos, ou disposer d\'une licence ou d\'une autorisation m\'autorisant à les copier et à les présenter sur cette plateforme. Je comprends que je suis responsable de ce contenu.';
export const RIGHTS_PLAY = 'Je certifie disposer de l\'autorisation de présenter ces vidéos sur cette plateforme (lecture depuis YouTube, sans copie). Je comprends que je suis responsable de ce contenu.';
const MAX_PER_START = 100;

const urlSchema = z.string().trim().url().max(500).refine((u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)(youtube\.com|youtu\.be)$/i.test(x.hostname); } catch { return false; }
}, 'Collez une adresse YouTube (page « Shorts » d’une chaîne, ou liste de lecture).');
const idSchema = z.object({ id: z.guid() });

export default async function shortsImport(app, { manager, isStaff, reviewOn }) {
  const mine = async (req, id) => (await pool.query(
    "SELECT * FROM import_jobs WHERE id = $1 AND purpose = 'shorts' AND ($2::boolean OR organizer_id = $3)", [id, isStaff(req.user), req.user.sub])).rows[0];

  const view = async (j) => {
    let entries = Array.isArray(j.entries) ? j.entries : [];
    if (j.status === 'listed' && entries.length) {
      const have = new Set((await pool.query('SELECT video_ref FROM public_shorts WHERE video_ref = ANY($1::text[])', [entries.map((e) => String(e.id))])).rows.map((r) => r.video_ref));
      entries = entries.map((e) => ({ ...e, already: have.has(String(e.id)) }));
    }
    return { id: j.id, url: j.url, status: j.status, title: j.title, error: j.error, imported: j.imported, createdAt: j.created_at, count: entries.length, entries };
  };

  app.post('/studio/shorts/import', { ...manager, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { url } = z.object({ url: urlSchema }).parse(req.body ?? {});
    const running = await pool.query("SELECT count(*)::int AS n FROM import_jobs WHERE organizer_id = $1 AND status = 'listing' AND purpose = 'shorts'", [req.user.sub]);
    if (running.rows[0].n >= 3) return reply.code(429).send({ error: 'Trois analyses sont déjà en cours, patientez.' });
    const { rows } = await pool.query("INSERT INTO import_jobs(organizer_id, url, purpose) VALUES ($1, $2, 'shorts') RETURNING *", [req.user.sub, url]);
    return reply.code(202).send(await view(rows[0]));
  });

  app.get('/studio/shorts/import/:id', manager, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Analyse introuvable' });
    return view(job);
  });

  const startSchema = z.object({
    ids: z.array(z.string().regex(/^[\w-]{6,20}$/)).min(1).max(MAX_PER_START),
    mode: z.enum(['copy', 'youtube']),
    rights: z.literal(true, { error: 'Cochez la case des droits pour continuer.' }),
    categoryId: z.number().int().nullable().optional(), categoryIds: z.array(z.number().int()).max(12).default([]),
    catalogue: z.enum(['adult', 'kids']).default('adult'), kidsBands: z.array(z.enum(['3-5', '6-8', '9-12', '13-15'])).max(4).default([]),
    author: z.string().trim().max(120).optional(), status: z.enum(['draft', 'published']).default('draft'),
  });

  app.post('/studio/shorts/import/:id/start', manager, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = startSchema.parse(req.body ?? {});
    const job = await mine(req, id);
    if (!job || job.status !== 'listed') return reply.code(409).send({ error: 'La liste n’est pas prête.', code: 'not_listed' });
    const cats = [...new Set([...(b.categoryId ? [b.categoryId] : []), ...b.categoryIds])];
    if (cats.length && (await pool.query('SELECT 1 FROM categories WHERE id = ANY($1::int[]) AND is_active HAVING count(*) = $2', [cats, cats.length])).rowCount !== 1) {
      return reply.code(400).send({ error: 'Catégorie inconnue.', code: 'bad_category' });
    }
    const byId = new Map((job.entries || []).filter((e) => e.source === 'youtube').map((e) => [String(e.id), e]));
    const user = (await pool.query('SELECT name FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const author = (b.author ?? String(job.title || '').replace(/\s*[-–]\s*Shorts$/i, '')).trim().slice(0, 120);
    // Publié directement par le personnel ; sinon, validation si elle est activée (comme pour les autres shorts).
    const status = b.status === 'published' && !isStaff(req.user) && (await reviewOn()) ? 'pending' : b.status;
    const text = b.mode === 'copy' ? RIGHTS_COPY : RIGHTS_PLAY;
    const created = []; const skipped = [];
    for (const vid of [...new Set(b.ids)]) {
      const e = byId.get(vid);
      if (!e) { skipped.push({ id: vid, reason: 'pas dans la liste' }); continue; }
      const sid = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id;
      const title = String(e.title || '').replace(/\s*#shorts\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Short';
      const copy = b.mode === 'copy';
      const r = await pool.query(
        `INSERT INTO public_shorts(id, talk_id, title, video_key, play, video_ref, source_url, thumb_url, author, category_id, catalogue, kids_bands,
                                   copy_status, status, published_at, submitted_at, created_by, rights_confirmed_at, rights_text, imported_by_name)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CASE WHEN $13 = 'published' THEN now() END, CASE WHEN $13 = 'pending' THEN now() END, $14, now(), $15, $16)
         ON CONFLICT (video_ref) WHERE video_ref IS NOT NULL DO NOTHING RETURNING id`,
        [sid, title, copy ? `shorts/${sid}.mp4` : null, copy ? 'file' : 'youtube', vid, `https://www.youtube.com/shorts/${vid}`,
         e.thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, author, b.categoryId ?? cats[0] ?? null, b.catalogue, b.kidsBands,
         copy ? 'pending' : null, status, req.user.sub, text, user?.name || '']);
      if (!r.rowCount) { skipped.push({ id: vid, reason: 'déjà importé' }); continue; }
      if (cats.length > 1 || (b.categoryIds || []).length) {
        await pool.query('INSERT INTO public_short_categories(short_id, category_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [sid, cats]);
      }
      created.push(sid);
    }
    await pool.query("UPDATE import_jobs SET status = 'imported', imported = imported + $2, updated_at = now() WHERE id = $1", [id, created.length]);
    req.auditSummary = `Shorts : ${created.length} importé(s) depuis YouTube (${b.mode === 'copy' ? 'copie chez nous' : 'lecture depuis YouTube'}), droits confirmés`;
    return reply.code(201).send({ created: created.length, skipped, ids: created });
  });

  app.post('/studio/shorts/:id/copy-retry', manager, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const row = (await pool.query('SELECT * FROM public_shorts WHERE id = $1 AND talk_id IS NULL', [id])).rows[0];
    if (!row || !(isStaff(req.user) || row.created_by === req.user.sub)) return reply.code(404).send({ error: 'Short introuvable' });
    if (row.copy_status !== 'failed') return reply.code(409).send({ error: 'Cette copie n’a pas échoué.', code: 'not_failed' });
    await pool.query("UPDATE public_shorts SET copy_status = 'pending', copy_error = NULL, copy_attempts = 0, updated_at = now() WHERE id = $1", [id]);
    return { copy: { status: 'pending', error: null } };
  });
}
