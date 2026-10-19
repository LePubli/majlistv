// Module « Éditeur de montage » — étape E5b : extraits courts verticaux 9:16 (routes du Studio).
//
// Un extrait = un passage de la conférence choisi dans le texte (ou aux minutes), recadré en 9:16 avec un cadre qu'on place sur l'image,
// des sous-titres courts et un titre. C'est un projet de montage de type « short » : même file de rendu que le montage (render.js,
// le worker fabrique le MP4 vertical), mêmes droits (l'organisateur sur ses conférences, l'administrateur sur toutes).
// Pas de verrou : un extrait est un petit réglage, enregistré avec un numéro de révision (409 si quelqu'un l'a modifié entre-temps).
import { z } from 'zod';
import { pool } from '../../db.js';
import { checkTimeline } from './timeline.js';
import { wordsOf } from './words.js';
import { deleteProjectRenders } from './render.js';
import { shortConfigSchema, shortDefaults, checkPassage, shortTimeline, chunkCaptions, MIN_SHORT, MAX_SHORT, MAX_SHORTS } from './short.js';

const idSchema = z.object({ id: z.string().uuid() });
const SHORT_SQL = `
  SELECT p.*, t.organizer_id, t.title AS talk_title, t.speaker, t.duration_seconds, t.source, t.video_status,
         COALESCE(t.transcript_language, t.language) AS lang
    FROM editor_projects p JOIN talks t ON t.id = p.talk_id`;

// Sous-titres courts d'un extrait : groupes de mots du passage, dans la langue choisie (langue parlée par défaut).
export async function shortChunks(row, cfg, from, to) {
  if (!cfg.captions) return [];
  const origin = (await pool.query('SELECT transcript_language FROM talks WHERE id = $1', [row.talk_id])).rows[0]?.transcript_language || row.lang || null;
  const w = await wordsOf(row.talk_id, origin, cfg.lang || undefined);
  const words = [];
  for (const seg of w.segments) {
    if (seg.e < from - 0.5 || seg.s > to + 0.5) continue;
    for (const x of seg.words) words.push(x);
  }
  return chunkCaptions(words, from, to);
}

const clipOf = (row) => row.timeline.clips[0];

async function shortView(row, { chunks = false } = {}) {
  const cfg = shortDefaults(row.short);
  const c = clipOf(row);
  const last = (await pool.query(
    `SELECT id, kind, status, progress, created_at, out_duration_s, plan->>'vertical' AS vertical FROM editor_renders WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, [row.id])).rows[0];
  return {
    id: row.id, talkId: row.talk_id, title: row.title || '', from: c.in, to: c.out, length: Math.round((c.out - c.in) * 1000) / 1000, rev: row.rev, ...cfg,
    updatedAt: row.updated_at, sourceDuration: Number(row.duration_seconds) || null,
    lastRender: last ? { id: last.id, kind: last.kind, status: last.status, progress: last.progress, createdAt: last.created_at, duration: last.out_duration_s != null ? Number(last.out_duration_s) : null } : null,
    ...(chunks ? { chunks: await shortChunks(row, cfg, c.in, c.out) } : {}),
  };
}

export default async function shortRoutes(app, { guard, viewer, editable, mediaOf }) {
  async function loadShort(req, reply) {
    const { id } = idSchema.parse(req.params);
    const row = (await pool.query(`${SHORT_SQL} WHERE p.id = $1 AND p.kind = 'short'`, [id])).rows[0];
    if (!row || !(req.user.role === 'admin' || row.organizer_id === req.user.sub)) { reply.code(404).send({ error: 'Extrait introuvable' }); return null; }
    return row;
  }

  // Les extraits d'une conférence (id = le montage de la conférence, comme dans l'éditeur).
  app.get('/studio/editor/projects/:id/shorts', viewer, async (req, reply) => {
    const main = await guard(req, reply); if (!main) return reply;
    const rows = (await pool.query(`${SHORT_SQL} WHERE p.talk_id = $1 AND p.kind = 'short' ORDER BY p.created_at DESC`, [main.talk_id])).rows;
    const shorts = [];
    for (const r of rows) shorts.push(await shortView(r));
    return { shorts, talk: { id: main.talk_id, title: main.talk_title, duration: Number(main.duration_seconds) || null }, editable: editable(main), limits: { min: MIN_SHORT, max: MAX_SHORT, count: MAX_SHORTS } };
  });

  // Nouvel extrait.
  app.post('/studio/editor/projects/:id/shorts', viewer, async (req, reply) => {
    const main = await guard(req, reply); if (!main) return reply;
    if (!editable(main)) return reply.code(409).send({ error: 'Cette conférence ne peut pas être montée.', code: 'not_editable' });
    const b = z.object({ from: z.number().finite(), to: z.number().finite(), title: z.string().trim().max(90).optional(), cropX: z.number().min(0).max(100).optional() }).parse(req.body ?? {});
    const p = checkPassage(b.from, b.to, main.duration_seconds);
    if (!p.ok) return reply.code(400).send({ error: p.error, code: 'passage' });
    const n = Number((await pool.query("SELECT count(*) AS n FROM editor_projects WHERE talk_id = $1 AND kind = 'short'", [main.talk_id])).rows[0].n);
    if (n >= MAX_SHORTS) return reply.code(409).send({ error: `${MAX_SHORTS} extraits au plus par conférence : supprimez-en un.`, code: 'too_many' });
    const cfg = shortDefaults({ cropX: b.cropX });
    const chk = checkTimeline(shortTimeline(p.from, p.to, main.duration_seconds, cfg), main.duration_seconds);
    if (!chk.ok) return reply.code(400).send({ error: chk.error });
    const r = (await pool.query(
      `INSERT INTO editor_projects(talk_id, kind, title, timeline, short, created_by, updated_by) VALUES ($1, 'short', $2, $3, $4, $5, $5) RETURNING id`,
      [main.talk_id, b.title || `Extrait ${n + 1}`, chk.timeline, cfg, req.user.sub])).rows[0];
    const row = (await pool.query(`${SHORT_SQL} WHERE p.id = $1`, [r.id])).rows[0];
    req.auditSummary = `Éditeur : extrait court créé (« ${main.talk_title} », ${Math.round(p.to - p.from)} s)`;
    return reply.code(201).send({ short: await shortView(row, { chunks: true }) });
  });

  // Un extrait : réglages, sous-titres courts, aperçu 360p de la conférence.
  app.get('/studio/editor/shorts/:id', viewer, async (req, reply) => {
    const row = await loadShort(req, reply); if (!row) return reply;
    const media = editable(row) ? await mediaOf(row) : null;
    return { short: await shortView(row, { chunks: true }), media: media ? { preview: media.preview, hasDub: Boolean(media.dub?.track), subtitleLang: media.subtitles?.lang || null } : null, editable: editable(row),
      limits: { min: MIN_SHORT, max: MAX_SHORT } };
  });

  // Régler un extrait (passage, cadre, sous-titres, titre, voix). rev : révision vue par le site.
  app.put('/studio/editor/shorts/:id', viewer, async (req, reply) => {
    const row = await loadShort(req, reply); if (!row) return reply;
    const b = z.object({
      rev: z.number().int().min(1), title: z.string().trim().max(90).optional(), from: z.number().finite().optional(), to: z.number().finite().optional(),
      cropX: shortConfigSchema.shape.cropX.optional(), captions: z.boolean().optional(), lang: shortConfigSchema.shape.lang.optional(), dub: z.boolean().optional(), showTitle: z.boolean().optional(),
    }).parse(req.body ?? {});
    if (b.rev !== row.rev) return reply.code(409).send({ error: 'Cet extrait a été modifié ailleurs : la page se met à jour.', code: 'conflict', short: await shortView(row, { chunks: true }) });
    const c = clipOf(row);
    const p = checkPassage(b.from ?? c.in, b.to ?? c.out, row.duration_seconds);
    if (!p.ok) return reply.code(400).send({ error: p.error, code: 'passage' });
    const cfg = shortDefaults({ ...shortDefaults(row.short), ...Object.fromEntries(['cropX', 'captions', 'lang', 'dub', 'showTitle'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]])) });
    const chk = checkTimeline(shortTimeline(p.from, p.to, row.duration_seconds, cfg), row.duration_seconds);
    if (!chk.ok) return reply.code(400).send({ error: chk.error });
    const u = await pool.query(
      `UPDATE editor_projects SET title = COALESCE($3, title), timeline = $4, short = $5, rev = rev + 1, updated_at = now(), updated_by = $6 WHERE id = $1 AND rev = $2 RETURNING id`,
      [row.id, b.rev, b.title ?? null, chk.timeline, cfg, req.user.sub]);
    if (!u.rowCount) return reply.code(409).send({ error: 'Cet extrait a été modifié ailleurs : la page se met à jour.', code: 'conflict' });
    const fresh = (await pool.query(`${SHORT_SQL} WHERE p.id = $1`, [row.id])).rows[0];
    return { short: await shortView(fresh, { chunks: true }) };
  });

  // Supprimer un extrait (et ses fichiers de rendu).
  app.delete('/studio/editor/shorts/:id', viewer, async (req, reply) => {
    const row = await loadShort(req, reply); if (!row) return reply;
    const busy = (await pool.query("SELECT 1 FROM editor_renders WHERE project_id = $1 AND status IN ('queued', 'running')", [row.id])).rows[0];
    if (busy) return reply.code(409).send({ error: 'Un rendu de cet extrait est en cours : annulez-le d’abord.', code: 'running' });
    await pool.query('DELETE FROM editor_projects WHERE id = $1', [row.id]);
    await deleteProjectRenders(row.id);
    req.auditSummary = `Éditeur : extrait court supprimé (« ${row.talk_title} »)`;
    return { deleted: true };
  });
}
