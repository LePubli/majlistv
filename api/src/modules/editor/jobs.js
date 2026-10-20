// Registre n°28 et n°31 : demandes « Préciser la place des mots » (word_align_jobs, file « align ») et « Le cadre suit le visage »
// (face_track_jobs, file « face ») dans Studio → Activité : liste, pause / priorité (lues par le service de transcription) et annulation.
import { pool } from '../../db.js';

const st = (s) => (s === 'processing' ? 'running' : s === 'failed' ? 'failed' : 'waiting');
const RECENT = "(j.status IN ('pending', 'processing') OR (j.status = 'failed' AND j.updated_at > now() - interval '30 days'))";

export async function collectJobs(out, { organizerId }) {
  const align = await pool.query(
    `SELECT j.talk_id, j.status, j.progress, j.error, j.created_at, j.cancel_requested, t.title,
            (SELECT p.id FROM editor_projects p WHERE p.talk_id = j.talk_id AND p.kind = 'main' LIMIT 1) AS main_id
       FROM word_align_jobs j JOIN talks t ON t.id = j.talk_id
      WHERE ${RECENT} AND ($1::uuid IS NULL OR t.organizer_id = $1)`, [organizerId]);
  for (const r of align.rows) {
    out.push({ queue: 'align', ref: r.talk_id, talkId: r.talk_id, title: r.title || '', status: st(r.status), progress: r.status === 'processing' ? r.progress : null,
      error: r.error, createdAt: r.created_at, light: false, canCancel: !r.cancel_requested, canceling: r.cancel_requested,
      link: r.main_id ? `/studio/editor/${r.main_id}` : `/studio/editor?talk=${r.talk_id}` });
  }
  const face = await pool.query(
    `SELECT j.project_id, j.talk_id, j.status, j.progress, j.error, j.created_at, j.cancel_requested, t.title, p.title AS short_title,
            (SELECT m.id FROM editor_projects m WHERE m.talk_id = j.talk_id AND m.kind = 'main' LIMIT 1) AS main_id
       FROM face_track_jobs j JOIN talks t ON t.id = j.talk_id LEFT JOIN editor_projects p ON p.id = j.project_id
      WHERE ${RECENT} AND ($1::uuid IS NULL OR t.organizer_id = $1)`, [organizerId]);
  for (const r of face.rows) {
    out.push({ queue: 'face', ref: r.project_id, talkId: r.talk_id, title: [r.title, r.short_title].filter(Boolean).join(' · '), status: st(r.status),
      progress: r.status === 'processing' ? r.progress : null, error: r.error, createdAt: r.created_at, light: false,
      canCancel: !r.cancel_requested, canceling: r.cancel_requested, link: r.main_id ? `/studio/editor/${r.main_id}/shorts` : '/studio/editor' });
  }
}

// Annuler : en attente → 'canceled' tout de suite ; en cours → cancel_requested (le service s'arrête au prochain point de contrôle).
async function cancelIn(table, key, ref) {
  const now = await pool.query(`UPDATE ${table} SET status = 'canceled', progress = 0, updated_at = now() WHERE ${key} = $1 AND status = 'pending' RETURNING 1`, [ref]);
  if (now.rowCount) return true;
  const run = await pool.query(`UPDATE ${table} SET cancel_requested = true, updated_at = now() WHERE ${key} = $1 AND status = 'processing' RETURNING 1`, [ref]);
  return run.rowCount > 0;
}

export async function cancelJob(out, { queue, ref }) {
  if (queue === 'align') out.done = await cancelIn('word_align_jobs', 'talk_id', ref);
  else if (queue === 'face') out.done = await cancelIn('face_track_jobs', 'project_id', ref);
}

// Mêmes annulations depuis l'éditeur (onglet Texte, page des extraits).
export const cancelAlign = (talkId) => cancelIn('word_align_jobs', 'talk_id', talkId);
export const cancelTrack = (projectId) => cancelIn('face_track_jobs', 'project_id', projectId);
