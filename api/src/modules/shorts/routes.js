// Shorts publics.
//   GET  /shorts?channel=<slug>&limit=&offset=   public : fil des shorts publiés (les plus récents d'abord) ; jeton enfant : seulement ceux de son âge
//   GET  /shorts/:id                              public : un short publié
//   POST /shorts/:id/view                         public : compte une vue (une par personne, par short et par jour)
//   GET  /studio/shorts                           Studio : mes shorts (brouillons et publiés) et les extraits prêts à publier
//   POST /studio/shorts                           Studio : publier un extrait de l'éditeur (copie du dernier rendu vertical prêt)
//   PUT  /studio/shorts/:id                       Studio : titre, brouillon / publié
//   POST /studio/shorts/:id/refresh               Studio : remplacer la vidéo par le dernier rendu de l'extrait
//   DELETE /studio/shorts/:id                     Studio : supprimer (fichier compris)
// Droits Studio : le créateur de la conférence, le propriétaire et les éditeurs de sa chaîne (src/channelAccess.js), modérateurs, administrateurs.
// Espace Kids : un enfant ne voit que les shorts de conférences de sa tranche d'âge et du catalogue autorisé par son parent
// (mêmes règles que le catalogue Kids, gratuites seulement sans abonnement), tant que son temps du jour n'est pas écoulé.
// Un short d'une conférence réservée aux adultes n'est jamais proposé à un enfant ; un short d'une conférence Kids seule n'est jamais proposé aux adultes.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet, copyObject, deleteObject } from '../../storage.js';
import { visibleSql } from '../../visibility.js';
import { adultSql, bandOkSql } from '../../taxonomy.js';
import { catalogSql, timeState } from '../../kidsControl.js';
import { getSetting, isOn } from '../../settings.js';
import { speakerNames, speakerSlug } from '../../speakers.js';
import { channelImages } from '../../channels.js';
import { viaChannel, managedSpeakers } from '../../channelAccess.js';
import { makePoster } from './poster.js';

const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  channel: z.string().max(120).regex(/^[a-z0-9-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});
const TITLE_MAX = 90;
const OWN = z.enum(['draft', 'published']);

// Conditions d'un short visible : publié, conférence prête et publiée ; adultes : catalogue adulte ; enfant : sa tranche, son catalogue (paramètres $1 à $4).
const BASE_WHERE = `s.status = 'published' AND t.video_status = 'ready' AND ${visibleSql('t')}`;
const ADULT_WHERE = `${BASE_WHERE} AND ${adultSql('t')}`;
const KID_WHERE = `${BASE_WHERE} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 4)} AND ($3::boolean OR t.access = 'free')`;
const PUBLIC_SELECT = `
  SELECT s.id, s.title, s.duration_s, s.views, s.published_at, s.video_key, s.poster_key AS short_poster,
         t.id AS talk_id, t.title AS talk_title, t.speaker, t.access, t.poster_key, t.external_thumb
    FROM public_shorts s JOIN talks t ON t.id = s.talk_id`;

// Forme publique d'un short (liens temporaires, chaîne, miniature de la conférence en affiche).
async function publicView(rows, { kid = false } = {}) {
  const slugs = [...new Set(rows.map((r) => speakerSlug(r.speaker)).filter(Boolean))];
  const named = new Map((await pool.query('SELECT slug, name FROM speakers WHERE slug = ANY($1)', [slugs])).rows.map((r) => [r.slug, r.name]));
  const imgs = await channelImages(slugs);
  const out = [];
  for (const r of rows) {
    const slug = speakerSlug(r.speaker);
    out.push({
      id: r.id, title: r.title || r.talk_title, duration: r.duration_s != null ? Number(r.duration_s) : null, views: r.views, publishedAt: r.published_at,
      videoUrl: await presignGet(r.video_key).catch(() => null),
      posterUrl: r.short_poster ? await presignGet(r.short_poster).catch(() => null)
        : r.poster_key ? await presignGet(r.poster_key).catch(() => null) : (r.external_thumb || null),
      talk: { id: r.talk_id, title: r.talk_title, premium: r.access === 'premium' },
      channel: slug && !kid ? { slug, name: named.get(slug) || String(r.speaker).trim(), avatarUrl: imgs.get(slug)?.avatarUrl || null } : null,
    });
  }
  return out;
}

export default async function shortsRoutes(app) {
  const manager = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const isStaff = (u) => u.role === 'moderator' || u.role === 'admin';
  // Ce que la personne a le droit de voir : { kid, where, args } ; null = rien (espace Kids coupé, temps écoulé, jeton enfant périmé).
  async function scope(req) {
    const kv = await app.kidContext(req);
    if (kv) {
      if (!isOn(await getSetting('kids_enabled'))) return null;
      if ((await timeState(kv.profile)).timeUp) return null;
      let open = false;
      try { open = await (await import('../kids/routes.js')).parentAllowed(kv.parent.sub, kv.parent.role); } catch { open = false; }
      return { kid: kv.profile, where: KID_WHERE, args: [kv.profile.id, kv.profile.band, open, kv.profile.catalog_mode] };
    }
    return { kid: null, where: ADULT_WHERE, args: [] };
  }

  // ------------------------------------------------------------------ Public
  app.get('/shorts', async (req, reply) => {
    const p = listSchema.parse(req.query);
    reply.header('cache-control', 'no-store');
    const sc = await scope(req);
    if (!sc) return [];
    let names = null;
    if (p.channel) { names = await speakerNames(p.channel); if (!names.length) return []; }
    const n = sc.args.length;
    const { rows } = await pool.query(
      `${PUBLIC_SELECT} WHERE ${sc.where} AND ($${n + 1}::text[] IS NULL OR lower(trim(t.speaker)) = ANY($${n + 1}::text[]))
        ORDER BY s.published_at DESC, s.id LIMIT $${n + 2} OFFSET $${n + 3}`, [...sc.args, names, p.limit, p.offset]);
    return publicView(rows, { kid: Boolean(sc.kid) });
  });

  app.get('/shorts/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    reply.header('cache-control', 'no-store');
    const sc = await scope(req);
    const { rows } = sc ? await pool.query(`${PUBLIC_SELECT} WHERE s.id = $${sc.args.length + 1} AND ${sc.where}`, [...sc.args, id]) : { rows: [] };
    if (!rows[0]) return reply.code(404).send({ error: 'Short introuvable' });
    return (await publicView(rows, { kid: Boolean(sc.kid) }))[0];
  });

  // Une vue par personne, par short et par jour : un membre est reconnu par son compte, un visiteur par une empreinte anonyme salée.
  app.post('/shorts/:id/view', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const sc = await scope(req);
    const ok = sc ? (await pool.query(`SELECT 1 FROM public_shorts s JOIN talks t ON t.id = s.talk_id WHERE s.id = $${sc.args.length + 1} AND ${sc.where}`, [...sc.args, id])).rowCount : 0;
    if (!ok) return reply.code(404).send({ error: 'Short introuvable' });
    const user = sc.kid ? null : await app.optionalUser(req);
    const viewer = sc.kid ? `k:${sc.kid.id}` : user ? `u:${req.user.sub}` : `a:${createHash('sha256').update(`${req.ip}|${req.headers['user-agent'] || ''}|${process.env.JWT_SECRET || ''}`).digest('hex').slice(0, 24)}`;
    const ins = await pool.query('INSERT INTO public_short_views(short_id, viewer) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, viewer]);
    if (ins.rowCount) await pool.query('UPDATE public_shorts SET views = views + 1 WHERE id = $1', [id]);
    return { counted: ins.rowCount > 0 };
  });

  // ------------------------------------------------------------------ Studio
  // Peut-on gérer les shorts de cette conférence ? (ligne avec organizer_id et speaker)
  const canManage = async (user, talk) => isStaff(user) || talk.organizer_id === user.sub || viaChannel(user, talk);

  async function loadOwn(req, reply) {
    const { id } = idSchema.parse(req.params);
    const row = (await pool.query(
      `SELECT s.*, t.title AS talk_title, t.organizer_id, t.speaker, t.publication FROM public_shorts s JOIN talks t ON t.id = s.talk_id WHERE s.id = $1`, [id])).rows[0];
    if (!row || !(await canManage(req.user, row))) { reply.code(404).send({ error: 'Short introuvable' }); return null; }
    return row;
  }

  const studioView = async (r) => ({
    id: r.id, title: r.title, status: r.status, views: r.views, duration: r.duration_s != null ? Number(r.duration_s) : null, bytes: r.bytes != null ? Number(r.bytes) : null,
    publishedAt: r.published_at, createdAt: r.created_at, updatedAt: r.updated_at, projectId: r.project_id,
    talk: { id: r.talk_id, title: r.talk_title, visible: r.visible }, channel: speakerSlug(r.speaker),
    videoUrl: await presignGet(r.video_key).catch(() => null),
    posterUrl: r.poster_key ? await presignGet(r.poster_key).catch(() => null) : null,
  });

  // Mes shorts + extraits de l'éditeur dont un rendu vertical est prêt (avec le short déjà publié à partir d'eux, s'il y en a un).
  app.get('/studio/shorts', manager, async (req) => {
    const staff = isStaff(req.user);
    const mine = staff ? null : await managedSpeakers(req.user.sub);
    const scope = '($1::boolean OR t.organizer_id = $2 OR lower(trim(t.speaker)) = ANY($3::text[]))';
    const args = [staff, req.user.sub, mine || []];
    const shorts = (await pool.query(
      `SELECT s.*, t.title AS talk_title, t.speaker, ${visibleSql('t')} AS visible
         FROM public_shorts s JOIN talks t ON t.id = s.talk_id WHERE ${scope} ORDER BY s.created_at DESC LIMIT 200`, args)).rows;
    let candidates = [];
    try {
      candidates = (await pool.query(
        `SELECT p.id AS project_id, p.title, p.updated_at, t.id AS talk_id, t.title AS talk_title, r.id AS render_id, r.out_duration_s, r.bytes,
                (SELECT s.id FROM public_shorts s WHERE s.project_id = p.id LIMIT 1) AS short_id
           FROM editor_projects p JOIN talks t ON t.id = p.talk_id
           JOIN LATERAL (SELECT id, out_duration_s, bytes FROM editor_renders WHERE project_id = p.id AND status = 'ready' AND output_key IS NOT NULL ORDER BY created_at DESC LIMIT 1) r ON true
          WHERE p.kind = 'short' AND ${scope} ORDER BY p.updated_at DESC LIMIT 100`, args)).rows;
    } catch { /* module « Éditeur de montage » absent : pas d'extraits à proposer */ }
    return {
      shorts: await Promise.all(shorts.map(studioView)),
      candidates: candidates.map((c) => ({ projectId: c.project_id, title: c.title || '', talkId: c.talk_id, talkTitle: c.talk_title, duration: c.out_duration_s != null ? Number(c.out_duration_s) : null,
        bytes: c.bytes != null ? Number(c.bytes) : null, shortId: c.short_id || null })),
    };
  });

  // Dernier rendu vertical prêt d'un extrait de l'éditeur, avec la conférence ; null si absent ou hors de mes droits.
  async function sourceOf(req, projectId) {
    const row = (await pool.query(
      `SELECT p.id, p.title, p.talk_id, t.title AS talk_title, t.organizer_id, t.speaker, r.output_key, r.out_duration_s, r.bytes
         FROM editor_projects p JOIN talks t ON t.id = p.talk_id
         JOIN LATERAL (SELECT output_key, out_duration_s, bytes FROM editor_renders WHERE project_id = p.id AND status = 'ready' AND output_key IS NOT NULL ORDER BY created_at DESC LIMIT 1) r ON true
        WHERE p.id = $1 AND p.kind = 'short'`, [projectId]).catch(() => ({ rows: [] }))).rows[0];
    if (!row || !(await canManage(req.user, row))) return null;
    return row;
  }

  app.post('/studio/shorts', manager, async (req, reply) => {
    const b = z.object({ projectId: z.string().uuid(), title: z.string().trim().max(TITLE_MAX).optional(), status: OWN.default('draft') }).parse(req.body ?? {});
    const src = await sourceOf(req, b.projectId);
    if (!src) return reply.code(404).send({ error: 'Extrait introuvable, ou sans rendu prêt : lancez d’abord le rendu de l’extrait dans l’éditeur.', code: 'no_render' });
    if ((await pool.query('SELECT 1 FROM public_shorts WHERE project_id = $1', [b.projectId])).rowCount) return reply.code(409).send({ error: 'Cet extrait est déjà publié ou en brouillon : modifiez-le dans la liste.', code: 'already' });
    const id = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    const key = `shorts/${id}.mp4`;
    try { await copyObject(src.output_key, key, 'video/mp4'); } catch (err) { return reply.code(502).send({ error: `Copie de la vidéo impossible : ${err.message}`, code: 'copy' }); }
    await pool.query(
      `INSERT INTO public_shorts(id, talk_id, project_id, title, video_key, duration_s, bytes, status, published_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'published' THEN now() END, $9)`,
      [id, src.talk_id, src.id, b.title || src.title || src.talk_title, key, src.out_duration_s, src.bytes, b.status, req.user.sub]);
    const poster = await makePoster(id, key, src.out_duration_s, app.log);
    if (poster) await pool.query('UPDATE public_shorts SET poster_key = $2 WHERE id = $1', [id, poster]);
    req.auditSummary = `Shorts : ${b.status === 'published' ? 'publié' : 'brouillon créé'} (« ${src.talk_title} »)`;
    return reply.code(201).send({ id, status: b.status });
  });

  app.put('/studio/shorts/:id', manager, async (req, reply) => {
    const row = await loadOwn(req, reply); if (!row) return reply;
    const b = z.object({ title: z.string().trim().min(1).max(TITLE_MAX).optional(), status: OWN.optional() }).parse(req.body ?? {});
    await pool.query(
      `UPDATE public_shorts SET title = COALESCE($2, title), status = COALESCE($3, status),
              published_at = CASE WHEN COALESCE($3, status) = 'published' THEN COALESCE(published_at, now()) ELSE NULL END, updated_at = now() WHERE id = $1`,
      [row.id, b.title ?? null, b.status ?? null]);
    if (b.status && b.status !== row.status) req.auditSummary = `Shorts : ${b.status === 'published' ? 'publié' : 'repassé en brouillon'} (« ${row.talk_title} »)`;
    const r = (await pool.query(`SELECT s.*, t.title AS talk_title, t.speaker, ${visibleSql('t')} AS visible FROM public_shorts s JOIN talks t ON t.id = s.talk_id WHERE s.id = $1`, [row.id])).rows[0];
    return studioView(r);
  });

  // Remplacer la vidéo par le dernier rendu de l'extrait (après l'avoir retouché dans l'éditeur).
  app.post('/studio/shorts/:id/refresh', manager, async (req, reply) => {
    const row = await loadOwn(req, reply); if (!row) return reply;
    const src = row.project_id ? await sourceOf(req, row.project_id) : null;
    if (!src) return reply.code(409).send({ error: 'L’extrait de l’éditeur n’existe plus ou n’a pas de rendu prêt.', code: 'no_render' });
    try { await copyObject(src.output_key, row.video_key, 'video/mp4'); } catch (err) { return reply.code(502).send({ error: `Copie de la vidéo impossible : ${err.message}`, code: 'copy' }); }
    const poster = await makePoster(row.id, row.video_key, src.out_duration_s, app.log);
    await pool.query('UPDATE public_shorts SET duration_s = $2, bytes = $3, poster_key = COALESCE($4, poster_key), updated_at = now() WHERE id = $1', [row.id, src.out_duration_s, src.bytes, poster]);
    return { refreshed: true, duration: src.out_duration_s != null ? Number(src.out_duration_s) : null };
  });

  app.delete('/studio/shorts/:id', manager, async (req, reply) => {
    const row = await loadOwn(req, reply); if (!row) return reply;
    await pool.query('DELETE FROM public_shorts WHERE id = $1', [row.id]);
    await deleteObject(row.video_key).catch((e) => app.log.warn(`Shorts : fichier non effacé (${e.message})`));
    if (row.poster_key) await deleteObject(row.poster_key).catch(() => {});
    req.auditSummary = `Shorts : supprimé (« ${row.talk_title} »)`;
    return { deleted: true };
  });
}
