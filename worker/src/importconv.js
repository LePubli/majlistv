// Étape Import : conversion d'une vidéo COPIÉE chez nous (le transcripteur l'a déposée dans Garage : talks/<uuid>).
// Même conversion qu'une vidéo envoyée (HLS multi-qualités, miniatures, audio seul) dans hls/<conférence>/, puis bascule de la
// conférence : source 'upload', vidéo prête. Tant que la conversion n'est pas finie, une conférence YouTube / Vimeo / archive.org
// du catalogue reste lue depuis sa plateforme (rien ne disparaît) ; une conférence créée pour l'import reste en « importing ».
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { probe, transcode, makeAudio } from './transcode.js';

const MAX_ATTEMPTS = 2;

export function makeImportClaim(pool, log = () => {}) {
  let controls = true;
  return async function claimImport() {
    const cond = controls ? `AND activity_allows('video') AND NOT activity_paused('import', m.id::text)` : '';
    const order = controls ? `activity_priority('import', m.id::text) DESC, m.created_at` : 'm.created_at';
    try {
      const { rows } = await pool.query(
        `UPDATE media_imports SET stage = 'convert', progress = 1, error = NULL, convert_attempts = convert_attempts + 1, updated_at = now()
          WHERE id = (SELECT m.id FROM media_imports m WHERE m.status = 'converting' AND m.stage IS NULL AND NOT m.cancel_requested ${cond}
                      ORDER BY ${order} LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, talk_id, object_key, new_talk, origin, source_url, convert_attempts`);
      return rows[0];
    } catch (err) {
      if (err.code === '42P01') return undefined; // migration 061 de l'API pas encore passée
      if (controls && err.code === '42883') { controls = false; log('Pause et priorité indisponibles : file simple'); return claimImport(); }
      throw err;
    }
  };
}

// Au démarrage ou à l'arrêt : une conversion interrompue repart du début.
export const requeueImport = (pool) => pool.query(
  `UPDATE media_imports SET stage = NULL, progress = 0, updated_at = now() WHERE status = 'converting' AND stage IS NOT NULL`).catch(() => {});

export async function processImport({ job, pool, workDir, threads = 0, log = () => {}, download, uploadDir, deletePrefix, stopping = () => false }) {
  const dir = path.join(workDir, `import-${job.id}`);
  const out = path.join(dir, 'out');
  const prefix = `hls/${job.talk_id}/`;
  let last = 0; let lastWrite = 0;
  const put = (progress) => pool.query('UPDATE media_imports SET progress = $2, updated_at = now() WHERE id = $1', [job.id, progress]).catch(() => {});
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(out, { recursive: true });
    const input = path.join(dir, 'source');
    log(`[import ${job.id}] téléchargement depuis le stockage`);
    await download(job.object_key, input);
    const info = await probe(input);
    log(`[import ${job.id}] ${Math.round(info.duration)} s, ${info.height}p : conversion`);
    await put(5);
    await transcode({
      input, outDir: out, info, threads,
      onProgress: (p) => {
        const pct = 5 + Math.floor(p * 85);
        if (pct > last && Date.now() - lastWrite > 3000) { last = pct; lastWrite = Date.now(); put(pct); }
      },
    });
    let audio = info.hasAudio ? 'pending' : 'none';
    if (info.hasAudio) {
      try { await makeAudio({ input, outDir: path.join(out, 'audio') }); audio = 'ready'; } catch (err) { log(`[import ${job.id}] audio seul : ${err.message}`); }
    }
    await put(92);
    await deletePrefix(prefix); // reste d'un essai précédent
    await uploadDir(out, prefix);
    const posters = [1, 2, 3].map((i) => `${prefix}c${i}.jpg`).filter((k) => fs.existsSync(path.join(out, k.slice(prefix.length))));

    // Bascule : la conférence devient une vidéo hébergée. Un seul bloc pour que le site ne voie jamais un état à moitié fait.
    const client = await pool.connect();
    let flipped = 0;
    try {
      await client.query('BEGIN');
      const t = await client.query(
        `UPDATE talks SET source = 'upload', video_ref = $2, video_status = 'ready', video_progress = 100, video_error = NULL, audio_status = $3,
                duration_seconds = $4, poster_key = $5, poster_candidates = $6, imported_from = $7, imported_origin = $8, external_file = NULL, rights_confirmed = true
          WHERE id = $1 AND (source <> 'upload' OR video_status = 'importing')`,
        [job.talk_id, job.object_key, audio, Math.round(info.duration), `${prefix}poster.jpg`, posters, job.source_url, job.origin]);
      flipped = t.rowCount;
      if (flipped) await client.query(`UPDATE media_imports SET status = 'done', stage = NULL, progress = 100, error = NULL, finished_at = now(), updated_at = now() WHERE id = $1`, [job.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    if (!flipped) {
      // Conférence supprimée (ou changée) pendant la conversion : on nettoie tout.
      await deletePrefix(prefix).catch(() => {});
      await deletePrefix(job.object_key).catch(() => {});
      await pool.query(`UPDATE media_imports SET status = 'canceled', stage = NULL, finished_at = now() WHERE id = $1 AND status = 'converting'`, [job.id]).catch(() => {});
      log(`[import ${job.id}] conférence supprimée entre-temps : nettoyé`);
      return { ok: false, gone: true };
    }
    log(`[import ${job.id}] terminé : la conférence est maintenant hébergée`);
    return { ok: true };
  } catch (err) {
    if (stopping()) return { ok: false, stopped: true };
    const final = job.convert_attempts >= MAX_ATTEMPTS;
    log(`[import ${job.id}] échec de la conversion (${job.convert_attempts}/${MAX_ATTEMPTS}) : ${err.message}`);
    await deletePrefix(prefix).catch(() => {});
    const message = String(err.message).slice(0, 800);
    if (final) {
      await deletePrefix(job.object_key).catch(() => {});
      await pool.query(`UPDATE media_imports SET status = 'failed', stage = NULL, progress = 0, error = $2, finished_at = now(), updated_at = now() WHERE id = $1`, [job.id, message]).catch(() => {});
      if (job.new_talk) await pool.query(`UPDATE talks SET video_status = 'failed', video_error = $2 WHERE id = $1 AND video_status = 'importing'`, [job.talk_id, message.slice(0, 500)]).catch(() => {});
    } else {
      await pool.query(`UPDATE media_imports SET stage = NULL, progress = 0, error = $2, updated_at = now() WHERE id = $1`, [job.id, message]).catch(() => {});
    }
    return { ok: false, error: err.message };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
