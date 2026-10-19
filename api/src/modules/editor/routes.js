// Module « Éditeur de montage » — routes du Studio (étape E1) : projets, sauvegarde automatique, versions, verrou.
//
// Droits : l'organisateur sur ses conférences, l'administrateur sur toutes (le modérateur n'a pas accès à l'éditeur).
// Seules les vidéos ENVOYÉES et converties se montent (YouTube, Vimeo et archive.org ne sont pas hébergées chez nous).
//
// Verrou : une seule personne, dans un seul onglet (« séance »), modifie un projet. Le site renouvelle le verrou toutes les
// 25 s ; sans nouvelles pendant 75 s il expire. Les autres voient le projet en lecture seule. On peut reprendre la main :
// soi-même depuis un autre onglet, ou l'administrateur sur le projet d'un organisateur (journal d'audit).
//
// Sauvegarde : chaque enregistrement envoie le numéro de révision qu'il remplace (rev). Si quelqu'un a écrit entre-temps,
// la réponse est 409 et le site repasse en lecture seule avec le montage à jour : rien n'est écrasé sans le savoir.
// Versions : une copie automatique avant le premier enregistrement de chaque séance, des copies nommées à la main,
// et une copie avant chaque restauration. Les 30 copies automatiques les plus récentes sont gardées (les nommées, toutes).
import { z } from 'zod';
import { pool } from '../../db.js';
import crypto from 'node:crypto';
import { storage, presignGet, presignPut, headObject, deleteObject } from '../../storage.js';
import { makePlaybackToken } from '../../playback.js';
import * as ext from '../../ext.js';
import { checkTimeline, initialTimeline, editedDuration, isEdited, musicAssets, logoAssets, audioDefaults, DENOISE } from './timeline.js';
import { dressDefaults, checkDress, renderFrame, probeImage } from './dress.js';
import { speakerSlug } from '../../speakers.js';
import renderRoutes, { deleteProjectRenders } from './render.js';
import replaceRoutes from './replace.js';
import { ensureTalkWaveforms, ensureAssetWaveform, waveView, processQueue, denoiseSample, hasFfmpeg, STEP_MS } from './audio.js';

const MUSIC_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/webm': 'webm' };
const MUSIC_MAX_MB = 60;

// Musiques prêtes (analysées) : Map(id → durée en secondes), pour vérifier les montages.
async function readyAssets(ids) {
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT a.id, w.duration_s FROM editor_assets a JOIN editor_waveforms w ON w.asset_id = a.id AND w.status = 'ready' WHERE a.id = ANY($1::uuid[])`, [ids]);
  return new Map(rows.map((r) => [r.id, Number(r.duration_s)]));
}
// Logos importés qui existent encore : Set d'identifiants.
async function knownLogos(ids) {
  if (!ids.length) return new Set();
  return new Set((await pool.query("SELECT id FROM editor_assets WHERE kind = 'logo' AND id = ANY($1::uuid[])", [ids])).rows.map((r) => r.id));
}
async function musicView(row) {
  let url = null;
  try { url = await presignGet(row.key); } catch { url = null; }
  return { id: row.id, title: row.title, license: row.license, bytes: Number(row.bytes), createdAt: row.created_at, createdBy: row.created_name || null,
    status: row.status || 'queued', durationS: row.duration_s == null ? null : Number(row.duration_s), lufs: row.lufs == null ? null : Number(row.lufs), error: row.error || null, url };
}
const MUSIC_SQL = `SELECT a.*, u.name AS created_name, w.status, w.duration_s, w.lufs, w.error, w.peaks, w.step_ms FROM editor_assets a
  LEFT JOIN editor_waveforms w ON w.asset_id = a.id LEFT JOIN users u ON u.id = a.created_by`;
const MUSIC_ONLY = "a.kind = 'music'";

export const LOCK_TTL_S = 75;
const AUTO_KEEP = 30;
const idSchema = z.object({ id: z.string().uuid() });
const session = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Séance invalide');

// Conférence + projet, avec l'état du verrou calculé par la base (même horloge pour tout le monde).
const PROJECT_SQL = `
  SELECT p.*, t.organizer_id, t.title AS talk_title, t.speaker, t.duration_seconds, t.source, t.video_status, t.poster_key, t.external_thumb,
         COALESCE(t.transcript_language, t.language) AS lang,
         (p.lock_until IS NOT NULL AND p.lock_until > now()) AS lock_active, lu.name AS lock_name, uu.name AS updated_name
    FROM editor_projects p JOIN talks t ON t.id = p.talk_id
    LEFT JOIN users lu ON lu.id = p.lock_user LEFT JOIN users uu ON uu.id = p.updated_by`;

const canSee = (user, row) => user.role === 'admin' || row.organizer_id === user.sub;
const editable = (t) => t.source === 'upload' && t.video_status === 'ready' && Number(t.duration_seconds) > 0;

function lockView(row, user, sess) {
  const active = Boolean(row.lock_active);
  const mine = active && row.lock_user === user.sub && row.lock_session === sess;
  return {
    active, mine,
    otherTab: active && !mine && row.lock_user === user.sub, // moi, dans un autre onglet
    by: active ? row.lock_name || '' : null,
    since: active ? row.lock_since : null,
    until: active ? row.lock_until : null,
    canTake: active && !mine && (row.lock_user === user.sub || user.role === 'admin'),
  };
}

async function loadProject(id) {
  return (await pool.query(`${PROJECT_SQL} WHERE p.id = $1`, [id])).rows[0] || null;
}

async function lastVersion(projectId) {
  return (await pool.query('SELECT n, timeline FROM editor_versions WHERE project_id = $1 ORDER BY n DESC LIMIT 1', [projectId])).rows[0] || null;
}

// Copie du montage actuel en version (sauf si elle est identique à la dernière version).
async function snapshot(client, projectId, timeline, userId, { label = '', auto = true, force = false } = {}) {
  const last = (await client.query('SELECT n, timeline FROM editor_versions WHERE project_id = $1 ORDER BY n DESC LIMIT 1', [projectId])).rows[0];
  // Identique à la dernière version (extraits, son et habillage) : rien à copier.
  const same = (a, b) => JSON.stringify([a.clips, a.audio ?? null, a.dress ?? null]) === JSON.stringify([b.clips, b.audio ?? null, b.dress ?? null]);
  if (!force && last && same(last.timeline, timeline)) return last.n;
  const n = (last?.n || 0) + 1;
  await client.query('INSERT INTO editor_versions(project_id, n, label, auto, timeline, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
    [projectId, n, label.slice(0, 120), auto, timeline, userId]);
  // On garde les 30 copies automatiques les plus récentes ; les versions nommées restent toutes.
  await client.query(
    `DELETE FROM editor_versions WHERE project_id = $1 AND auto AND n NOT IN
       (SELECT n FROM editor_versions WHERE project_id = $1 AND auto ORDER BY n DESC LIMIT ${AUTO_KEEP})`, [projectId]);
  return n;
}

async function posterOf(r) {
  try { return r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null); } catch { return null; }
}

// Ce que le site affiche d'un projet.
async function projectView(row, user, sess) {
  const versions = (await pool.query('SELECT count(*)::int AS n, max(n) AS last FROM editor_versions WHERE project_id = $1', [row.id])).rows[0];
  return {
    id: row.id, kind: row.kind, title: row.title || row.talk_title, rev: row.rev, timeline: row.timeline,
    editedDuration: editedDuration(row.timeline), edited: isEdited(row.timeline),
    updatedAt: row.updated_at, updatedBy: row.updated_name || null, createdAt: row.created_at,
    versionCount: versions.n, versionNumber: (versions.last || 0) + 1, // la version en cours de travail
    lock: lockView(row, user, sess),
    talk: { id: row.talk_id, title: row.talk_title, speaker: row.speaker, durationSeconds: Number(row.duration_seconds) || null, lang: row.lang, posterUrl: await posterOf(row) },
  };
}

// Sous-titres de la conférence (français si possible) : { lang, cues: [{ s, e, text }] } en temps source.
async function cuesOf(row) {
  const langs = (await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1', [row.talk_id])).rows.map((r) => r.lang);
  const lang = langs.includes('fr') ? 'fr' : langs.find((l) => String(row.lang || '').startsWith(l)) || langs[0] || null;
  const cues = lang ? (await pool.query(
    'SELECT start_ms / 1000.0 AS s, end_ms / 1000.0 AS e, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx LIMIT 6000',
    [row.talk_id, lang])).rows.map((c) => ({ s: Number(c.s), e: Number(c.e), text: c.text })) : [];
  return { lang, cues };
}

// Chaîne de la conférence (étape C : speakers) : nom, adresse stable, image de la chaîne (avatar) servant de logo par défaut.
async function channelOf(row) {
  const slug = speakerSlug(row.speaker);
  if (!slug) return null;
  const c = (await pool.query('SELECT slug, name, avatar_key FROM speakers WHERE slug = $1', [slug])).rows[0];
  let avatarUrl = null;
  try { avatarUrl = c?.avatar_key ? await presignGet(c.avatar_key) : null; } catch { avatarUrl = null; }
  return { slug, name: c?.name || String(row.speaker).trim(), avatarUrl };
}

// Pistes liées montrées sous la vidéo : sous-titres (français si possible), et ce que les modules ajoutent (doublage).
async function mediaOf(row) {
  const token = makePlaybackToken(row.talk_id, 8 * 3600);
  const { lang, cues } = await cuesOf(row);
  const out = {
    // Aperçu : la qualité 360p déjà produite par la conversion (playlist v0), lue par le navigateur.
    preview: { hls: `/hls/${row.talk_id}/v0/index.m3u8?t=${encodeURIComponent(token)}`, quality: '360p' },
    subtitles: { lang, cues },
    dub: null, // rempli par le module « Doublage français » (événement editor.media)
  };
  await ext.emit('editor.media', out, { talkId: row.talk_id });
  if (out.dub) { delete out.dub.trackId; delete out.dub.voiceKey; } // servent à l'API seulement (forme d'onde périmée, rendu)
  // Étape E2 : réglages du son par défaut (le volume de la voix d'origine sous la voix française vient du doublage).
  out.audioDefaults = audioDefaults(null, { duck: out.dub?.duck });
  out.denoiseLevels = DENOISE;
  // Étape E3 : habillage — chaîne (logo par défaut), valeurs des variables {titre} et {intervenant}, réglages par défaut.
  out.dress = { channel: await channelOf(row), vars: { titre: row.talk_title || '', intervenant: String(row.speaker || '').trim() }, defaults: dressDefaults(null) };
  return out;
}

export default async function routes(app) {
  const viewer = { preHandler: app.requireRole('organizer', 'admin') };

  async function guard(req, reply) {
    const { id } = idSchema.parse(req.params);
    const row = await loadProject(id);
    if (!row || !canSee(req.user, row)) { reply.code(404).send({ error: 'Projet introuvable' }); return null; }
    return row;
  }

  // Liste : mes projets (tous pour l'administrateur) et les conférences qu'on peut monter.
  app.get('/studio/editor/projects', viewer, async (req) => {
    const admin = req.user.role === 'admin';
    const { rows } = await pool.query(`${PROJECT_SQL} WHERE ($1::uuid IS NULL OR t.organizer_id = $1) ORDER BY p.updated_at DESC LIMIT 300`, [admin ? null : req.user.sub]);
    const projects = [];
    for (const r of rows) {
      projects.push({
        id: r.id, kind: r.kind, title: r.title || r.talk_title, talkId: r.talk_id, speaker: r.speaker, updatedAt: r.updated_at, updatedBy: r.updated_name,
        sourceDuration: Number(r.duration_seconds) || null, editedDuration: editedDuration(r.timeline), clips: r.timeline.clips.length, edited: isEdited(r.timeline),
        lock: lockView(r, req.user, null), posterUrl: await posterOf(r), canOpen: editable(r),
      });
    }
    const talks = (await pool.query(
      `SELECT t.id, t.title, t.speaker, t.duration_seconds, t.source, t.video_status, t.poster_key, t.external_thumb, t.created_at
         FROM talks t WHERE ($1::uuid IS NULL OR t.organizer_id = $1)
          AND NOT EXISTS (SELECT 1 FROM editor_projects p WHERE p.talk_id = t.id AND p.kind = 'main')
        ORDER BY t.created_at DESC LIMIT 300`, [admin ? null : req.user.sub])).rows;
    const out = [];
    for (const t of talks) {
      out.push({ id: t.id, title: t.title, speaker: t.speaker, durationSeconds: Number(t.duration_seconds) || null, source: t.source,
        editable: editable(t), reason: editable(t) ? null : t.source !== 'upload' ? 'external' : 'video', posterUrl: await posterOf(t) });
    }
    return { projects, talks: out, lockTtl: LOCK_TTL_S };
  });

  // Nouveau montage d'une conférence (ou le montage existant s'il y en a déjà un).
  app.post('/studio/editor/projects', viewer, async (req, reply) => {
    const { talkId } = z.object({ talkId: z.string().uuid() }).parse(req.body ?? {});
    const t = (await pool.query('SELECT id, organizer_id, title, source, video_status, duration_seconds FROM talks WHERE id = $1', [talkId])).rows[0];
    if (!t || !canSee(req.user, t)) return reply.code(404).send({ error: 'Conférence introuvable' });
    const existing = (await pool.query("SELECT id FROM editor_projects WHERE talk_id = $1 AND kind = 'main'", [talkId])).rows[0];
    if (existing) return reply.code(200).send({ id: existing.id, created: false });
    if (!editable(t)) {
      return reply.code(409).send({ code: t.source !== 'upload' ? 'external' : 'video',
        error: t.source !== 'upload' ? 'Les vidéos YouTube, Vimeo et archive.org ne sont pas hébergées ici : elles ne se montent pas.' : 'La vidéo doit d’abord être convertie.' });
    }
    const r = await pool.query(
      `INSERT INTO editor_projects(talk_id, kind, timeline, created_by, updated_by) VALUES ($1, 'main', $2, $3, $3)
       ON CONFLICT (talk_id) WHERE kind = 'main' DO NOTHING RETURNING id`, [talkId, initialTimeline(Number(t.duration_seconds)), req.user.sub]);
    if (!r.rows[0]) return reply.code(200).send({ id: (await pool.query("SELECT id FROM editor_projects WHERE talk_id = $1 AND kind = 'main'", [talkId])).rows[0].id, created: false });
    return reply.code(201).send({ id: r.rows[0].id, created: true });
  });

  // Ouvrir un projet : montage, verrou, aperçu 360p, pistes liées.
  app.get('/studio/editor/projects/:id', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const sess = typeof req.query.session === 'string' ? req.query.session : null;
    return { project: await projectView(row, req.user, sess), media: editable(row) ? await mediaOf(row) : null, editable: editable(row), lockTtl: LOCK_TTL_S };
  });

  // Prendre ou renouveler le verrou (toutes les 25 s pendant qu'on modifie).
  app.post('/studio/editor/projects/:id/lock', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { session: sess } = z.object({ session }).parse(req.body ?? {});
    if (!editable(row)) return reply.code(409).send({ error: 'Cette conférence ne peut pas être montée.', code: 'not_editable' });
    const r = await pool.query(
      `UPDATE editor_projects SET lock_user = $2, lock_session = $3,
              lock_since = CASE WHEN lock_user = $2 AND lock_session = $3 AND lock_until > now() THEN lock_since ELSE now() END,
              lock_until = now() + interval '${LOCK_TTL_S} seconds'
        WHERE id = $1 AND (lock_until IS NULL OR lock_until <= now() OR (lock_user = $2 AND lock_session = $3)) RETURNING id`,
      [row.id, req.user.sub, sess]);
    const now = await loadProject(row.id);
    return { acquired: r.rowCount === 1, lock: lockView(now, req.user, sess), rev: now.rev };
  });

  // Reprendre la main : soi-même depuis un autre onglet, ou l'administrateur (inscrit au journal d'audit).
  app.post('/studio/editor/projects/:id/takeover', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { session: sess } = z.object({ session }).parse(req.body ?? {});
    const v = lockView(row, req.user, sess);
    if (v.active && !v.mine && !v.canTake) return reply.code(403).send({ error: 'Le projet est en cours de modification par une autre personne.' });
    if (v.active && !v.mine) req.auditSummary = `Éditeur : reprise du projet de montage « ${row.talk_title} » (modifié par ${row.lock_name || 'quelqu’un'})`;
    await pool.query(
      `UPDATE editor_projects SET lock_user = $2, lock_session = $3, lock_since = now(), lock_until = now() + interval '${LOCK_TTL_S} seconds' WHERE id = $1`,
      [row.id, req.user.sub, sess]);
    const now = await loadProject(row.id);
    return { acquired: true, lock: lockView(now, req.user, sess), rev: now.rev, timeline: now.timeline };
  });

  // Rendre la main (fermeture de l'onglet, bouton « Terminer »).
  app.post('/studio/editor/projects/:id/unlock', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { session: sess } = z.object({ session }).parse(req.body ?? {});
    const r = await pool.query('UPDATE editor_projects SET lock_until = NULL, lock_session = NULL WHERE id = $1 AND lock_user = $2 AND lock_session = $3', [row.id, req.user.sub, sess]);
    return { released: r.rowCount === 1 };
  });

  // Sauvegarde automatique.
  app.put('/studio/editor/projects/:id', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const body = z.object({ timeline: z.unknown(), rev: z.number().int().min(1), session }).parse(req.body ?? {});
    const v = lockView(row, req.user, body.session);
    // Verrou expiré sans que personne ne l'ait pris (veille de l'ordinateur…) : on le reprend en silence.
    if (!v.mine && v.active) return reply.code(423).send({ error: `Projet en cours de modification par ${row.lock_name || 'une autre personne'}.`, code: 'locked', lock: v });
    if (body.rev !== row.rev) return reply.code(409).send({ error: 'Le montage a été modifié ailleurs entre-temps.', code: 'conflict', rev: row.rev, timeline: row.timeline });
    const chk = checkTimeline(body.timeline, row.duration_seconds, { assets: await readyAssets(musicAssets(body.timeline)), logos: await knownLogos(logoAssets(body.timeline)) });
    if (!chk.ok) return reply.code(400).send({ error: chk.error, code: 'invalid' });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Copie automatique de l'état d'avant, au premier enregistrement de la séance.
      if (row.versioned_session !== body.session) await snapshot(c, row.id, row.timeline, req.user.sub, { label: '' });
      const u = await c.query(
        `UPDATE editor_projects SET timeline = $2, rev = rev + 1, updated_by = $3, updated_at = now(), versioned_session = $4,
                lock_user = $3, lock_session = $4, lock_since = COALESCE(CASE WHEN lock_until > now() THEN lock_since END, now()),
                lock_until = now() + interval '${LOCK_TTL_S} seconds'
          WHERE id = $1 AND rev = $5 RETURNING rev, updated_at`, [row.id, chk.timeline, req.user.sub, body.session, body.rev]);
      if (!u.rows[0]) { await c.query('ROLLBACK'); const cur = await loadProject(row.id); return reply.code(409).send({ error: 'Le montage a été modifié ailleurs entre-temps.', code: 'conflict', rev: cur.rev, timeline: cur.timeline }); }
      await c.query('COMMIT');
      const last = await lastVersion(row.id);
      return { rev: u.rows[0].rev, savedAt: u.rows[0].updated_at, versionNumber: (last?.n || 0) + 1, editedDuration: editedDuration(chk.timeline) };
    } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
  });

  // Versions du projet.
  app.get('/studio/editor/projects/:id/versions', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { rows } = await pool.query(
      `SELECT v.n, v.label, v.auto, v.created_at AS "createdAt", u.name AS "createdBy", v.timeline FROM editor_versions v
         LEFT JOIN users u ON u.id = v.created_by WHERE v.project_id = $1 ORDER BY v.n DESC`, [row.id]);
    return {
      versions: rows.map(({ timeline, ...v }) => ({ ...v, clips: timeline.clips.length, editedDuration: editedDuration(timeline) })),
      current: { versionNumber: (rows[0]?.n || 0) + 1, updatedAt: row.updated_at, updatedBy: row.updated_name, clips: row.timeline.clips.length, editedDuration: editedDuration(row.timeline) },
    };
  });

  // Enregistrer une version nommée (copie du montage actuel).
  app.post('/studio/editor/projects/:id/versions', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { label, session: sess } = z.object({ label: z.string().trim().min(1, 'Donnez un nom à la version').max(120), session }).parse(req.body ?? {});
    if (!lockView(row, req.user, sess).mine) return reply.code(423).send({ error: 'Prenez la main sur le projet pour enregistrer une version.', code: 'locked' });
    const c = await pool.connect();
    try {
      const n = await snapshot(c, row.id, row.timeline, req.user.sub, { label, auto: false, force: true });
      return reply.code(201).send({ n, versionNumber: n + 1 });
    } finally { c.release(); }
  });

  // Revenir à une version : le montage actuel est d'abord copié (« Avant le retour à la version N »).
  app.post('/studio/editor/projects/:id/versions/:n/restore', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const n = z.coerce.number().int().min(1).parse(req.params.n);
    const { session: sess } = z.object({ session }).parse(req.body ?? {});
    if (!lockView(row, req.user, sess).mine) return reply.code(423).send({ error: 'Prenez la main sur le projet pour revenir à une version.', code: 'locked' });
    const ver = (await pool.query('SELECT timeline FROM editor_versions WHERE project_id = $1 AND n = $2', [row.id, n])).rows[0];
    if (!ver) return reply.code(404).send({ error: 'Version introuvable' });
    const chk = checkTimeline(ver.timeline, row.duration_seconds, { assets: await readyAssets(musicAssets(ver.timeline)), logos: await knownLogos(logoAssets(ver.timeline)) });
    if (!chk.ok) return reply.code(409).send({ error: `Cette version ne correspond plus à la vidéo : ${chk.error}` });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await snapshot(c, row.id, row.timeline, req.user.sub, { label: `Avant le retour à la version ${n}`, auto: true });
      const u = await c.query(
        `UPDATE editor_projects SET timeline = $2, rev = rev + 1, updated_by = $3, updated_at = now(), versioned_session = $4 WHERE id = $1 RETURNING rev, updated_at`,
        [row.id, chk.timeline, req.user.sub, sess]);
      await c.query('COMMIT');
      const last = await lastVersion(row.id);
      return { rev: u.rows[0].rev, savedAt: u.rows[0].updated_at, timeline: chk.timeline, versionNumber: (last?.n || 0) + 1 };
    } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
  });

  // --- Étape E2 : son

  const kick = () => setImmediate(() => processQueue(app.log).catch((e) => app.log.warn(`Éditeur : ${e.message}`)));

  // Formes d'onde et niveaux mesurés du projet : voix d'origine, voix française, musiques utilisées. Met en file ce qui manque.
  app.get('/studio/editor/projects/:id/audio', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    if (!editable(row)) return { orig: null, dub: null, music: {}, ffmpeg: await hasFfmpeg(), stepMs: STEP_MS };
    await ensureTalkWaveforms(row.talk_id);
    const w = (await pool.query("SELECT * FROM editor_waveforms WHERE talk_id = $1", [row.talk_id])).rows;
    const ids = musicAssets(row.timeline);
    const music = {};
    if (ids.length) for (const m of (await pool.query(`${MUSIC_SQL} WHERE a.id = ANY($1::uuid[])`, [ids])).rows) music[m.id] = { ...(await musicView(m)), wave: m.status ? waveView(m) : null };
    if (w.some((x) => x.status === 'queued')) kick();
    return { orig: waveView(w.find((x) => x.kind === 'orig')), dub: waveView(w.find((x) => x.kind === 'dub')), music, ffmpeg: await hasFfmpeg(), stepMs: STEP_MS };
  });

  // Relancer une analyse en échec.
  app.post('/studio/editor/projects/:id/audio/retry', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const r = await pool.query("UPDATE editor_waveforms SET status = 'queued', attempts = 0, error = NULL, updated_at = now() WHERE talk_id = $1 AND status = 'failed'", [row.talk_id]);
    kick();
    return { requeued: r.rowCount };
  });

  // Écouter 10 s de la voix d'origine avec la réduction du bruit choisie (ou sans), à un endroit de la vidéo d'origine.
  let sampling = 0;
  app.post('/studio/editor/projects/:id/denoise-sample', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { at, level } = z.object({ at: z.number().min(0), level: z.enum(DENOISE) }).parse(req.body ?? {});
    if (!editable(row)) return reply.code(409).send({ error: 'Cette conférence ne peut pas être montée.', code: 'not_editable' });
    if (!(await hasFfmpeg())) return reply.code(503).send({ error: 'FFmpeg est absent de l’image de l’API : redéployez majlistv-api.', code: 'no_ffmpeg' });
    if (sampling >= 2) return reply.code(429).send({ error: 'Un extrait est déjà en préparation : réessayez dans quelques secondes.' });
    sampling += 1;
    try {
      const buf = await denoiseSample(row.talk_id, Math.min(at, Math.max(0, Number(row.duration_seconds) - 10)), level);
      return reply.header('content-type', 'audio/mp4').header('cache-control', 'no-store').send(buf);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    } finally { sampling -= 1; }
  });

  // --- Bibliothèque de musiques (commune à tous les montages ; l'administrateur importe, tout le monde utilise)
  app.get('/studio/editor/music', viewer, async (req) => {
    const { rows } = await pool.query(`${MUSIC_SQL} WHERE ${MUSIC_ONLY} ORDER BY a.created_at DESC LIMIT 500`);
    const out = [];
    for (const r of rows) out.push(await musicView(r));
    if (rows.some((r) => r.status === 'queued')) kick();
    return { music: out, canImport: req.user.role === 'admin', maxMb: MUSIC_MAX_MB };
  });

  app.get('/studio/editor/music/:id', viewer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = (await pool.query(`${MUSIC_SQL} WHERE a.id = $1 AND ${MUSIC_ONLY}`, [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Musique introuvable' });
    return { music: { ...(await musicView(r)), wave: r.status ? waveView(r) : null } };
  });

  const admin = { preHandler: app.requireRole('admin') };
  app.post('/studio/editor/music/upload-url', admin, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré', code: 'storage_off' });
    const { contentType, size } = z.object({ contentType: z.string(), size: z.number().int().positive().optional() }).parse(req.body ?? {});
    const ext0 = MUSIC_TYPES[contentType.toLowerCase()];
    if (!ext0) return reply.code(400).send({ error: 'Format audio non accepté (mp3, m4a, aac, wav, ogg, flac, webm)', code: 'bad_type' });
    if (size && size > MUSIC_MAX_MB * 1048576) return reply.code(400).send({ error: `Fichier trop lourd (${MUSIC_MAX_MB} Mo maximum)`, code: 'too_big' });
    const key = `editor/music/${crypto.randomUUID()}.${ext0}`;
    return { key, url: await presignPut(key, contentType.toLowerCase()), maxBytes: MUSIC_MAX_MB * 1048576 };
  });

  app.post('/studio/editor/music', admin, async (req, reply) => {
    const b = z.object({ key: z.string().regex(/^editor\/music\/[0-9a-f-]{36}\.(mp3|m4a|aac|wav|ogg|flac|webm)$/, 'Fichier inattendu'),
      title: z.string().trim().min(1, 'Donnez un titre').max(120), license: z.string().trim().max(300).default(''),
      contentType: z.string().max(60) }).parse(req.body ?? {});
    let size;
    try { size = Number((await headObject(b.key)).ContentLength); } catch { return reply.code(400).send({ error: "La musique n'a pas été reçue : recommencez l'envoi", code: 'missing' }); }
    if (size > MUSIC_MAX_MB * 1048576) { await deleteObject(b.key).catch(() => {}); return reply.code(400).send({ error: `Fichier trop lourd (${MUSIC_MAX_MB} Mo maximum)`, code: 'too_big' }); }
    const r = await pool.query('INSERT INTO editor_assets(title, license, key, mime, bytes, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [b.title, b.license, b.key, b.contentType.toLowerCase(), size, req.user.sub]);
    await ensureAssetWaveform(r.rows[0].id, b.key);
    kick();
    const row = (await pool.query(`${MUSIC_SQL} WHERE a.id = $1`, [r.rows[0].id])).rows[0];
    return reply.code(201).send({ music: await musicView(row) });
  });

  app.patch('/studio/editor/music/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ title: z.string().trim().min(1).max(120).optional(), license: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const r = await pool.query('UPDATE editor_assets SET title = COALESCE($2, title), license = COALESCE($3, license) WHERE id = $1 AND kind = \'music\' RETURNING id', [id, b.title ?? null, b.license ?? null]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Musique introuvable' });
    return { music: await musicView((await pool.query(`${MUSIC_SQL} WHERE a.id = $1`, [id])).rows[0]) };
  });

  // Supprimer une musique : refusé tant qu'un montage (ou une de ses versions) l'utilise.
  app.delete('/studio/editor/music/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const a = (await pool.query("SELECT key, title FROM editor_assets WHERE id = $1 AND kind = 'music'", [id])).rows[0];
    if (!a) return reply.code(404).send({ error: 'Musique introuvable' });
    const used = (await pool.query(
      `SELECT count(DISTINCT p.id)::int AS n FROM editor_projects p LEFT JOIN editor_versions v ON v.project_id = p.id
        WHERE p.timeline->'audio'->'music' @> $1::jsonb OR v.timeline->'audio'->'music' @> $1::jsonb`, [JSON.stringify([{ asset: id }])])).rows[0].n;
    if (used) return reply.code(409).send({ error: `Musique utilisée par ${used} montage(s) (ou leurs versions) : retirez-la d'abord.`, code: 'used', count: used });
    await pool.query('DELETE FROM editor_assets WHERE id = $1', [id]);
    await deleteObject(a.key).catch(() => {});
    req.auditSummary = `Éditeur : musique supprimée (« ${a.title} »)`;
    return { deleted: true };
  });

  // --- Étape E3 : habillage

  // Logos importés (png, jpeg, webp ; 3 Mo) : l'administrateur et les organisateurs importent ; un organisateur voit ses logos et ceux de
  // l'administrateur. L'image de la chaîne (« channel ») sert de logo par défaut sans rien importer.
  const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const LOGO_MAX_MB = 3;
  const LOGO_SQL = `SELECT a.*, u.name AS created_name, u.role AS created_role FROM editor_assets a LEFT JOIN users u ON u.id = a.created_by WHERE a.kind = 'logo'`;
  const logoVisible = (user, r) => user.role === 'admin' || r.created_by === user.sub || r.created_role === 'admin';
  async function logoView(r, user) {
    let url = null;
    try { url = await presignGet(r.key); } catch { url = null; }
    return { id: r.id, title: r.title, url, w: r.meta?.w || null, h: r.meta?.h || null, bytes: Number(r.bytes), createdBy: r.created_name || null, createdAt: r.created_at,
      mine: r.created_by === user.sub, canDelete: user.role === 'admin' || r.created_by === user.sub };
  }
  app.get('/studio/editor/logos', viewer, async (req) => {
    const rows = (await pool.query(`${LOGO_SQL} ORDER BY a.created_at DESC LIMIT 300`)).rows.filter((r) => logoVisible(req.user, r));
    const logos = [];
    for (const r of rows) logos.push(await logoView(r, req.user));
    return { logos, maxMb: LOGO_MAX_MB };
  });
  app.post('/studio/editor/logos/upload-url', viewer, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré', code: 'storage_off' });
    const { contentType, size } = z.object({ contentType: z.string(), size: z.number().int().positive().optional() }).parse(req.body ?? {});
    const e = LOGO_TYPES[contentType.toLowerCase()];
    if (!e) return reply.code(400).send({ error: 'Format d’image non accepté (png, jpeg ou webp)', code: 'bad_type' });
    if (size && size > LOGO_MAX_MB * 1048576) return reply.code(400).send({ error: `Image trop lourde (${LOGO_MAX_MB} Mo maximum)`, code: 'too_big' });
    const key = `editor/logo/${crypto.randomUUID()}.${e}`;
    return { key, url: await presignPut(key, contentType.toLowerCase()), maxBytes: LOGO_MAX_MB * 1048576 };
  });
  app.post('/studio/editor/logos', viewer, async (req, reply) => {
    const b = z.object({ key: z.string().regex(/^editor\/logo\/[0-9a-f-]{36}\.(png|jpg|webp)$/, 'Fichier inattendu'),
      title: z.string().trim().min(1, 'Donnez un nom au logo').max(120), contentType: z.string().max(60) }).parse(req.body ?? {});
    let size;
    try { size = Number((await headObject(b.key)).ContentLength); } catch { return reply.code(400).send({ error: "L'image n'a pas été reçue : recommencez l'envoi", code: 'missing' }); }
    const fail = async (error, code) => { await deleteObject(b.key).catch(() => {}); return reply.code(400).send({ error, code }); };
    if (size > LOGO_MAX_MB * 1048576) return fail(`Image trop lourde (${LOGO_MAX_MB} Mo maximum)`, 'too_big');
    if (!(await hasFfmpeg())) return reply.code(503).send({ error: 'FFmpeg est absent de l’image de l’API : redéployez majlistv-api.', code: 'no_ffmpeg' });
    let meta;
    try { meta = await probeImage(await presignGet(b.key)); } catch (err) { return fail(err.message, 'unreadable'); }
    const r = await pool.query("INSERT INTO editor_assets(kind, title, key, mime, bytes, meta, created_by) VALUES ('logo', $1, $2, $3, $4, $5, $6) RETURNING id",
      [b.title, b.key, b.contentType.toLowerCase(), size, meta, req.user.sub]);
    const row = (await pool.query(`${LOGO_SQL} AND a.id = $1`, [r.rows[0].id])).rows[0];
    return reply.code(201).send({ logo: await logoView(row, req.user) });
  });
  app.delete('/studio/editor/logos/:id', viewer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const a = (await pool.query(`${LOGO_SQL} AND a.id = $1`, [id])).rows[0];
    if (!a || !logoVisible(req.user, a)) return reply.code(404).send({ error: 'Logo introuvable' });
    if (req.user.role !== 'admin' && a.created_by !== req.user.sub) return reply.code(403).send({ error: 'Seul son auteur ou un administrateur supprime ce logo.' });
    const probe = JSON.stringify({ logo: { asset: id } });
    const used = (await pool.query(
      `SELECT (SELECT count(DISTINCT p.id) FROM editor_projects p LEFT JOIN editor_versions v ON v.project_id = p.id
                WHERE p.timeline->'dress' @> $1::jsonb OR v.timeline->'dress' @> $1::jsonb)::int AS n,
              (SELECT count(*) FROM editor_templates WHERE dress @> $1::jsonb)::int AS m`, [probe])).rows[0];
    if (used.n || used.m) return reply.code(409).send({ error: `Logo utilisé par ${used.n} montage(s) (ou leurs versions) et ${used.m} modèle(s) : retirez-le d'abord.`, code: 'used', count: used.n + used.m });
    await pool.query('DELETE FROM editor_assets WHERE id = $1', [id]);
    await deleteObject(a.key).catch(() => {});
    return { deleted: true };
  });

  // Modèles de chaîne : un habillage réutilisable (sans les transitions propres à chaque extrait). Pour la chaîne du montage
  // (l'organisateur de la chaîne et l'administrateur), ou pour toutes les chaînes (administrateur).
  const tplDress = (d) => { const x = dressDefaults(d); return { ...x, transitions: { all: x.transitions.all, byClip: {} } }; };
  const tplView = (r, user) => ({ id: r.id, name: r.name, scope: r.channel_slug ? 'channel' : 'all', channel: r.channel_slug, dress: r.dress, createdBy: r.created_name || null,
    canDelete: user.role === 'admin' || r.created_by === user.sub });
  app.get('/studio/editor/templates', viewer, async (req, reply) => {
    const { project } = z.object({ project: z.string().uuid() }).parse(req.query ?? {});
    const row = await loadProject(project);
    if (!row || !canSee(req.user, row)) return reply.code(404).send({ error: 'Projet introuvable' });
    const slug = speakerSlug(row.speaker);
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS created_name FROM editor_templates t LEFT JOIN users u ON u.id = t.created_by
        WHERE t.channel_slug IS NULL OR t.channel_slug = $1 ORDER BY (t.channel_slug IS NULL), lower(t.name)`, [slug]);
    return { templates: rows.map((r) => tplView(r, req.user)), channel: slug };
  });
  app.post('/studio/editor/templates', viewer, async (req, reply) => {
    const b = z.object({ projectId: z.string().uuid(), name: z.string().trim().min(1, 'Donnez un nom au modèle').max(80), scope: z.enum(['channel', 'all']).default('channel'), dress: z.unknown() }).parse(req.body ?? {});
    const row = await loadProject(b.projectId);
    if (!row || !canSee(req.user, row)) return reply.code(404).send({ error: 'Projet introuvable' });
    if (b.scope === 'all' && req.user.role !== 'admin') return reply.code(403).send({ error: 'Seul un administrateur crée un modèle pour toutes les chaînes.' });
    const slug = b.scope === 'all' ? null : speakerSlug(row.speaker);
    if (b.scope === 'channel' && !slug) return reply.code(400).send({ error: 'Cette conférence n’a pas de chaîne (nom d’intervenant vide).', code: 'no_channel' });
    const chk = checkDress(b.dress, { logos: await knownLogos(logoAssets({ dress: b.dress })) });
    if (!chk.ok) return reply.code(400).send({ error: chk.error, code: 'invalid' });
    try {
      const r = await pool.query('INSERT INTO editor_templates(channel_slug, name, dress, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [slug, b.name, tplDress(chk.dress), req.user.sub]);
      const t = (await pool.query('SELECT t.*, u.name AS created_name FROM editor_templates t LEFT JOIN users u ON u.id = t.created_by WHERE t.id = $1', [r.rows[0].id])).rows[0];
      return reply.code(201).send({ template: tplView(t, req.user) });
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Un modèle porte déjà ce nom pour cette chaîne.', code: 'exists' });
      throw err;
    }
  });
  app.delete('/studio/editor/templates/:id', viewer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = (await pool.query('SELECT * FROM editor_templates WHERE id = $1', [id])).rows[0];
    if (!t) return reply.code(404).send({ error: 'Modèle introuvable' });
    if (req.user.role !== 'admin' && t.created_by !== req.user.sub) return reply.code(403).send({ error: 'Seul son auteur ou un administrateur supprime ce modèle.' });
    await pool.query('DELETE FROM editor_templates WHERE id = $1', [id]);
    return { deleted: true };
  });

  // « Voir l'image finale » : FFmpeg compose la vraie image d'un instant du montage (ou de l'intro / de la fin) avec les réglages
  // actuels, même non enregistrés, pour vérifier textes, polices (arabe compris), logo et fondu avant le rendu.
  let framing = 0;
  app.post('/studio/editor/projects/:id/frame', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const b = z.object({ timeline: z.unknown(), at: z.union([z.number().min(0), z.enum(['intro', 'outro'])]) }).parse(req.body ?? {});
    if (!editable(row)) return reply.code(409).send({ error: 'Cette conférence ne peut pas être montée.', code: 'not_editable' });
    if (!(await hasFfmpeg())) return reply.code(503).send({ error: 'FFmpeg est absent de l’image de l’API : redéployez majlistv-api.', code: 'no_ffmpeg' });
    const chk = checkTimeline(b.timeline, row.duration_seconds, { logos: await knownLogos(logoAssets(b.timeline)) });
    if (!chk.ok) return reply.code(400).send({ error: chk.error, code: 'invalid' });
    if (framing >= 2) return reply.code(429).send({ error: 'Une image est déjà en préparation : réessayez dans quelques secondes.' });
    // Logo : celui de la chaîne ou un logo importé.
    const d = dressDefaults(chk.timeline.dress);
    let logoUrl = null;
    try {
      if (d.logo.on && d.logo.asset === 'channel') logoUrl = (await channelOf(row))?.avatarUrl || null;
      else if (d.logo.on && d.logo.asset) { const a = (await pool.query("SELECT key FROM editor_assets WHERE id = $1 AND kind = 'logo'", [d.logo.asset])).rows[0]; logoUrl = a ? await presignGet(a.key) : null; }
    } catch { logoUrl = null; }
    framing += 1;
    try {
      const png = await renderFrame({ talkId: row.talk_id, timeline: chk.timeline, at: b.at, logoUrl,
        vars: { titre: row.talk_title || '', intervenant: String(row.speaker || '').trim() }, cues: (await cuesOf(row)).cues });
      return reply.header('content-type', 'image/png').header('cache-control', 'no-store').send(png);
    } catch (err) { app.log.warn(`Éditeur : image finale impossible : ${err.message}`); return reply.code(502).send({ error: err.message }); } finally { framing -= 1; }
  });

  // Supprimer un projet (le montage seulement : la conférence et sa vidéo ne changent pas).
  app.delete('/studio/editor/projects/:id', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const sess = typeof req.query.session === 'string' ? req.query.session : null;
    const v = lockView(row, req.user, sess);
    if (v.active && !v.mine) return reply.code(423).send({ error: `Projet en cours de modification par ${row.lock_name || 'une autre personne'}.`, code: 'locked' });
    await pool.query('DELETE FROM editor_projects WHERE id = $1', [row.id]);
    await deleteProjectRenders(row.id); // étape E4a : fichiers des rendus du projet
    req.auditSummary = `Éditeur : projet de montage supprimé (« ${row.talk_title} »)`;
    return { deleted: true };
  });

  // Étape E4a : rendu de la vidéo montée (render.js).
  await renderRoutes(app, { guard, editable, cuesOf, viewer });
  // Étape E4b : remplacer la vidéo publiée, restaurer l'original (replace.js).
  await replaceRoutes(app, { viewer, editable });
}
