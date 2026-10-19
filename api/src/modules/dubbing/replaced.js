// Module « Doublage français » — étape E4b : la vidéo publiée a été remplacée par un montage (module Éditeur), ou l'original est revenu.
// La piste française suit l'ANCIENNE vidéo : elle est retirée du service (à refaire sur la nouvelle). Tout est rangé dans le
// « snapshot » du remplacement pour revenir en arrière avec « Restaurer l'original ».
import { pool } from '../../db.js';
import { deleteKeys } from '../../storage.js';

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

// Registre, point 23 (réglé à l'étape E5a) : une piste française faite ENTRE le remplacement et la restauration suit la vidéo
// remplacée ; ses fichiers (voix, mixage) sont effacés du stockage, et leurs copies d'archive aussi (comme le service de doublage).
// Sans piste d'avant, la piste de la vidéo remplacée est retirée (elle ne correspond plus au son).
export async function onRestored({ dub }, { talkId }) {
  if (!dub) return;
  const c = await pool.connect();
  let orphan = [];
  try {
    await c.query('BEGIN');
    const cur = (await c.query('SELECT mix_key, voice_key FROM dub_tracks WHERE talk_id = $1 FOR UPDATE', [talkId])).rows[0];
    const keep = new Set([dub.track?.mix_key, dub.track?.voice_key].filter(Boolean));
    orphan = cur ? [cur.mix_key, cur.voice_key].filter((k) => k && !keep.has(k)) : [];
    if (!dub.track) await c.query('DELETE FROM dub_tracks WHERE talk_id = $1', [talkId]);
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
    if (orphan.length) {
      // Copies d'archive (module Stockage et archivage) : effacées chez le fournisseur par sa file (statut « copie d'archive effacée »).
      if ((await c.query("SELECT to_regclass('archive_items') AS t")).rows[0].t) {
        await c.query(`UPDATE archive_items SET status = 'delete_queued', updated_at = now() WHERE source_key = ANY($1::text[]) AND status = 'archived'`, [orphan]);
      }
    }
    await c.query('COMMIT');
  } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
  if (orphan.length) await deleteKeys(orphan).catch(() => {}); // fichier déjà absent (archivé) : rien à faire
}
