// Module « Doublage français » — étape E4b : la vidéo publiée a été remplacée par un montage (module Éditeur), ou l'original est revenu.
// La piste française suit l'ANCIENNE vidéo : elle est retirée du service (à refaire sur la nouvelle). Tout est rangé dans le
// « snapshot » du remplacement pour revenir en arrière avec « Restaurer l'original ».
import { pool } from '../../db.js';

// snap : objet rempli ici (snap.dub) ; idxMap : ancien numéro de phrase française → nouveau (« conserver mes corrections »), ou null.
export async function onReplaced(snap, { talkId, idxMap }) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const track = (await c.query('SELECT talk_id, job_id, mix_key, voice_key, duration_s, created_at FROM dub_tracks WHERE talk_id = $1', [talkId])).rows[0] || null;
    const segments = (await c.query('SELECT idx, keep_original, accepted FROM dub_segments WHERE talk_id = $1', [talkId])).rows;
    const review = (await c.query('SELECT text_hash, reviewed_by, reviewed_at FROM dub_reviews WHERE talk_id = $1', [talkId])).rows[0] || null;
    snap.dub = { track, segments, review };
    await c.query('DELETE FROM dub_tracks WHERE talk_id = $1', [talkId]);
    await c.query('DELETE FROM dub_reviews WHERE talk_id = $1', [talkId]); // la relecture est à refaire sur le nouveau texte
    await c.query('DELETE FROM dub_segments WHERE talk_id = $1', [talkId]);
    // Corrections conservées : les cases « voix d'origine » suivent leurs phrases (phrases coupées : retirées).
    if (idxMap) {
      for (const s of segments) {
        const n = idxMap[s.idx];
        if (n == null) continue;
        await c.query('INSERT INTO dub_segments(talk_id, idx, keep_original, accepted) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [talkId, n, s.keep_original, s.accepted]);
      }
    }
    // Doublages en attente ou en cours : faits sur l'ancienne vidéo, ils sont annulés.
    await c.query(`UPDATE dub_jobs SET cancel_requested = true, status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END, updated_at = now()
                    WHERE talk_id = $1 AND status IN ('queued', 'running')`, [talkId]);
    await c.query('COMMIT');
  } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
}

export async function onRestored({ dub }, { talkId }) {
  if (!dub) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM dub_segments WHERE talk_id = $1', [talkId]);
    for (const s of dub.segments || []) await c.query('INSERT INTO dub_segments(talk_id, idx, keep_original, accepted) VALUES ($1, $2, $3, $4)', [talkId, s.idx, s.keep_original, s.accepted]);
    await c.query('DELETE FROM dub_reviews WHERE talk_id = $1', [talkId]);
    if (dub.review) await c.query('INSERT INTO dub_reviews(talk_id, text_hash, reviewed_by, reviewed_at) VALUES ($1, $2, $3, $4)', [talkId, dub.review.text_hash, dub.review.reviewed_by, dub.review.reviewed_at]);
    if (dub.track) {
      const jobOk = dub.track.job_id && (await c.query('SELECT 1 FROM dub_jobs WHERE id = $1', [dub.track.job_id])).rows[0];
      await c.query(`INSERT INTO dub_tracks(talk_id, job_id, mix_key, voice_key, duration_s, created_at) VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (talk_id) DO UPDATE SET job_id = EXCLUDED.job_id, mix_key = EXCLUDED.mix_key, voice_key = EXCLUDED.voice_key,
                       duration_s = EXCLUDED.duration_s, created_at = EXCLUDED.created_at`,
      [talkId, jobOk ? dub.track.job_id : null, dub.track.mix_key, dub.track.voice_key, dub.track.duration_s, dub.track.created_at]);
    }
    await c.query('COMMIT');
  } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
}
