// Étape S3 — Studio → Activité : toutes les tâches de fond (conversion vidéo, transcription, traduction des sous-titres,
// et celles des modules : doublage, archivage), avec pause, priorité, plage horaire des tâches lourdes.
// Les services lisent les réglages par les fonctions SQL activity_allows / activity_paused / activity_priority (migration 055).
// Un organisateur voit les tâches de ses conférences ; l'administrateur voit tout et peut agir.
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting, isOn, saveSettings } from '../settings.js';
import * as ext from '../ext.js';

export const QUEUES = ['video', 'transcript', 'translation', 'dubbing', 'archive', 'editor', 'render', 'replace', 'align', 'face', 'speakers']; // speakers : détection des intervenants (D3c) ; editor : analyses du son (E2) ; render : rendus (E4a) ; replace : nouvelles versions (E4b) ; align : place des mots (E5c) ; face : suivi du visage (E5d)
const HEAVY = ['video', 'transcript', 'dubbing', 'render', 'replace']; // le rendu suit la pause générale et la plage horaire des conversions

// Réglages de la plage horaire et de la pause générale.
export async function activitySettings() {
  return {
    pauseAll: isOn(await getSetting('activity_pause_all')),
    windowEnabled: isOn(await getSetting('activity_window_enabled')),
    windowStart: Number(await getSetting('activity_window_start')),
    windowEnd: Number(await getSetting('activity_window_end')),
    heavyAllowed: (await pool.query("SELECT activity_allows('video') AS ok")).rows[0].ok,
  };
}

async function controls() {
  const { rows } = await pool.query('SELECT queue, ref, paused, priority FROM activity_controls');
  return new Map(rows.map((r) => [`${r.queue}:${r.ref}`, r]));
}

// Tâches des files du socle (conversion, transcription, traduction).
async function coreTasks(organizerId) {
  const own = organizerId ? 'AND t.organizer_id = $1' : '';
  const P = organizerId ? [organizerId] : [];
  const out = [];
  const video = await pool.query(
    `SELECT t.id, t.title, t.video_status AS st, t.video_progress AS pct, t.video_error AS err, t.created_at
       FROM talks t WHERE t.source = 'upload' AND t.video_status IN ('pending', 'processing', 'failed') ${own} ORDER BY t.created_at`, P);
  for (const r of video.rows) {
    out.push({ queue: 'video', ref: r.id, talkId: r.id, title: r.title, status: r.st === 'processing' ? 'running' : r.st === 'failed' ? 'failed' : 'waiting',
      progress: r.st === 'processing' ? r.pct : null, error: r.err, createdAt: r.created_at });
  }
  const tr = await pool.query(
    `SELECT t.id, t.title, t.transcript_status AS st, t.transcript_progress AS pct, t.transcript_error AS err, t.created_at,
            (t.source = 'upload' AND t.video_status <> 'ready') AS wait_video,
            (t.source <> 'upload' AND NOT t.rights_confirmed) AS wait_rights
       FROM talks t WHERE t.transcript_status IN ('pending', 'processing', 'failed') ${own} ORDER BY t.created_at`, P);
  for (const r of tr.rows) {
    const blocked = r.st === 'pending' && (r.wait_video || r.wait_rights);
    out.push({ queue: 'transcript', ref: r.id, talkId: r.id, title: r.title,
      status: r.st === 'processing' ? 'running' : r.st === 'failed' ? 'failed' : blocked ? 'blocked' : 'waiting',
      blockedBy: blocked ? (r.wait_video ? 'video' : 'rights') : null, progress: r.st === 'processing' ? r.pct : null, error: r.err, createdAt: r.created_at });
  }
  const tl = await pool.query(
    `SELECT t.id, t.title, x.lang, x.status AS st, x.progress AS pct, x.error AS err, x.created_at, (t.transcript_status <> 'ready') AS wait_tr
       FROM transcript_translations x JOIN talks t ON t.id = x.talk_id
      WHERE x.status IN ('pending', 'processing', 'failed') ${own} ORDER BY x.attempts, x.created_at`, P);
  for (const r of tl.rows) {
    const blocked = r.st === 'pending' && r.wait_tr;
    out.push({ queue: 'translation', ref: `${r.id}:${r.lang}`, talkId: r.id, title: r.title, lang: r.lang,
      status: r.st === 'processing' ? 'running' : r.st === 'failed' ? 'failed' : blocked ? 'blocked' : 'waiting',
      blockedBy: blocked ? 'transcript' : null, progress: r.st === 'processing' ? r.pct : null, error: r.err, createdAt: r.created_at });
  }
  return out;
}

// Toutes les tâches visibles : socle + modules (événement activity.collect), avec pause et priorité.
export async function listTasks(organizerId) {
  const tasks = await coreTasks(organizerId);
  await ext.emit('activity.collect', tasks, { organizerId: organizerId || null });
  const c = await controls();
  for (const t of tasks) {
    const k = c.get(`${t.queue}:${t.ref}`);
    t.priority = k?.priority || 0;
    t.paused = Boolean(k?.paused);
    if (t.paused && ['waiting', 'blocked'].includes(t.status)) t.status = 'paused';
    t.heavy = HEAVY.includes(t.queue);
  }
  // Ordre dans lequel les services prendront les tâches : priorité, puis ancienneté (par file).
  const rank = { running: 0, waiting: 1, blocked: 2, paused: 3, failed: 4 };
  tasks.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.priority - a.priority) || (new Date(a.createdAt) - new Date(b.createdAt)));
  return tasks;
}

export default async function activityRoutes(app) {
  const viewer = { preHandler: app.requireRole('organizer', 'admin') };
  const admin = { preHandler: app.requireRole('admin') };
  const scope = (req) => (req.user.role === 'admin' ? null : req.user.sub);

  app.get('/studio/activity', viewer, async (req) => {
    const tasks = await listTasks(scope(req));
    // Erreurs : seulement celles des 30 derniers jours (les plus anciennes restent visibles sur la fiche de la conférence).
    const recentErr = (t) => t.status !== 'failed' || Date.now() - new Date(t.createdAt).getTime() < 30 * 86400_000;
    return { tasks: tasks.filter(recentErr), settings: await activitySettings(), canControl: req.user.role === 'admin' };
  });

  // Pastille du menu « Activité » : tâches en cours ou en attente.
  app.get('/studio/activity/count', viewer, async (req) => {
    const tasks = await listTasks(scope(req));
    return { count: tasks.filter((t) => ['running', 'waiting'].includes(t.status)).length, failed: tasks.filter((t) => t.status === 'failed').length };
  });

  const qp = z.object({ queue: z.enum(QUEUES), ref: z.string().min(1).max(120) });
  const upsert = (queue, ref, fields, userId) => pool.query(
    `INSERT INTO activity_controls(queue, ref, paused, priority, updated_by) VALUES ($1, $2, COALESCE($3, false), COALESCE($4, 0), $5)
     ON CONFLICT (queue, ref) DO UPDATE SET paused = COALESCE($3, activity_controls.paused), priority = COALESCE($4, activity_controls.priority),
       updated_by = EXCLUDED.updated_by, updated_at = now()`, [queue, ref, fields.paused ?? null, fields.priority ?? null, userId]);
  const tidy = () => pool.query('DELETE FROM activity_controls WHERE NOT paused AND priority = 0');

  // Pause / reprise d'une tâche. Une tâche en attente ne sera pas prise ; une tâche de doublage en cours s'arrête
  // au prochain bloc et retourne dans la file, en pause (elle repartira du début). Les autres tâches en cours vont au bout.
  app.post('/studio/activity/:queue/:ref/pause', admin, async (req, reply) => {
    const { queue, ref } = qp.parse(req.params);
    const { paused } = z.object({ paused: z.boolean() }).strict().parse(req.body ?? {});
    const task = (await listTasks(null)).find((t) => t.queue === queue && t.ref === ref);
    if (!task) return reply.code(404).send({ error: 'Tâche introuvable', code: 'not_found' });
    if (paused && task.status === 'failed') return reply.code(409).send({ error: 'Cette tâche est en échec : relancez-la depuis la fiche de la conférence', code: 'failed' });
    if (paused && task.status === 'running' && !task.canPauseRunning) {
      return reply.code(409).send({ error: 'Cette tâche est déjà en cours : elle va jusqu’au bout. Mettez en pause les suivantes.', code: 'running' });
    }
    await upsert(queue, ref, { paused }, req.user.sub);
    if (paused && task.status === 'running') await ext.emit('activity.pause', { queue, ref });
    await tidy();
    req.auditSummary = `Activité : ${paused ? 'pause' : 'reprise'} — ${task.label || queue} « ${task.title} »`;
    return { task: (await listTasks(null)).find((t) => t.queue === queue && t.ref === ref) || null };
  });

  // Annuler une tâche (registre n°28 / 31) : seulement les tâches marquées canCancel (le module qui la porte fait le travail,
  // événement « activity.cancel »). L'administrateur annule tout ; un organisateur, les tâches de ses conférences.
  app.post('/studio/activity/:queue/:ref/cancel', viewer, async (req, reply) => {
    const { queue, ref } = qp.parse(req.params);
    const task = (await listTasks(scope(req))).find((t) => t.queue === queue && t.ref === ref);
    if (!task) return reply.code(404).send({ error: 'Tâche introuvable', code: 'not_found' });
    if (!task.canCancel || !['running', 'waiting', 'paused', 'blocked'].includes(task.status)) return reply.code(409).send({ error: 'Cette tâche ne peut pas être annulée.', code: 'not_cancelable' });
    const out = { done: false };
    await ext.emit('activity.cancel', out, { queue, ref });
    if (!out.done) return reply.code(409).send({ error: 'Cette tâche ne peut pas être annulée.', code: 'not_cancelable' });
    await pool.query('DELETE FROM activity_controls WHERE queue = $1 AND ref = $2', [queue, ref]);
    req.auditSummary = `Activité : annulation — ${queue} « ${task.title} »`;
    return { canceled: true, running: task.status === 'running' };
  });

  // Priorité : « passer en premier » (10) ou normale (0).
  app.post('/studio/activity/:queue/:ref/priority', admin, async (req, reply) => {
    const { queue, ref } = qp.parse(req.params);
    const { priority } = z.object({ priority: z.number().int().min(0).max(100) }).strict().parse(req.body ?? {});
    const task = (await listTasks(null)).find((t) => t.queue === queue && t.ref === ref);
    if (!task) return reply.code(404).send({ error: 'Tâche introuvable', code: 'not_found' });
    await upsert(queue, ref, { priority }, req.user.sub);
    await tidy();
    req.auditSummary = `Activité : priorité ${priority ? 'haute' : 'normale'} — ${task.label || queue} « ${task.title} »`;
    return { task: (await listTasks(null)).find((t) => t.queue === queue && t.ref === ref) || null };
  });

  // Pause générale des tâches lourdes et plage horaire.
  app.put('/studio/activity/settings', admin, async (req, reply) => {
    const b = z.object({ pauseAll: z.boolean().optional(), windowEnabled: z.boolean().optional(),
      windowStart: z.number().int().min(0).max(23).optional(), windowEnd: z.number().int().min(0).max(23).optional() }).strict().parse(req.body ?? {});
    const map = { pauseAll: 'activity_pause_all', windowEnabled: 'activity_window_enabled', windowStart: 'activity_window_start', windowEnd: 'activity_window_end' };
    const values = {};
    for (const [k, v] of Object.entries(b)) values[map[k]] = String(v);
    try { await saveSettings(values, req.user.sub); } catch (err) { return reply.code(400).send({ error: err.message }); }
    req.auditSummary = `Activité : réglages (${Object.keys(b).join(', ')})`;
    return { settings: await activitySettings() };
  });
}
