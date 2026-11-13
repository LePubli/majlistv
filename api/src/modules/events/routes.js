// Amélioration 4.2 — Événements en direct (étape 1 : socle, gestion, fichier agenda, « Me rappeler », rediffusion).
//  Public :
//   GET /events?scope=upcoming|past        événements publiés (à venir / en cours, ou terminés) ; `reminded` pour le membre connecté
//   GET /events/:id                         fiche ; le lien du direct n'est donné que lorsque le lecteur est ouvert ; `replay` après l'événement
//   GET /events/:id/calendar.ics            fichier agenda (heure en UTC, rappel 1 h avant)
//  Membre connecté :
//   GET /me/events/ids · PUT|DELETE /me/events/:id/remind
//  Studio (organisateur : ses événements ; administrateur : tous) :
//   GET|POST /studio/events · GET|PATCH|DELETE /studio/events/:id   (PATCH : { talkId } rattache la rediffusion)
//  Chaînes TV en direct (fonction « livetv ») :
//   GET /live                                chaînes affichées (direct en cours retrouvé par le transcripteur)
//   GET|POST /studio/live · PATCH|DELETE /studio/live/:cid · POST /studio/live/:cid/check   (administrateur)
import { z } from 'zod';
import { patchOf, isoDateTime } from '../../zpatch.js';
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { baseVars } from '../../mailer.js';
import { visibleSql } from '../../visibility.js';
import { parseLiveUrl, publicShape, buildIcs, STATUSES, parseChannelUrl, liveChannelShape } from './lib.js';

const idSchema = z.object({ id: z.guid() });
const base = z.object({
  title: z.string().trim().min(1).max(200), speaker: z.string().trim().max(200).default(''), description: z.string().trim().max(4000).default(''),
  language: z.string().trim().regex(/^[a-z]{2,3}$/).default('fr'),
  url: z.string().trim().max(500),
  startsAt: isoDateTime({ offset: true }), durationMinutes: z.number().int().min(5).max(600).default(60),
  status: z.enum(STATUSES).default('draft'),
}).strict();
const patchBody = patchOf(base).extend({ talkId: z.guid().nullable().optional() }).strict();

const chanBody = z.object({
  name: z.string().trim().min(1, 'Nom obligatoire').max(80), url: z.string().trim().min(10).max(300),
  enabled: z.boolean().default(true), position: z.number().int().min(0).max(1000).default(0),
}).strict();
const chanPatch = patchOf(chanBody).strict();
const cidSchema = z.object({ cid: z.coerce.number().int().positive() });

export default async function eventsRoutes(app) {
  const studio = { preHandler: app.requireRole('organizer', 'admin') };
  const auth = { preHandler: app.authenticate };
  const openMinutes = () => getNumber('mod_events_open_minutes');

  // Conférence enregistrée rattachée à l'événement, si elle est visible du public.
  async function replayOf(ev) {
    if (!ev.talk_id) return null;
    const { rows } = await pool.query(`SELECT t.id, t.title FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [ev.talk_id]);
    return rows[0] ? { talkId: rows[0].id, title: rows[0].title } : null;
  }
  const ownRow = async (req, id) => {
    const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    const ev = rows[0];
    return ev && (req.user.role === 'admin' || ev.created_by === req.user.sub) ? ev : null;
  };
  const studioShape = async (r, open) => ({
    ...publicShape(r, { openMinutes: open, privileged: true }), status: r.status, url: r.source === 'youtube' ? `https://www.youtube.com/watch?v=${r.video_ref}` : `https://vimeo.com/${r.video_ref}`,
    talkId: r.talk_id, reminders: r.reminders ?? 0, createdBy: r.created_by,
  });
  // Rattachement d'une rediffusion : une conférence qui existe et qui appartient à l'auteur (ou n'importe laquelle pour l'administrateur).
  async function checkTalk(req, talkId) {
    const { rows } = await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [talkId]);
    return rows[0] && (req.user.role === 'admin' || rows[0].organizer_id === req.user.sub);
  }

  // ---- Public -------------------------------------------------------------------------------------------------------------
  app.get('/events', async (req) => {
    const { scope } = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') }).parse(req.query);
    const viewer = await app.optionalUser(req); const open = await openMinutes();
    const ended = "(e.starts_at + make_interval(mins => e.duration_minutes)) <= now()";
    const { rows } = await pool.query(
      `SELECT e.*, ${viewer ? 'EXISTS (SELECT 1 FROM event_reminders r WHERE r.event_id = e.id AND r.user_id = $1)' : 'false'} AS reminded
         FROM events e WHERE e.status IN ('published', 'cancelled') AND ${scope === 'past' ? '' : 'NOT '}${ended}
        ORDER BY e.starts_at ${scope === 'past' ? 'DESC' : 'ASC'} LIMIT ${scope === 'past' ? 30 : 50}`, viewer ? [viewer.sub] : []);
    const out = [];
    for (const r of rows) out.push({ ...publicShape(r, { openMinutes: open }), reminded: r.reminded, replay: scope === 'past' ? await replayOf(r) : null });
    return out;
  });

  app.get('/events/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const viewer = await app.optionalUser(req);
    const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    const ev = rows[0];
    const owner = ev && viewer && (viewer.role === 'admin' || ev.created_by === viewer.sub);
    if (!ev || (ev.status === 'draft' && !owner)) return reply.code(404).send({ error: 'Événement introuvable' });
    const reminded = viewer ? (await pool.query('SELECT 1 FROM event_reminders WHERE event_id = $1 AND user_id = $2', [id, viewer.sub])).rowCount > 0 : false;
    const shape = publicShape(ev, { openMinutes: await openMinutes() });
    return { ...shape, reminded, replay: shape.phase === 'ended' || shape.phase === 'cancelled' ? await replayOf(ev) : null };
  });

  app.get('/events/:id/calendar.ics', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query("SELECT * FROM events WHERE id = $1 AND status IN ('published', 'cancelled')", [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Événement introuvable' });
    const { app: appName, webUrl } = await baseVars();
    reply.header('content-type', 'text/calendar; charset=utf-8').header('content-disposition', 'attachment; filename="evenement.ics"').header('cache-control', 'no-cache');
    return buildIcs(rows[0], { url: webUrl ? `${webUrl}/events/${id}` : '', appName });
  });

  // ---- Membre : « Me rappeler » -------------------------------------------------------------------------------------------------
  app.get('/me/events/ids', auth, async (req) => (await pool.query('SELECT event_id FROM event_reminders WHERE user_id = $1', [req.user.sub])).rows.map((r) => r.event_id));

  app.put('/me/events/:id/remind', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query("SELECT * FROM events WHERE id = $1 AND status = 'published'", [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Événement introuvable' });
    if (publicShape(rows[0], { openMinutes: 0 }).phase === 'ended') return reply.code(409).send({ error: 'Cet événement est terminé', code: 'ended' });
    // Inscrit à moins de 24 h du début : le rappel « jour » est sans objet (il reste le rappel « ça commence »).
    const soon = new Date(rows[0].starts_at).getTime() - Date.now() < 24 * 3600000;
    await pool.query('INSERT INTO event_reminders(event_id, user_id, day_sent_at) VALUES ($1, $2, CASE WHEN $3 THEN now() END) ON CONFLICT DO NOTHING', [id, req.user.sub, soon]);
    return { reminded: true };
  });

  app.delete('/me/events/:id/remind', auth, async (req) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM event_reminders WHERE event_id = $1 AND user_id = $2', [id, req.user.sub]);
    return { reminded: false };
  });

  // ---- Studio -------------------------------------------------------------------------------------------------------------------
  app.get('/studio/events', studio, async (req) => {
    const open = await openMinutes();
    const admin = req.user.role === 'admin';
    const { rows } = await pool.query(
      `SELECT e.*, (SELECT count(*)::int FROM event_reminders r WHERE r.event_id = e.id) AS reminders FROM events e
        ${admin ? '' : 'WHERE e.created_by = $1'} ORDER BY e.starts_at DESC LIMIT 200`, admin ? [] : [req.user.sub]);
    return Promise.all(rows.map((r) => studioShape(r, open)));
  });

  app.post('/studio/events', studio, async (req, reply) => {
    const b = base.parse(req.body ?? {});
    const v = parseLiveUrl(b.url);
    if (!v) return reply.code(400).send({ error: 'Adresse YouTube ou Vimeo (vidéo) attendue pour le direct' });
    const { rows } = await pool.query(
      `INSERT INTO events(title, speaker, description, language, source, video_ref, starts_at, duration_minutes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.title, b.speaker, b.description, b.language, v.source, v.ref, b.startsAt, b.durationMinutes, b.status, req.user.sub]);
    return reply.code(201).send(await studioShape(rows[0], await openMinutes()));
  });

  app.get('/studio/events/:id', studio, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const ev = await ownRow(req, id);
    if (!ev) return reply.code(404).send({ error: 'Événement introuvable' });
    ev.reminders = (await pool.query('SELECT count(*)::int AS n FROM event_reminders WHERE event_id = $1', [id])).rows[0].n;
    return studioShape(ev, await openMinutes());
  });

  app.patch('/studio/events/:id', studio, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const ev = await ownRow(req, id);
    if (!ev) return reply.code(404).send({ error: 'Événement introuvable' });
    const b = patchBody.parse(req.body ?? {});
    const sets = []; const vals = [id];
    const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
    if (b.url !== undefined) { const v = parseLiveUrl(b.url); if (!v) return reply.code(400).send({ error: 'Adresse YouTube ou Vimeo (vidéo) attendue pour le direct' }); add('source', v.source); add('video_ref', v.ref); }
    if (b.talkId !== undefined) { if (b.talkId !== null && !(await checkTalk(req, b.talkId))) return reply.code(400).send({ error: 'Conférence introuvable ou qui ne vous appartient pas' }); add('talk_id', b.talkId); }
    for (const [k, col] of [['title', 'title'], ['speaker', 'speaker'], ['description', 'description'], ['language', 'language'], ['startsAt', 'starts_at'], ['durationMinutes', 'duration_minutes'], ['status', 'status']]) {
      if (b[k] !== undefined) add(col, b[k]);
    }
    if (!sets.length) return reply.code(400).send({ error: 'Rien à modifier' });
    const { rows } = await pool.query(`UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, vals);
    // Heure ou statut changés : les rappels déjà envoyés pour l'ancienne heure ne comptent plus (le nouveau créneau sera rappelé).
    if (b.startsAt !== undefined && new Date(b.startsAt).getTime() !== new Date(ev.starts_at).getTime()) await pool.query('UPDATE event_reminders SET day_sent_at = NULL, soon_sent_at = NULL WHERE event_id = $1', [id]);
    rows[0].reminders = (await pool.query('SELECT count(*)::int AS n FROM event_reminders WHERE event_id = $1', [id])).rows[0].n;
    return studioShape(rows[0], await openMinutes());
  });

  app.delete('/studio/events/:id', studio, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await ownRow(req, id))) return reply.code(404).send({ error: 'Événement introuvable' });
    await pool.query('DELETE FROM events WHERE id = $1', [id]);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Chaînes TV en direct (24 h/24)
  const adminOnly = { preHandler: app.requireRole('admin') };
  app.get('/live', async () => {
    const { rows } = await pool.query('SELECT * FROM live_channels WHERE enabled ORDER BY position, id');
    return { channels: rows.filter((r) => r.video_id).map(liveChannelShape) };
  });
  const adminChan = (r) => ({ ...liveChannelShape(r), url: r.source_url, enabled: r.enabled, position: r.position, checkedAt: r.checked_at, error: r.error || null });
  app.get('/studio/live', adminOnly, async () => {
    const { rows } = await pool.query('SELECT * FROM live_channels ORDER BY position, id');
    return { channels: rows.map(adminChan) };
  });
  app.post('/studio/live', adminOnly, async (req, reply) => {
    const b = chanBody.parse(req.body ?? {});
    const url = parseChannelUrl(b.url);
    if (!url) return reply.code(400).send({ error: 'Lien YouTube non reconnu : collez le lien de la chaîne (youtube.com/@nom) ou du direct (youtube.com/watch?v=…)', code: 'bad_url' });
    const { rows } = await pool.query('INSERT INTO live_channels(name, source_url, enabled, position) VALUES ($1,$2,$3,$4) RETURNING *', [b.name, url, b.enabled, b.position]);
    req.auditSummary = `Direct : chaîne « ${b.name} » ajoutée`;
    return reply.code(201).send(adminChan(rows[0]));
  });
  app.patch('/studio/live/:cid', adminOnly, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const b = chanPatch.parse(req.body ?? {});
    const set = []; const args = [cid];
    const put = (col, v) => { args.push(v); set.push(`${col} = $${args.length}`); };
    if (b.name !== undefined) put('name', b.name);
    if (b.enabled !== undefined) put('enabled', b.enabled);
    if (b.position !== undefined) put('position', b.position);
    if (b.url !== undefined) {
      const url = parseChannelUrl(b.url);
      if (!url) return reply.code(400).send({ error: 'Lien YouTube non reconnu', code: 'bad_url' });
      put('source_url', url); set.push('video_id = NULL', 'live = false', "title = ''", 'checked_at = NULL', 'error = NULL');
    }
    if (!set.length) return reply.code(400).send({ error: 'Rien à modifier' });
    const { rows } = await pool.query(`UPDATE live_channels SET ${set.join(', ')} WHERE id = $1 RETURNING *`, args);
    if (!rows[0]) return reply.code(404).send({ error: 'Chaîne introuvable' });
    req.auditSummary = `Direct : chaîne « ${rows[0].name} » modifiée`;
    return adminChan(rows[0]);
  });
  app.delete('/studio/live/:cid', adminOnly, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const { rows } = await pool.query('DELETE FROM live_channels WHERE id = $1 RETURNING name', [cid]);
    if (!rows[0]) return reply.code(404).send({ error: 'Chaîne introuvable' });
    req.auditSummary = `Direct : chaîne « ${rows[0].name} » supprimée`;
    return { deleted: true };
  });
  // « Vérifier maintenant » : le transcripteur relit la chaîne au prochain passage (quelques secondes).
  app.post('/studio/live/:cid/check', adminOnly, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const r = await pool.query('UPDATE live_channels SET checked_at = NULL WHERE id = $1', [cid]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Chaîne introuvable' });
    return reply.code(202).send({ queued: true });
  });
}
