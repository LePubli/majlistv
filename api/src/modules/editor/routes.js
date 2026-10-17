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
import { presignGet } from '../../storage.js';
import { makePlaybackToken } from '../../playback.js';
import * as ext from '../../ext.js';
import { checkTimeline, initialTimeline, editedDuration, isEdited } from './timeline.js';

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
  if (!force && last && JSON.stringify(last.timeline.clips) === JSON.stringify(timeline.clips)) return last.n;
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

// Pistes liées montrées sous la vidéo : sous-titres (français si possible), et ce que les modules ajoutent (doublage).
async function mediaOf(row) {
  const token = makePlaybackToken(row.talk_id, 8 * 3600);
  const langs = (await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1', [row.talk_id])).rows.map((r) => r.lang);
  const lang = langs.includes('fr') ? 'fr' : langs.find((l) => String(row.lang || '').startsWith(l)) || langs[0] || null;
  const cues = lang ? (await pool.query(
    'SELECT start_ms / 1000.0 AS s, end_ms / 1000.0 AS e, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx LIMIT 6000',
    [row.talk_id, lang])).rows.map((c) => ({ s: Number(c.s), e: Number(c.e), text: c.text })) : [];
  const out = {
    // Aperçu : la qualité 360p déjà produite par la conversion (playlist v0), lue par le navigateur.
    preview: { hls: `/hls/${row.talk_id}/v0/index.m3u8?t=${encodeURIComponent(token)}`, quality: '360p' },
    subtitles: { lang, cues },
    dub: null, // rempli par le module « Doublage français » (événement editor.media)
  };
  await ext.emit('editor.media', out, { talkId: row.talk_id });
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
    const chk = checkTimeline(body.timeline, row.duration_seconds);
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
    const chk = checkTimeline(ver.timeline, row.duration_seconds);
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

  // Supprimer un projet (le montage seulement : la conférence et sa vidéo ne changent pas).
  app.delete('/studio/editor/projects/:id', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const sess = typeof req.query.session === 'string' ? req.query.session : null;
    const v = lockView(row, req.user, sess);
    if (v.active && !v.mine) return reply.code(423).send({ error: `Projet en cours de modification par ${row.lock_name || 'une autre personne'}.`, code: 'locked' });
    await pool.query('DELETE FROM editor_projects WHERE id = $1', [row.id]);
    req.auditSummary = `Éditeur : projet de montage supprimé (« ${row.talk_title} »)`;
    return { deleted: true };
  });
}
