// Module « Éditeur de montage » — étape E4a : demandes de rendu (routes du Studio, Studio → Activité).
//
// « Rendre la vidéo » : l'API prépare le plan de rendu (plan.js) à partir du montage ENREGISTRÉ, l'inscrit dans editor_renders,
// et le worker (majlistv-worker) le calcule quand c'est son tour (après les conversions de vidéos envoyées). Le fichier MP4 produit
// est rangé dans le stockage (editor/renders/<projet>/…) ; on le regarde ou on le télécharge depuis l'éditeur.
// Remplacer la vidéo publiée par ce fichier : étape E4b.
//
// Deux sortes de rendu : « aperçu rapide » (640 × 360, environ 0,3 × la durée) et « rendu final » (qualité de la source, jusqu'à 1080p,
// environ 1 × la durée sur le VPS, deux passes pour le niveau sonore). Un seul rendu à la fois par projet ; les 3 derniers sont gardés.
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet, deleteObject, deletePrefix, getObjectBuffer } from '../../storage.js';
import { checkTimeline, musicAssets, logoAssets, editedDuration } from './timeline.js';
import { dressDefaults } from './dress.js';
import { buildPlan, estimateSeconds, FORMATS, QUALITIES } from './plan.js';
import * as ext from '../../ext.js';
import { speakerSlug } from '../../speakers.js';
import { shortDefaults } from './short.js';
import { shortChunks, trackJobOf, pathOf } from './shorts.js';

export const KEEP_RENDERS = 3;

// Étape E6c : meilleure qualité disponible pour un rendu (côté court : 360, 720 ou 1080), lue dans la liste des qualités converties
// (master.m3u8 de la version publiée). null si illisible (le worker plafonne de toute façon à la qualité de la source).
export async function maxQualityOf(talkId) {
  try {
    const pre = (await pool.query('SELECT media_prefix FROM talks WHERE id = $1', [talkId])).rows[0]?.media_prefix || `hls/${talkId}/`;
    const text = (await getObjectBuffer(`${pre}master.m3u8`)).toString('utf8');
    const hs = [...text.matchAll(/RESOLUTION=(\d+)x(\d+)/g)].map((m) => Math.min(Number(m[1]), Number(m[2])));
    if (!hs.length) return null;
    const top = Math.max(...hs);
    return QUALITIES.filter((q) => q <= top + 8).at(-1) || 360;
  } catch { return null; }
}
const KINDS = ['preview', 'final'];

const safeName = (s) => String(s || 'montage').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 60) || 'montage';

// Ce dont le plan a besoin, lu dans la base : sous-titres, voix française, musiques, logo.
export async function planInputs(row, timeline, { cuesOf }) {
  const { cues } = await cuesOf(row);
  const media = { dub: null };
  await ext.emit('editor.media', media, { talkId: row.talk_id });
  const dub = media.dub ? { segments: media.dub.segments || [], voiceKey: media.dub.voiceKey || null, duck: media.dub.duck } : null;
  const music = {};
  const ids = musicAssets(timeline);
  if (ids.length) {
    for (const a of (await pool.query("SELECT id, key FROM editor_assets WHERE kind = 'music' AND id = ANY($1::uuid[])", [ids])).rows) music[a.id] = { key: a.key };
  }
  let logo = null;
  const d = dressDefaults(timeline.dress);
  if (d.logo.on && d.logo.asset === 'channel') {
    const slug = speakerSlug(row.speaker);
    const c = slug ? (await pool.query('SELECT avatar_key FROM speakers WHERE slug = $1', [slug])).rows[0] : null;
    if (c?.avatar_key) logo = { key: c.avatar_key };
  } else if (d.logo.on && d.logo.asset) {
    const a = (await pool.query("SELECT key FROM editor_assets WHERE id = $1 AND kind = 'logo'", [d.logo.asset])).rows[0];
    if (a) logo = { key: a.key };
  }
  return { cues, dub, music, logo };
}

async function heavyAllowed() {
  try { return (await pool.query("SELECT activity_allows('video') AS ok")).rows[0].ok; } catch { return true; }
}

async function renderView(r, title) {
  const view = {
    id: r.id, kind: r.kind, status: r.status, stage: r.stage, progress: r.progress, rev: r.rev, error: r.error || null,
    createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at, createdBy: r.created_name || null,
    duration: r.out_duration_s != null ? Number(r.out_duration_s) : Number(r.plan?.outDur) || null,
    format: r.plan?.format || (r.plan?.vertical ? '9:16' : '16:9'), fit: r.plan?.fit || null, quality: r.plan?.quality ?? null,
    bytes: r.bytes != null ? Number(r.bytes) : null, report: r.report || null, warnings: r.plan?.warnings || [], summary: r.plan?.summary || null,
    estimateS: estimateSeconds(Number(r.plan?.outDur) || 0, r.kind === 'preview'), cancelRequested: r.cancel_requested, url: null, downloadUrl: null,
  };
  if (r.status === 'ready' && r.output_key) {
    try {
      view.url = await presignGet(r.output_key);
      const day = new Date(r.finished_at || r.created_at).toISOString().slice(0, 10);
      const fmt = view.format !== '16:9' ? `-${view.format.replace(':', 'x')}` : '';
      view.downloadUrl = await presignGet(r.output_key, { download: `${safeName(title)}-${r.kind === 'preview' ? 'apercu' : 'final'}${fmt}-${day}.mp4` });
    } catch { /* stockage indisponible */ }
  }
  return view;
}

// Nouveau rendu demandé : on garde les 2 rendus terminés les plus récents (+ le nouveau = 3), les autres sont effacés (fichier compris).
async function prune(projectId, log) {
  const { rows } = await pool.query(
    `SELECT id, output_key FROM editor_renders WHERE project_id = $1 AND status NOT IN ('queued', 'running')
      ORDER BY created_at DESC OFFSET ${KEEP_RENDERS - 1}`, [projectId]);
  for (const r of rows) {
    if (r.output_key) await deleteObject(r.output_key).catch((e) => log?.warn(`Éditeur : fichier de rendu non effacé (${e.message})`));
    await pool.query('DELETE FROM editor_renders WHERE id = $1', [r.id]);
  }
}

export async function deleteProjectRenders(projectId) {
  await deletePrefix(`editor/renders/${projectId}/`).catch(() => {});
}

export default async function renderRoutes(app, { guard, editable, cuesOf, viewer }) {
  // Lancer un rendu du montage enregistré (rev = révision vue par le site : le montage doit être enregistré).
  app.post('/studio/editor/projects/:id/render', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const b = z.object({
      kind: z.enum(KINDS), rev: z.number().int().min(1),
      format: z.enum(FORMATS).default('16:9'), fit: z.enum(['blur', 'crop']).default('blur'),
      quality: z.union([z.literal(360), z.literal(720), z.literal(1080), z.null()]).default(null),
    }).parse(req.body ?? {});
    if (!editable(row)) return reply.code(409).send({ error: 'Cette conférence ne peut pas être montée.', code: 'not_editable' });
    if (b.rev !== row.rev) return reply.code(409).send({ error: 'Le montage n’est pas encore enregistré : réessayez dans un instant.', code: 'not_saved', rev: row.rev });
    const busy = (await pool.query("SELECT id FROM editor_renders WHERE project_id = $1 AND status IN ('queued', 'running') LIMIT 1", [row.id])).rows[0];
    if (busy) return reply.code(409).send({ error: 'Un rendu de ce montage est déjà en cours : attendez la fin ou annulez-le.', code: 'busy', id: busy.id });
    // Le montage enregistré est revérifié (une musique ou un logo a pu être supprimé depuis).
    const chk = checkTimeline(row.timeline, row.duration_seconds, {
      assets: new Map((await pool.query(`SELECT a.id, w.duration_s FROM editor_assets a JOIN editor_waveforms w ON w.asset_id = a.id AND w.status = 'ready' WHERE a.id = ANY($1::uuid[])`,
        [musicAssets(row.timeline)])).rows.map((x) => [x.id, Number(x.duration_s)])),
      logos: new Set((await pool.query("SELECT id FROM editor_assets WHERE kind = 'logo' AND id = ANY($1::uuid[])", [logoAssets(row.timeline)])).rows.map((x) => x.id)),
    });
    if (!chk.ok) return reply.code(400).send({ error: chk.error, code: 'invalid' });
    let plan;
    try {
      const inp = await planInputs(row, chk.timeline, { cuesOf });
      // Étape E5b : un extrait court est rendu en 9:16 (cadre, sous-titres courts, titre).
      let short = null;
      if (row.kind === 'short') {
        const cfg = shortDefaults(row.short); const c = chk.timeline.clips[0];
        const { path: framePath, notes } = pathOf(cfg, await trackJobOf(row.id), c.in, c.out); // étape E5d : le cadre suit le visage / corrections à la main
        short = { cropX: cfg.cropX, path: framePath, notes, wantCaptions: cfg.captions, captions: await shortChunks(row, cfg, c.in, c.out), titleText: cfg.showTitle ? row.title || '' : '' };
      }
      plan = buildPlan({ timeline: chk.timeline, vars: { titre: row.talk_title || '', intervenant: String(row.speaker || '').trim() }, ...inp,
        preview: b.kind === 'preview', title: row.kind === 'short' ? `${row.talk_title || ''} ${row.title || ''}`.trim() : row.talk_title || '', short,
        format: b.format, fit: b.fit, quality: b.quality });
      // Étape E6c : qualité demandée au-dessus de la source → on prévient (le rendu se fait dans la meilleure qualité disponible).
      const maxQ = b.kind === 'final' && b.quality ? await maxQualityOf(row.talk_id) : null;
      if (maxQ && b.quality > maxQ) plan.warnings.push(`Qualité ${b.quality}p demandée, mais la vidéo d’origine ne dépasse pas ${maxQ}p : le rendu est fait en ${maxQ}p (on ne peut pas inventer de détails).`);
    } catch (err) { return reply.code(400).send({ error: err.message, code: 'plan' }); }
    const r = (await pool.query(
      `INSERT INTO editor_renders(project_id, talk_id, kind, rev, timeline, plan, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [row.id, row.talk_id, b.kind, row.rev, chk.timeline, plan, req.user.sub])).rows[0];
    await prune(row.id, app.log);
    req.auditSummary = `Éditeur : ${row.kind === 'short' ? 'extrait 9:16 — ' : plan.format !== '16:9' ? `format ${plan.format} — ` : ''}${b.kind === 'preview' ? 'aperçu rapide' : 'rendu final'}${plan.quality && b.kind === 'final' ? ` ${plan.quality}p` : ''} demandé (« ${row.talk_title} », ${Math.round(plan.outDur)} s)`;
    return reply.code(201).send({ render: await renderView(r, row.talk_title), heavyAllowed: await heavyAllowed() });
  });

  // Rendus du projet (le plus récent d'abord), avec leur avancement.
  app.get('/studio/editor/projects/:id/renders', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS created_name FROM editor_renders r LEFT JOIN users u ON u.id = r.created_by WHERE r.project_id = $1 ORDER BY r.created_at DESC LIMIT 10`, [row.id]);
    const renders = [];
    for (const r of rows) renders.push(await renderView(r, row.talk_title));
    // Position dans la file des rendus (1 = le prochain).
    const waiting = rows.find((r) => r.status === 'queued');
    let position = null;
    if (waiting) position = Number((await pool.query("SELECT count(*) AS n FROM editor_renders WHERE status = 'queued' AND created_at <= (SELECT created_at FROM editor_renders WHERE id = $1)", [waiting.id])).rows[0].n);
    const running = Number((await pool.query("SELECT count(*) AS n FROM editor_renders WHERE status = 'running'")).rows[0].n);
    return { renders, rev: row.rev, editedDuration: editedDuration(row.timeline), heavyAllowed: await heavyAllowed(), position, workerBusy: running > 0, keep: KEEP_RENDERS, maxQuality: await maxQualityOf(row.talk_id) };
  });

  async function loadRender(req, reply) {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = (await pool.query('SELECT r.*, t.organizer_id, t.title AS talk_title FROM editor_renders r JOIN talks t ON t.id = r.talk_id WHERE r.id = $1', [id])).rows[0];
    if (!r || !(req.user.role === 'admin' || r.organizer_id === req.user.sub)) { reply.code(404).send({ error: 'Rendu introuvable' }); return null; }
    return r;
  }

  // Annuler : en attente → annulé tout de suite ; en cours → le worker arrête FFmpeg dans les secondes qui suivent.
  app.post('/studio/editor/renders/:id/cancel', viewer, async (req, reply) => {
    const r = await loadRender(req, reply); if (!r) return reply;
    if (!['queued', 'running'].includes(r.status)) return reply.code(409).send({ error: 'Ce rendu n’est plus en cours.', code: 'done' });
    await pool.query(
      `UPDATE editor_renders SET cancel_requested = true, status = CASE WHEN status = 'queued' THEN 'canceled' ELSE status END,
              finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END, updated_at = now() WHERE id = $1`, [r.id]);
    req.auditSummary = `Éditeur : rendu annulé (« ${r.talk_title} »)`;
    return { canceled: true };
  });

  // Effacer un rendu terminé (et son fichier).
  app.delete('/studio/editor/renders/:id', viewer, async (req, reply) => {
    const r = await loadRender(req, reply); if (!r) return reply;
    if (['queued', 'running'].includes(r.status)) return reply.code(409).send({ error: 'Annulez d’abord ce rendu.', code: 'running' });
    if (r.output_key) await deleteObject(r.output_key).catch(() => {});
    await pool.query('DELETE FROM editor_renders WHERE id = $1', [r.id]);
    req.auditSummary = `Éditeur : rendu effacé (« ${r.talk_title} »)`;
    return { deleted: true };
  });
}

// Studio → Activité : rendus en attente, en cours, et en échec (30 derniers jours).
export async function collectRenders(out, { organizerId }) {
  const { rows } = await pool.query(
    `SELECT r.id, r.kind, r.status, r.progress, r.stage, r.error, r.created_at, r.talk_id, r.project_id, t.title, p.kind AS pkind,
            (SELECT m.id FROM editor_projects m WHERE m.talk_id = r.talk_id AND m.kind = 'main') AS main_id
       FROM editor_renders r JOIN talks t ON t.id = r.talk_id JOIN editor_projects p ON p.id = r.project_id
      WHERE (r.status IN ('queued', 'running') OR (r.status = 'failed' AND r.updated_at > now() - interval '30 days'))
        AND ($1::uuid IS NULL OR t.organizer_id = $1)`, [organizerId]);
  for (const r of rows) {
    out.push({ queue: 'render', ref: r.id, talkId: r.talk_id, title: r.title || '', kind: r.kind,
      status: r.status === 'running' ? 'running' : r.status === 'failed' ? 'failed' : 'waiting', progress: r.status === 'running' ? r.progress : null,
      error: r.error, createdAt: r.created_at, shortVideo: r.pkind === 'short',
      link: r.pkind === 'short' ? (r.main_id ? `/studio/editor/${r.main_id}/shorts?s=${r.project_id}` : '/studio/editor') : `/studio/editor/${r.project_id}` });
  }
}
