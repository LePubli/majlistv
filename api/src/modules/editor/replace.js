// Module « Éditeur de montage » — étape E4b : REMPLACER LA VIDÉO PUBLIÉE par un rendu final, et « Restaurer l'original ».
//
// Déroulement (choix d'Epok du 19/10 : la bascule a lieu dès que la nouvelle vidéo est prête, le reste suit en arrière-plan) :
//   1. « Remplacer la vidéo publiée » : le rendu final est copié en nouvelle vidéo de la conférence (talks/<id>-r<remplacement>.mp4) ;
//      le worker la convertit en HLS dans un NOUVEAU dossier (hls/<id>/r/<remplacement>/) — la version publiée ne bouge pas.
//   2. Bascule (API, une transaction) : la conférence pointe vers la nouvelle vidéo ; sous-titres (toutes langues), chapitres, quiz,
//      actions, rappels, notes et reprises de lecture sont recalés avec la carte du temps (timemap.js). Un passage cité coupé met sa
//      question « à revoir » (dépubliée). Le doublage (piste française) est retiré : il est à refaire sur la nouvelle vidéo.
//      Les spectateurs déjà en lecture gardent l'ancienne version jusqu'au bout (v= dans les liens) ; elle est effacée 6 h après.
//   3. Ensuite (sauf « Conserver mes corrections ») : nouvelle transcription, puis traductions et résumés relancés ; les quiz sont
//      rattachés au texte de leur passage dans la nouvelle transcription. La recherche suit toute seule (signature de l'index).
//   4. L'original (ancienne vidéo envoyée) est gardé N jours (réglage du module Stockage, 7 par défaut), puis proposé à l'archivage.
//   « Restaurer l'original » : le dernier remplacement d'une conférence s'annule ; l'original (rapatrié des archives si besoin) est
//   reconverti, puis tout revient comme avant (phrases, résumés, quiz, notes, doublage) ; ce qui a été créé entre-temps est recalé.
import { z } from 'zod';
import { pool } from '../../db.js';
import { copyObject, headObject, presignGet, listKeys, deleteKeys, deleteObject } from '../../storage.js';
import * as ext from '../../ext.js';
import { getSetting, isOn } from '../../settings.js';
import { buildMap, inverseMap, mapMs, mapSegments, mapChapters, findQuote } from './timemap.js';
import { dressDefaults } from './dress.js';
import { audioDefaults, initialTimeline } from './timeline.js';

export const GRACE_HOURS = 6;          // l'ancienne version reste servie aux spectateurs déjà en lecture
const ACTIVE = ['converting', 'converted', 'waiting_original'];

// Réglages du module « Stockage et archivage » (s'il est installé) : durée de garde de l'original, archivage possible ?
async function keepDays() {
  let v = NaN;
  try { v = Number(await getSetting('mod_storage_keep_original_days')); } catch { v = NaN; }
  return Number.isFinite(v) && v >= 0 ? v : 7;
}
async function storageOn() {
  try { return isOn(await getSetting('mod_storage_enabled')) && String(await getSetting('mod_storage_provider') || 'none') !== 'none'; } catch { return false; }
}
const sizeOf = async (key) => { try { return Number((await headObject(key)).ContentLength) || 0; } catch { return null; } };

// Ce que contient un rendu, en mots simples (cartes « avant / après »).
function describe(timeline, plan) {
  const d = dressDefaults(timeline?.dress);
  const a = audioDefaults(timeline?.audio);
  const dress = [];
  if (d.items.some((i) => i.kind === 'title')) dress.push('title');
  if (d.items.some((i) => i.kind === 'banner')) dress.push('banner');
  if (plan?.summary?.logo) dress.push('logo');
  if (a.music.length) dress.push('music');
  if (d.intro.on || d.outro.on) dress.push('cards');
  if (plan?.summary?.transitions) dress.push('transitions');
  if (plan?.summary?.subs) dress.push('subs');
  return { dub: Boolean(plan?.summary?.dub), dress };
}

// Conséquences d'un remplacement, calculées avant de lancer (écran « avant / après »).
async function impact(talkId, map) {
  const q = (await pool.query("SELECT id, evidence_ms, status FROM quiz_questions WHERE talk_id = $1 AND status <> 'rejected'", [talkId])).rows;
  const review = q.filter((x) => x.evidence_ms != null && mapMs(map, x.evidence_ms).cut);
  const practice = (await pool.query("SELECT evidence_ms FROM practice_suggestions WHERE talk_id = $1 AND status <> 'rejected'", [talkId])).rows
    .filter((x) => x.evidence_ms != null && mapMs(map, x.evidence_ms).cut).length;
  const n = async (sql) => Number((await pool.query(sql, [talkId])).rows[0].n);
  return {
    quiz: { total: q.length, review: review.length, approvedReview: review.filter((x) => x.status === 'approved').length },
    practiceReview: practice,
    notes: await n('SELECT count(*) AS n FROM talk_notes WHERE talk_id = $1'),
    progress: await n('SELECT count(*) AS n FROM watch_progress WHERE talk_id = $1') + await n('SELECT count(*) AS n FROM kid_progress WHERE talk_id = $1'),
    segments: await n('SELECT count(*) AS n FROM transcript_segments WHERE talk_id = $1'),
    langs: (await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [talkId])).rows.map((r) => r.lang),
    dubTrack: (await pool.query("SELECT to_regclass('dub_tracks') IS NOT NULL AS ok")).rows[0].ok
      ? Number((await pool.query('SELECT count(*) AS n FROM dub_tracks WHERE talk_id = $1', [talkId])).rows[0].n) > 0 : false,
  };
}

function repView(r) {
  return {
    id: r.id, kind: r.kind, status: r.status, stage: r.stage, progress: r.progress, follow: r.follow, keepCorrections: r.keep_corrections,
    renderId: r.render_id, targetId: r.target_id, report: r.report || null, error: r.error || null, createdAt: r.created_at, switchedAt: r.switched_at,
    finishedAt: r.finished_at, createdBy: r.created_name || null, originalState: r.original_state, originalBytes: r.original_bytes != null ? Number(r.original_bytes) : null,
    keepUntil: r.keep_until, duration: r.info?.duration ?? null, cancelRequested: r.cancel_requested,
  };
}
const REP_SQL = 'SELECT r.*, u.name AS created_name FROM editor_replacements r LEFT JOIN users u ON u.id = r.created_by';

// Remplacements d'une conférence : en cours, dernier fait (restaurable), historique.
export async function talkReplacements(talkId) {
  const rows = (await pool.query(`${REP_SQL} WHERE r.talk_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [talkId])).rows;
  const active = rows.find((r) => ACTIVE.includes(r.status)) || null;
  // Seul le dernier remplacement fait (ni annulé ni restauré) peut être annulé par « Restaurer l'original ».
  const lastSwitched = rows.find((r) => r.status === 'switched' && r.kind === 'replace') || null;
  const newerRestore = lastSwitched && rows.some((r) => r.kind === 'restore' && r.status === 'switched' && new Date(r.created_at) > new Date(lastSwitched.created_at));
  return { active: active ? repView(active) : null, restorable: lastSwitched && !newerRestore ? repView(lastSwitched) : null, history: rows.map(repView) };
}

// ===================================================================================== Routes
export default async function replaceRoutes(app, { viewer, editable }) {
  async function renderFor(req, reply) {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = (await pool.query(
      `SELECT r.*, t.organizer_id, t.title AS talk_title, t.speaker, t.source, t.video_status, t.duration_seconds, t.poster_key, t.video_ref, t.media_prefix, t.external_thumb
         FROM editor_renders r JOIN talks t ON t.id = r.talk_id WHERE r.id = $1`, [id])).rows[0];
    if (!r || !(req.user.role === 'admin' || r.organizer_id === req.user.sub)) { reply.code(404).send({ error: 'Rendu introuvable' }); return null; }
    return r;
  }
  const refuse = (r) => {
    if (r.status !== 'ready' || !r.output_key) return { code: 'not_ready', error: 'Ce rendu n’est pas prêt.' };
    if (r.kind !== 'final') return { code: 'preview', error: 'Un aperçu rapide (640 × 360) ne peut pas remplacer la vidéo : lancez un rendu final.' };
    if (!editable(r)) return { code: 'not_editable', error: 'Cette conférence ne peut pas être remplacée (vidéo externe ou non convertie).' };
    return null;
  };

  // Écran « avant / après » : ce que le remplacement changera.
  app.get('/studio/editor/renders/:id/replace-preview', viewer, async (req, reply) => {
    const r = await renderFor(req, reply); if (!r) return reply;
    const map = buildMap(r.timeline, { introLen: r.plan?.introLen || 0, outroLen: r.plan?.outroLen || 0 });
    const reps = await talkReplacements(r.talk_id);
    const before = r.timeline?.duration ?? Number(r.duration_seconds);
    let poster = null;
    try { poster = r.poster_key ? await presignGet(r.poster_key) : r.external_thumb || null; } catch { poster = null; }
    const project = (await pool.query('SELECT rev FROM editor_projects WHERE id = $1', [r.project_id])).rows[0];
    return {
      render: { id: r.id, kind: r.kind, status: r.status, duration: Number(r.out_duration_s) || map.total, url: r.output_key ? await presignGet(r.output_key).catch(() => null) : null,
        report: r.report, upToDate: project ? project.rev === r.rev : false, ...describe(r.timeline, r.plan) },
      talk: { id: r.talk_id, title: r.talk_title, speaker: r.speaker, duration: Number(r.duration_seconds) || before, posterUrl: poster },
      impact: await impact(r.talk_id, map),
      original: { bytes: r.video_ref ? await sizeOf(r.video_ref) : null, keepDays: await keepDays(), archiving: await storageOn() },
      blocked: refuse(r), replacements: reps,
    };
  });

  // Lancer : copie du rendu, puis le worker prépare la nouvelle version.
  app.post('/studio/editor/renders/:id/replace', viewer, async (req, reply) => {
    const r = await renderFor(req, reply); if (!r) return reply;
    const b = z.object({ keepCorrections: z.boolean().default(false) }).parse(req.body ?? {});
    const no = refuse(r); if (no) return reply.code(409).send(no);
    const busy = (await pool.query(`SELECT id FROM editor_replacements WHERE talk_id = $1 AND status = ANY($2)`, [r.talk_id, ACTIVE])).rows[0];
    if (busy) return reply.code(409).send({ code: 'busy', error: 'Un remplacement de cette vidéo est déjà en préparation.', id: busy.id });
    const map = buildMap(r.timeline, { introLen: r.plan?.introLen || 0, outroLen: r.plan?.outroLen || 0 });
    const id = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    const key = `talks/${r.talk_id}-r${id}.mp4`;
    try { await copyObject(r.output_key, key, 'video/mp4'); } catch (err) { return reply.code(502).send({ error: `Copie du rendu impossible : ${err.message}` }); }
    try {
      await pool.query(
        `INSERT INTO editor_replacements(id, talk_id, project_id, render_id, kind, keep_corrections, source_key, new_prefix, new_video_ref, map, created_by)
         VALUES ($1, $2, $3, $4, 'replace', $5, $6, $7, $6, $8, $9)`,
        [id, r.talk_id, r.project_id, r.id, b.keepCorrections, key, `hls/${r.talk_id}/r/${id}/`, map, req.user.sub]);
    } catch (err) {
      await deleteObject(key).catch(() => {});
      if (err.code === '23505') return reply.code(409).send({ code: 'busy', error: 'Un remplacement de cette vidéo est déjà en préparation.' });
      throw err;
    }
    req.auditSummary = `Éditeur : remplacement de la vidéo publiée lancé (« ${r.talk_title} »${b.keepCorrections ? ', corrections conservées' : ''})`;
    return reply.code(201).send({ replacement: repView((await pool.query(`${REP_SQL} WHERE r.id = $1`, [id])).rows[0]) });
  });

  async function repFor(req, reply) {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = (await pool.query(`SELECT r.*, t.organizer_id, t.title AS talk_title FROM editor_replacements r JOIN talks t ON t.id = r.talk_id WHERE r.id = $1`, [id])).rows[0];
    if (!r || !(req.user.role === 'admin' || r.organizer_id === req.user.sub)) { reply.code(404).send({ error: 'Remplacement introuvable' }); return null; }
    return r;
  }

  // État (suivi de la page) : remplacements de la conférence du projet.
  app.get('/studio/editor/talks/:id/replacements', viewer, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const t = (await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [id])).rows[0];
    if (!t || !(req.user.role === 'admin' || t.organizer_id === req.user.sub)) return reply.code(404).send({ error: 'Conférence introuvable' });
    return { ...(await talkReplacements(id)), keepDays: await keepDays(), archiving: await storageOn() };
  });

  // Annuler une préparation (avant la bascule seulement).
  app.post('/studio/editor/replacements/:id/cancel', viewer, async (req, reply) => {
    const r = await repFor(req, reply); if (!r) return reply;
    if (!['converting', 'waiting_original'].includes(r.status)) return reply.code(409).send({ code: 'done', error: 'La bascule est faite ou en cours : utilisez « Restaurer l’original ».' });
    await pool.query(`UPDATE editor_replacements SET cancel_requested = true, status = CASE WHEN stage IS NULL THEN 'canceled' ELSE status END,
                        finished_at = CASE WHEN stage IS NULL THEN now() ELSE finished_at END, updated_at = now() WHERE id = $1`, [r.id]);
    const now = (await pool.query('SELECT status FROM editor_replacements WHERE id = $1', [r.id])).rows[0];
    if (now.status === 'canceled') await cleanupCanceled(r);
    req.auditSummary = `Éditeur : remplacement annulé avant la bascule (« ${r.talk_title} »)`;
    return { canceled: true };
  });

  // Restaurer l'original (annule le dernier remplacement).
  app.post('/studio/editor/replacements/:id/restore', viewer, async (req, reply) => {
    const r = await repFor(req, reply); if (!r) return reply;
    const reps = await talkReplacements(r.talk_id);
    if (!reps.restorable || reps.restorable.id !== r.id) return reply.code(409).send({ code: 'not_last', error: 'Seul le dernier remplacement peut être annulé.' });
    if (reps.active) return reply.code(409).send({ code: 'busy', error: 'Une opération est déjà en cours sur cette vidéo.' });
    if (!r.old_video_ref || r.original_state === 'deleted') return reply.code(409).send({ code: 'gone', error: 'L’original n’est plus disponible.' });
    const id = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    let status = 'converting';
    if ((await sizeOf(r.old_video_ref)) == null) {
      // Plus dans Garage : on le demande au module Stockage et archivage.
      const back = await ext.call('archive.restore', null, r.old_video_ref).catch(() => null);
      if (!back) return reply.code(409).send({ code: 'gone', error: 'L’original n’est ni dans le stockage ni dans les archives.' });
      status = 'waiting_original';
    }
    const inv = inverseMap(r.map);
    await pool.query(
      `INSERT INTO editor_replacements(id, talk_id, project_id, kind, target_id, status, source_key, new_prefix, new_video_ref, map, created_by)
       VALUES ($1, $2, $3, 'restore', $4, $5, $6, $7, $6, $8, $9)`,
      [id, r.talk_id, r.project_id, r.id, status, r.old_video_ref, `hls/${r.talk_id}/r/${id}/`, inv, req.user.sub]);
    req.auditSummary = `Éditeur : restauration de l’original demandée (« ${r.talk_title} »)`;
    return reply.code(201).send({ replacement: repView((await pool.query(`${REP_SQL} WHERE r.id = $1`, [id])).rows[0]), fromArchive: status === 'waiting_original' });
  });
}

async function cleanupCanceled(r) {
  if (r.kind === 'replace' && r.new_video_ref) await deleteObject(r.new_video_ref).catch(() => {});
  const keys = await listKeys(r.new_prefix).catch(() => []);
  if (keys.length) await deleteKeys(keys.map((k) => k.key)).catch(() => {});
}

// ===================================================================================== Bascule
// Recale les éléments datés d'une conférence. fwd = carte (ancien → nouveau). snap = { quiz, practice, reminders, notes } d'une
// restauration (valeurs d'avant le remplacement) : appliquées telles quelles aux éléments qui existaient alors.
async function shiftItems(c, talkId, fwd, newDurMs, snap = null) {
  const rep = { quizReview: 0, practiceReview: 0, remindersReview: 0, notes: 0, progress: 0 };
  const back = (table, id) => snap?.[table]?.find((x) => x.id === id);
  // Quiz : position de la réponse et du chapitre ; passage coupé → « à revoir » (dépubliée).
  for (const q of (await c.query('SELECT id, evidence_ms, chapter_ms, status FROM quiz_questions WHERE talk_id = $1', [talkId])).rows) {
    const old = back('quiz', q.id);
    if (old) { await c.query('UPDATE quiz_questions SET evidence_ms = $2, chapter_ms = $3, status = $4, updated_at = now() WHERE id = $1', [q.id, old.evidence_ms, old.chapter_ms, old.status]); continue; }
    const e = q.evidence_ms != null ? mapMs(fwd, q.evidence_ms) : null;
    const ch = q.chapter_ms != null ? mapMs(fwd, q.chapter_ms).ms : null;
    const cut = Boolean(e?.cut) && q.status !== 'rejected';
    if (cut) rep.quizReview += 1;
    await c.query(`UPDATE quiz_questions SET evidence_ms = $2, chapter_ms = $3, status = CASE WHEN $4 THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`,
      [q.id, e ? e.ms : null, ch, cut]);
  }
  for (const p of (await c.query('SELECT id, evidence_ms, status FROM practice_suggestions WHERE talk_id = $1', [talkId])).rows) {
    const old = back('practice', p.id);
    if (old) { await c.query('UPDATE practice_suggestions SET evidence_ms = $2, status = $3, updated_at = now() WHERE id = $1', [p.id, old.evidence_ms, old.status]); continue; }
    const e = p.evidence_ms != null ? mapMs(fwd, p.evidence_ms) : null;
    const cut = Boolean(e?.cut) && p.status !== 'rejected';
    if (cut) rep.practiceReview += 1;
    await c.query(`UPDATE practice_suggestions SET evidence_ms = $2, status = CASE WHEN $3 THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [p.id, e ? e.ms : null, cut]);
  }
  for (const m of (await c.query('SELECT id, start_ms, status FROM reminders WHERE talk_id = $1', [talkId])).rows) {
    const old = back('reminders', m.id);
    if (old) { await c.query('UPDATE reminders SET start_ms = $2, status = $3 WHERE id = $1', [m.id, old.start_ms, old.status]); continue; }
    if (m.start_ms == null) continue;
    const e = mapMs(fwd, m.start_ms);
    if (e.cut && m.status === 'approved') rep.remindersReview += 1;
    await c.query(`UPDATE reminders SET start_ms = $2, status = CASE WHEN $3 THEN 'draft' ELSE status END WHERE id = $1`, [m.id, e.ms, e.cut]);
  }
  // Notes : un instant coupé passe au début du passage suivant.
  const notes = (await c.query('SELECT id, position_ms FROM talk_notes WHERE talk_id = $1', [talkId])).rows;
  if (notes.length) {
    const pos = notes.map((n) => { const old = snap?.notes?.[n.id]; return old != null ? old : mapMs(fwd, n.position_ms).ms; });
    await c.query('UPDATE talk_notes n SET position_ms = x.p FROM unnest($1::uuid[], $2::int[]) AS x(id, p) WHERE n.id = x.id', [notes.map((n) => n.id), pos]);
    rep.notes = notes.length;
  }
  // Reprises de lecture (membres et profils enfants).
  const wp = (await c.query('SELECT user_id, position_ms FROM watch_progress WHERE talk_id = $1', [talkId])).rows;
  if (wp.length) {
    await c.query(`UPDATE watch_progress w SET position_ms = x.p, duration_ms = $3 FROM unnest($1::uuid[], $2::int[]) AS x(u, p) WHERE w.talk_id = $4 AND w.user_id = x.u`,
      [wp.map((w) => w.user_id), wp.map((w) => Math.min(mapMs(fwd, w.position_ms).ms, newDurMs)), newDurMs, talkId]);
  }
  const kp = (await c.query('SELECT profile_id, position_ms FROM kid_progress WHERE talk_id = $1', [talkId])).rows;
  if (kp.length) {
    await c.query(`UPDATE kid_progress k SET position_ms = x.p FROM unnest($1::uuid[], $2::int[]) AS x(pid, p) WHERE k.talk_id = $3 AND k.profile_id = x.pid`,
      [kp.map((k) => k.profile_id), kp.map((k) => Math.min(mapMs(fwd, k.position_ms).ms, newDurMs)), talkId]);
  }
  rep.progress = wp.length + kp.length;
  return rep;
}

async function insertSegments(c, talkId, lang, segs) {
  if (!segs.length) return;
  await c.query(
    `INSERT INTO transcript_segments(talk_id, lang, idx, start_ms, end_ms, text)
     SELECT $1, $2, x.i, x.s, x.e, x.t FROM unnest($3::int[], $4::int[], $5::int[], $6::text[]) AS x(i, s, e, t)`,
    [talkId, lang, segs.map((s) => s.idx), segs.map((s) => s.start_ms), segs.map((s) => s.end_ms), segs.map((s) => s.text)]);
}

// Nouvelles miniatures : celles de la conversion, sauf une miniature choisie à part (hors du dossier HLS) qui reste.
function posters(talk, rep) {
  const own = talk.poster_key && !talk.poster_key.startsWith(`hls/${talk.id}/`);
  const cands = (rep.info?.posters || []).map((p) => `${rep.new_prefix}${p}`);
  const main = rep.info?.posters?.includes('poster.jpg') ? `${rep.new_prefix}poster.jpg` : cands[0] || null;
  return { poster_key: own ? talk.poster_key : main, poster_candidates: cands.filter((k) => !k.endsWith('poster.jpg')) };
}

// Bascule d'un remplacement converti. Renvoie false si elle doit attendre (transcription ou traduction en cours d'écriture).
export async function switchOver(rep, log) {
  const c = await pool.connect();
  let dubSnapshot = null; let restoredTarget = null; let idxMap = null;
  try {
    await c.query('BEGIN');
    const talk = (await c.query('SELECT * FROM talks WHERE id = $1 FOR UPDATE', [rep.talk_id])).rows[0];
    if (!talk) { await c.query('ROLLBACK'); return true; }
    // Un service est en train d'écrire des phrases de l'ancienne vidéo : on attend qu'il ait fini (prochain tour).
    const writing = (await c.query(
      `SELECT ($2 = 'processing') OR EXISTS (SELECT 1 FROM transcript_translations WHERE talk_id = $1 AND status = 'processing')
              OR EXISTS (SELECT 1 FROM talk_insights WHERE talk_id = $1 AND status = 'processing') AS busy`, [talk.id, talk.transcript_status])).rows[0].busy;
    if (writing) { await c.query('ROLLBACK'); return false; }
    const newDur = Number(rep.info?.duration) || Number(rep.map.total) || Number(talk.duration_seconds);
    const newDurMs = Math.round(newDur * 1000);
    const oldPrefix = talk.media_prefix || `hls/${talk.id}/`;
    const pst = posters(talk, rep);
    let report = {};

    if (rep.kind === 'replace') {
      // 1. Ce qu'il faudra pour revenir en arrière.
      await c.query('DELETE FROM editor_replace_segments WHERE replacement_id = $1', [rep.id]);
      await c.query(`INSERT INTO editor_replace_segments(replacement_id, lang, idx, start_ms, end_ms, text)
                     SELECT $1, lang, idx, start_ms, end_ms, text FROM transcript_segments WHERE talk_id = $2`, [rep.id, talk.id]);
      const prev = {
        talk: { video_ref: talk.video_ref, media_prefix: talk.media_prefix, duration_seconds: talk.duration_seconds, poster_key: talk.poster_key,
          poster_candidates: talk.poster_candidates, audio_status: talk.audio_status, transcript_status: talk.transcript_status, transcript_language: talk.transcript_language,
          transcript_text: talk.transcript_text, transcript_edited_at: talk.transcript_edited_at },
        translations: (await c.query('SELECT lang, status, progress, error FROM transcript_translations WHERE talk_id = $1', [talk.id])).rows,
        insights: (await c.query('SELECT lang, status, summary, key_points, chapters, edited, error FROM talk_insights WHERE talk_id = $1', [talk.id])).rows,
        quiz: (await c.query('SELECT id, evidence_ms, chapter_ms, status FROM quiz_questions WHERE talk_id = $1', [talk.id])).rows,
        practice: (await c.query('SELECT id, evidence_ms, status FROM practice_suggestions WHERE talk_id = $1', [talk.id])).rows,
        reminders: (await c.query('SELECT id, start_ms, status FROM reminders WHERE talk_id = $1', [talk.id])).rows,
        notes: Object.fromEntries((await c.query('SELECT id, position_ms FROM talk_notes WHERE talk_id = $1', [talk.id])).rows.map((n) => [n.id, n.position_ms])),
      };
      // 2. Phrases de toutes les langues recalées (les mêmes coupes pour chaque langue : les numéros restent alignés).
      const all = (await c.query('SELECT lang, idx, start_ms, end_ms, text FROM transcript_segments WHERE talk_id = $1 ORDER BY lang, idx', [talk.id])).rows;
      const byLang = {};
      for (const s of all) (byLang[s.lang] ||= []).push(s);
      await c.query('DELETE FROM transcript_segments WHERE talk_id = $1', [talk.id]);
      // Étape E5a : les mots horodatés suivent l'ancienne vidéo ; la nouvelle transcription les refait (sinon : place estimée).
      await c.query('DELETE FROM transcript_words WHERE talk_id = $1', [talk.id]);
      let kept = 0;
      for (const [lang, segs] of Object.entries(byLang)) {
        const m = mapSegments(rep.map, segs); kept += m.length; await insertSegments(c, talk.id, lang, m);
        if (lang === 'fr') idxMap = Object.fromEntries(m.map((x) => [x.old, x.idx])); // phrases françaises (cases du doublage)
      }
      const origin = byLang[talk.transcript_language] ? mapSegments(rep.map, byLang[talk.transcript_language]) : null;
      // 3. Chapitres de chaque langue.
      for (const i of prev.insights) await c.query('UPDATE talk_insights SET chapters = $3, updated_at = now() WHERE talk_id = $1 AND lang = $2', [talk.id, i.lang, JSON.stringify(mapChapters(rep.map, i.chapters))]);
      // 4. Quiz, actions, rappels, notes, reprises de lecture.
      report = { segmentsBefore: all.length, segmentsKept: kept, ...(await shiftItems(c, talk.id, rep.map, newDurMs)) };
      // 5. La conférence pointe vers la nouvelle vidéo. Sans « conserver mes corrections » : nouvelle transcription puis traductions.
      const redo = !rep.keep_corrections && talk.source === 'upload';
      await c.query(
        `UPDATE talks SET video_ref = $2, media_prefix = $3, duration_seconds = $4, poster_key = $5, poster_candidates = $6, audio_status = $7,
                transcript_text = COALESCE($8, transcript_text),
                transcript_status = CASE WHEN $9 THEN 'pending' ELSE transcript_status END,
                transcript_progress = CASE WHEN $9 THEN 0 ELSE transcript_progress END,
                transcript_attempts = CASE WHEN $9 THEN 0 ELSE transcript_attempts END, transcript_error = CASE WHEN $9 THEN NULL ELSE transcript_error END
          WHERE id = $1`,
        [talk.id, rep.new_video_ref, rep.new_prefix, Math.round(newDur), pst.poster_key, pst.poster_candidates, rep.info?.hasAudio === false ? 'none' : 'ready',
          origin ? origin.map((s) => s.text).join(' ') : null, redo]);
      if (redo) await c.query(`UPDATE transcript_translations SET status = 'pending', progress = 0, attempts = 0, error = NULL, updated_at = now() WHERE talk_id = $1`, [talk.id]);
      await c.query(
        `UPDATE editor_replacements SET status = 'switched', switched_at = now(), updated_at = now(), old_prefix = $2, old_video_ref = $3, prev = $4, report = $5,
                follow = $6, original_state = 'kept', original_bytes = $7, keep_until = now() + make_interval(days => $8), cleanup_after = now() + make_interval(hours => $9),
                finished_at = CASE WHEN $6 = 'done' THEN now() ELSE NULL END
          WHERE id = $1`,
        [rep.id, oldPrefix, talk.video_ref, prev, report, redo ? 'transcript' : 'done', await sizeOf(talk.video_ref), await keepDays(), GRACE_HOURS]);
    } else {
      // Restauration : tout revient comme avant le remplacement « target ».
      const T = (await c.query('SELECT * FROM editor_replacements WHERE id = $1 FOR UPDATE', [rep.target_id])).rows[0];
      if (!T?.prev) throw new Error('Remplacement à annuler introuvable');
      const P = T.prev;
      await c.query('DELETE FROM transcript_segments WHERE talk_id = $1', [talk.id]);
      await c.query(`INSERT INTO transcript_segments(talk_id, lang, idx, start_ms, end_ms, text)
                     SELECT $1, lang, idx, start_ms, end_ms, text FROM editor_replace_segments WHERE replacement_id = $2`, [talk.id, T.id]);
      await c.query('DELETE FROM transcript_words WHERE talk_id = $1', [talk.id]); // étape E5a : place des mots estimée après une restauration
      const langsBefore = new Set(P.translations.map((x) => x.lang));
      for (const x of P.translations) {
        await c.query(`INSERT INTO transcript_translations(talk_id, lang, status, progress, error) VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (talk_id, lang) DO UPDATE SET status = EXCLUDED.status, progress = EXCLUDED.progress, error = EXCLUDED.error, attempts = 0, updated_at = now()`,
        [talk.id, x.lang, x.status, x.progress, x.error]);
      }
      // Langues demandées après le remplacement : retraduites depuis la transcription d'origine.
      await c.query(`UPDATE transcript_translations SET status = 'pending', progress = 0, attempts = 0, error = NULL, updated_at = now() WHERE talk_id = $1 AND NOT (lang = ANY($2::text[]))`,
        [talk.id, [...langsBefore]]);
      const insBefore = new Set(P.insights.map((x) => x.lang));
      for (const x of P.insights) {
        await c.query(`INSERT INTO talk_insights(talk_id, lang, status, summary, key_points, chapters, edited, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                       ON CONFLICT (talk_id, lang) DO UPDATE SET status = EXCLUDED.status, summary = EXCLUDED.summary, key_points = EXCLUDED.key_points,
                         chapters = EXCLUDED.chapters, edited = EXCLUDED.edited, error = EXCLUDED.error, attempts = 0, updated_at = now()`,
        [talk.id, x.lang, x.status, x.summary, JSON.stringify(x.key_points), JSON.stringify(x.chapters), x.edited, x.error]);
      }
      await c.query(`UPDATE talk_insights SET status = 'pending', attempts = 0, error = NULL, updated_at = now() WHERE talk_id = $1 AND NOT (lang = ANY($2::text[]))`, [talk.id, [...insBefore]]);
      report = await shiftItems(c, talk.id, rep.map, newDurMs, P);
      await c.query(
        `UPDATE talks SET video_ref = $2, media_prefix = $3, duration_seconds = $4, poster_key = $5, poster_candidates = $6, audio_status = $7,
                transcript_status = $8, transcript_language = $9, transcript_text = $10, transcript_edited_at = $11, transcript_progress = 0, transcript_attempts = 0, transcript_error = NULL
          WHERE id = $1`,
        [talk.id, T.old_video_ref, rep.new_prefix, P.talk.duration_seconds, P.talk.poster_key && !P.talk.poster_key.startsWith(`hls/${talk.id}/`) ? P.talk.poster_key : pst.poster_key,
          pst.poster_candidates, rep.info?.hasAudio === false ? 'none' : 'ready', P.talk.transcript_status, P.talk.transcript_language, P.talk.transcript_text, P.talk.transcript_edited_at]);
      await c.query(`UPDATE editor_replacements SET status = 'restored', original_state = 'in_use', updated_at = now(), finished_at = COALESCE(finished_at, now()), follow = 'done' WHERE id = $1`, [T.id]);
      await c.query(
        `UPDATE editor_replacements SET status = 'switched', switched_at = now(), updated_at = now(), old_prefix = $2, old_video_ref = $3, report = $4, follow = 'done', finished_at = now(),
                cleanup_after = now() + make_interval(hours => $5) WHERE id = $1`,
        [rep.id, oldPrefix, talk.video_ref, { ...report, dropVideoRef: talk.video_ref }, GRACE_HOURS]);
      dubSnapshot = P.dub || null; restoredTarget = T;
    }
    // Le montage de la conférence suivait l'ancienne vidéo : il est rangé en version nommée, et repart de la nouvelle vidéo entière
    // (qui contient déjà les coupes et l'habillage). À la restauration, le montage d'avant revient.
    const proj = (await c.query("SELECT id, timeline FROM editor_projects WHERE talk_id = $1 AND kind = 'main' FOR UPDATE", [talk.id])).rows[0];
    if (proj) {
      const n = Number((await c.query('SELECT COALESCE(max(n), 0) AS n FROM editor_versions WHERE project_id = $1', [proj.id])).rows[0].n) + 1;
      const day = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const label = rep.kind === 'replace' ? `Montage publié le ${day} (avant le remplacement)` : `Montage de la version annulée (${day})`;
      await c.query('INSERT INTO editor_versions(project_id, n, label, auto, timeline, created_by) VALUES ($1, $2, $3, false, $4, $5)', [proj.id, n, label, proj.timeline, rep.created_by]);
      let next = initialTimeline(newDur);
      if (rep.kind === 'restore') {
        const T = (await c.query('SELECT report FROM editor_replacements WHERE id = $1', [rep.target_id])).rows[0];
        const v = T?.report?.projectVersion ? (await c.query('SELECT timeline FROM editor_versions WHERE project_id = $1 AND n = $2', [proj.id, T.report.projectVersion])).rows[0] : null;
        if (v) next = v.timeline;
      }
      await c.query(`UPDATE editor_projects SET timeline = $2, rev = rev + 1, updated_at = now(), versioned_session = NULL, lock_until = NULL, lock_session = NULL WHERE id = $1`, [proj.id, next]);
      await c.query(`UPDATE editor_replacements SET report = COALESCE(report, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [rep.id, JSON.stringify({ projectVersion: n })]);
    }
    await c.query(`INSERT INTO talk_events(talk_id, kind, status, message) VALUES ($1, 'video', $2, $3)`,
      [talk.id, rep.kind === 'replace' ? 'replaced' : 'restored', `${Math.round(newDur)} s`]);
    await c.query('COMMIT');
  } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }

  // Après la bascule : les modules suivent (doublage : piste à refaire, ou piste d'avant remise en service).
  if (rep.kind === 'replace') {
    const snap = {};
    await ext.emit('editor.replaced', snap, { talkId: rep.talk_id, map: rep.map, idxMap: rep.keep_corrections ? idxMap : null }).catch((e) => log?.warn?.(`Remplacement : ${e.message}`));
    await pool.query(`UPDATE editor_replacements SET prev = jsonb_set(prev, '{dub}', $2::jsonb) WHERE id = $1`, [rep.id, JSON.stringify(snap.dub || null)]);
  } else if (restoredTarget) {
    await ext.emit('editor.restored', { dub: dubSnapshot }, { talkId: rep.talk_id }).catch((e) => log?.warn?.(`Restauration : ${e.message}`));
  }
  return true;
}

// ===================================================================================== Tâches de fond (toutes les 10 s)
// Après la bascule, sans « conserver mes corrections » : transcription → quiz rattachés au texte, résumés relancés → traductions.
async function followUp(rep) {
  const t = (await pool.query('SELECT transcript_status, transcript_language FROM talks WHERE id = $1', [rep.talk_id])).rows[0];
  if (!t) return;
  if (rep.follow === 'transcript') {
    if (t.transcript_status === 'pending' || t.transcript_status === 'processing') return;
    let relinked = 0;
    if (t.transcript_status === 'ready') {
      // Quiz, actions et rappels : le passage cité est cherché dans la nouvelle transcription (même langue), près de sa place recalée.
      const segsBy = {};
      const segs = async (lang) => (segsBy[lang] ||= (await pool.query('SELECT idx, start_ms, end_ms, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx', [rep.talk_id, lang])).rows);
      for (const q of (await pool.query("SELECT id, lang, evidence_ms, evidence_quote FROM quiz_questions WHERE talk_id = $1 AND status <> 'rejected' AND evidence_quote <> ''", [rep.talk_id])).rows) {
        const ms = findQuote(await segs(q.lang), q.evidence_quote, q.evidence_ms ?? 0);
        if (ms != null && ms !== q.evidence_ms) { await pool.query('UPDATE quiz_questions SET evidence_ms = $2, updated_at = now() WHERE id = $1', [q.id, ms]); relinked += 1; }
      }
      for (const p of (await pool.query("SELECT id, lang, evidence_ms, evidence_quote FROM practice_suggestions WHERE talk_id = $1 AND status <> 'rejected' AND evidence_quote <> ''", [rep.talk_id])).rows) {
        const ms = findQuote(await segs(p.lang), p.evidence_quote, p.evidence_ms ?? 0);
        if (ms != null && ms !== p.evidence_ms) { await pool.query('UPDATE practice_suggestions SET evidence_ms = $2, updated_at = now() WHERE id = $1', [p.id, ms]); relinked += 1; }
      }
      // Résumés et chapitres refaits sur le nouveau texte (un résumé corrigé à la main est gardé, ses chapitres ont été recalés).
      await pool.query(`UPDATE talk_insights SET status = 'pending', attempts = 0, error = NULL, updated_at = now() WHERE talk_id = $1 AND NOT edited`, [rep.talk_id]);
    }
    await pool.query(`UPDATE editor_replacements SET follow = 'translations', report = report || $2::jsonb, updated_at = now() WHERE id = $1`,
      [rep.id, JSON.stringify({ quizRelinked: relinked, transcript: t.transcript_status })]);
    return;
  }
  if (rep.follow === 'translations') {
    const busy = (await pool.query(
      `SELECT EXISTS (SELECT 1 FROM transcript_translations WHERE talk_id = $1 AND status IN ('pending', 'processing'))
           OR EXISTS (SELECT 1 FROM talk_insights WHERE talk_id = $1 AND status IN ('pending', 'processing')) AS b`, [rep.talk_id])).rows[0].b;
    if (!busy) await pool.query(`UPDATE editor_replacements SET follow = 'done', finished_at = now(), updated_at = now() WHERE id = $1`, [rep.id]);
  }
}

// Ancienne version : effacée quand plus aucun spectateur ne peut la lire (6 h). Le dossier d'origine hls/<id>/ garde les sous-dossiers r/.
async function cleanup(rep) {
  if (rep.old_prefix) {
    const base = `hls/${rep.talk_id}/`;
    const keys = (await listKeys(rep.old_prefix)).map((k) => k.key).filter((k) => rep.old_prefix !== base || !k.startsWith(`${base}r/`));
    await deleteKeys(keys);
  }
  // Restauration : la vidéo du remplacement annulé n'a plus d'usage.
  if (rep.kind === 'restore' && rep.report?.dropVideoRef) await deleteObject(rep.report.dropVideoRef).catch(() => {});
  await pool.query('UPDATE editor_replacements SET cleaned = true, updated_at = now() WHERE id = $1', [rep.id]);
}

let busy = false;
export async function tick(log) {
  if (busy) return;
  busy = true;
  try {
    for (const r of (await pool.query("SELECT * FROM editor_replacements WHERE status = 'converted' ORDER BY created_at LIMIT 5")).rows) {
      try { await switchOver(r, log); } catch (err) {
        log?.warn?.(`Éditeur : bascule impossible (${err.message})`);
        await pool.query(`UPDATE editor_replacements SET status = 'failed', error = $2, finished_at = now(), updated_at = now() WHERE id = $1`, [r.id, `Bascule : ${err.message}`.slice(0, 600)]);
        await cleanupCanceled(r);
      }
    }
    for (const r of (await pool.query("SELECT * FROM editor_replacements WHERE status = 'switched' AND follow IN ('transcript', 'translations') LIMIT 20")).rows) {
      try { await followUp(r); } catch (err) { log?.warn?.(`Éditeur : suite du remplacement (${err.message})`); }
    }
    for (const r of (await pool.query("SELECT * FROM editor_replacements WHERE status IN ('switched', 'restored') AND NOT cleaned AND cleanup_after < now() LIMIT 5")).rows) {
      try { await cleanup(r); } catch (err) { log?.warn?.(`Éditeur : nettoyage de l'ancienne version (${err.message})`); }
    }
    // Annulées pendant la préparation : fichiers effacés.
    for (const r of (await pool.query("SELECT * FROM editor_replacements WHERE status IN ('canceled', 'failed') AND NOT cleaned LIMIT 5")).rows) {
      await cleanupCanceled(r).catch(() => {});
      await pool.query('UPDATE editor_replacements SET cleaned = true WHERE id = $1', [r.id]);
    }
  } finally { busy = false; }
}

// ===================================================================================== Module Stockage, activité, contenus
// Originaux gardés depuis plus de N jours : proposés à l'archivage (événement archive.collect, kind = 'original').
export async function collectOriginals(out, { kind, olderThanDays } = {}) {
  if (kind !== 'original') return;
  const { rows } = await pool.query(
    `SELECT r.talk_id, r.old_video_ref, r.original_bytes, t.title FROM editor_replacements r JOIN talks t ON t.id = r.talk_id
      WHERE r.kind = 'replace' AND r.original_state = 'kept' AND r.old_video_ref IS NOT NULL AND r.status = 'switched'
        AND r.switched_at < now() - make_interval(days => $1)`, [Math.max(0, Number(olderThanDays) || 0)]);
  for (const r of rows) out.push({ key: r.old_video_ref, kind: 'original', label: `Original remplacé — ${r.title}`, talkId: r.talk_id, bytes: r.original_bytes != null ? Number(r.original_bytes) : null });
}
export async function onArchived(ev) {
  if (ev?.kind !== 'original') return;
  await pool.query(`UPDATE editor_replacements SET original_state = 'archived', updated_at = now() WHERE old_video_ref = $1 AND original_state = 'kept'`, [ev.key]);
}
export async function onRestored(ev) {
  if (ev?.kind !== 'original') return;
  await pool.query(`UPDATE editor_replacements SET original_state = 'kept', updated_at = now() WHERE old_video_ref = $1 AND original_state = 'archived'`, [ev.key]);
  await pool.query(`UPDATE editor_replacements SET status = 'converting', updated_at = now() WHERE source_key = $1 AND status = 'waiting_original'`, [ev.key]);
}

export async function collectReplacements(out, { organizerId }) {
  const { rows } = await pool.query(
    `SELECT r.id, r.kind, r.status, r.progress, r.error, r.created_at, r.talk_id, r.project_id, t.title FROM editor_replacements r JOIN talks t ON t.id = r.talk_id
      WHERE (r.status IN ('converting', 'converted', 'waiting_original') OR (r.status = 'failed' AND r.updated_at > now() - interval '30 days'))
        AND ($1::uuid IS NULL OR t.organizer_id = $1)`, [organizerId]);
  for (const r of rows) {
    out.push({ queue: 'replace', ref: r.id, talkId: r.talk_id, title: r.title || '', kind: r.kind,
      status: r.status === 'failed' ? 'failed' : r.status === 'waiting_original' ? 'blocked' : (r.status === 'converting' && r.progress === 0 ? 'waiting' : 'running'),
      blockedBy: r.status === 'waiting_original' ? 'archive' : null, progress: r.status === 'converting' && r.progress ? r.progress : null,
      error: r.error, createdAt: r.created_at, link: r.project_id ? `/studio/editor/${r.project_id}/replace` : '/studio/editor' });
  }
}
