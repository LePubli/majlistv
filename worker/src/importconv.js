// Étape Import : conversion d'une vidéo COPIÉE chez nous (le transcripteur l'a déposée dans Garage : talks/<uuid>).
// Même conversion qu'une vidéo envoyée (HLS multi-qualités, miniatures, audio seul) dans hls/<conférence>/, puis bascule de la
// conférence : source 'upload', vidéo prête. Tant que la conversion n'est pas finie, une conférence YouTube / Vimeo / archive.org
// du catalogue reste lue depuis sa plateforme (rien ne disparaît) ; une conférence créée pour l'import reste en « importing ».
//
// Piste française (migration 113) : si le transcripteur a pris la piste audio française de la plateforme (audio_used = 'fr'), la
// conférence est marquée (audio_track = 'fr', langue 'fr') et le doublage maison éventuel est retiré (il fait double emploi).
// « Récupérer la voix française » (reimport) : la conférence est DÉJÀ hébergée. Rien n'est touché avant que la nouvelle conversion
// soit prête ; puis les fichiers sont remplacés au même endroit. Si le remplacement échoue en cours de route, la vidéo est
// reconvertie depuis l'ancien fichier (toujours en place) : on ne reste jamais sans vidéo.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { probe, transcode, makeAudio } from './transcode.js';

const MAX_ATTEMPTS = 2;

export function makeImportClaim(pool, log = () => {}) {
  let controls = true; let cols = true;
  return async function claimImport() {
    const cond = controls ? `AND activity_allows('video') AND NOT activity_paused('import', m.id::text)` : '';
    const order = controls ? `activity_priority('import', m.id::text) DESC, m.created_at` : 'm.created_at';
    try {
      const { rows } = await pool.query(
        `UPDATE media_imports SET stage = 'convert', progress = 1, error = NULL, convert_attempts = convert_attempts + 1, updated_at = now()
          WHERE id = (SELECT m.id FROM media_imports m WHERE m.status = 'converting' AND m.stage IS NULL AND NOT m.cancel_requested AND m.updated_at <= now() ${cond}
                      ORDER BY ${order} LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, talk_id, object_key, new_talk, origin, source_url, convert_attempts${cols ? ', audio_used, reimport' : ''}`);
      return rows[0];
    } catch (err) {
      if (err.code === '42P01') return undefined; // migration 061 de l'API pas encore passée
      if (cols && err.code === '42703') { cols = false; log('Migration 113 pas encore passée : import sans choix de piste audio'); return claimImport(); }
      if (controls && err.code === '42883') { controls = false; log('Pause et priorité indisponibles : file simple'); return claimImport(); }
      throw err;
    }
  };
}

// La conférence porte la piste française de sa plateforme : le doublage maison (module « Doublage français ») fait double emploi.
// Piste retirée du service, fichiers effacés, doublages en attente annulés, demandes des abonnés closes. Sans effet si le module n'existe pas.
export async function dropHomeDubbing(pool, talkId, deletePrefix, log = () => {}) {
  try {
    const { rows } = await pool.query('DELETE FROM dub_tracks WHERE talk_id = $1 RETURNING mix_key, voice_key', [talkId]);
    await pool.query(`UPDATE dub_jobs SET cancel_requested = true, status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END, updated_at = now()
                       WHERE talk_id = $1 AND status IN ('queued', 'running')`, [talkId]);
    await pool.query('DELETE FROM dub_requests WHERE talk_id = $1', [talkId]);
    for (const r of rows) for (const k of [r.mix_key, r.voice_key]) if (k) await deletePrefix(k).catch(() => {});
    if (rows.length) log(`[${talkId}] doublage maison retiré : la piste française de la plateforme le remplace`);
    return rows.length;
  } catch (err) {
    if (!['42P01', '42703'].includes(err.code)) log(`[${talkId}] doublage maison non retiré : ${err.message}`);
    return 0;
  }
}

// Au démarrage ou à l'arrêt : une conversion interrompue repart du début.
export const requeueImport = (pool) => pool.query(
  `UPDATE media_imports SET stage = NULL, progress = 0, updated_at = now() WHERE status = 'converting' AND stage IS NOT NULL`).catch(() => {});

export async function processImport({ job, pool, workDir, threads = 0, log = () => {}, download, uploadDir, deletePrefix, stopping = () => false }) {
  const dir = path.join(workDir, `import-${job.id}`);
  const out = path.join(dir, 'out');
  const prefix = `hls/${job.talk_id}/`;
  let last = 0; let lastWrite = 0;
  const french = job.audio_used === 'fr';
  const reimport = Boolean(job.reimport);
  let swapping = false; // reimport : les fichiers en place ont commencé à être remplacés
  const put = (progress) => pool.query('UPDATE media_imports SET progress = $2, updated_at = now() WHERE id = $1', [job.id, progress]).catch(() => {});
  try {
    if (reimport) {
      // La vidéo d'avant est en cours de reconversion (remplacement interrompu par un redémarrage) : on attend qu'elle soit prête.
      const now = (await pool.query(`SELECT video_status FROM talks WHERE id = $1 AND source = 'upload' AND media_prefix IS NULL`, [job.talk_id])).rows[0];
      if (now && ['pending', 'processing'].includes(now.video_status)) {
        await pool.query(`UPDATE media_imports SET stage = NULL, progress = 0, convert_attempts = GREATEST(convert_attempts - 1, 0), updated_at = now() + interval '1 minute' WHERE id = $1`, [job.id]).catch(() => {});
        return { ok: false, wait: true };
      }
    }
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
    let oldRef = null;
    if (reimport) {
      // La conférence doit toujours être la vidéo hébergée d'avant, prête, sans montage publié : sinon on ne touche à rien.
      const cur = (await pool.query(`SELECT video_ref FROM talks WHERE id = $1 AND source = 'upload' AND video_status = 'ready' AND media_prefix IS NULL`, [job.talk_id])).rows[0];
      if (!cur) {
        await deletePrefix(job.object_key).catch(() => {});
        await pool.query(`UPDATE media_imports SET status = 'canceled', stage = NULL, error = $2, finished_at = now(), updated_at = now() WHERE id = $1 AND status = 'converting'`,
          [job.id, 'La vidéo a changé entre-temps : voix française non appliquée']).catch(() => {});
        log(`[import ${job.id}] voix française : la conférence a changé entre-temps, rien n'est remplacé`);
        return { ok: false, gone: true };
      }
      oldRef = cur.video_ref;
      // Pendant le remplacement des fichiers, la conférence affiche « conversion en cours » plutôt qu'une vidéo cassée.
      swapping = true;
      await pool.query(`UPDATE talks SET video_status = 'processing', video_progress = 95 WHERE id = $1`, [job.talk_id]);
    }
    await deletePrefix(prefix); // reste d'un essai précédent (ou fichiers de la version d'avant)
    await uploadDir(out, prefix);
    const posters = [1, 2, 3].map((i) => `${prefix}c${i}.jpg`).filter((k) => fs.existsSync(path.join(out, k.slice(prefix.length))));

    // Bascule : la conférence devient une vidéo hébergée. Un seul bloc pour que le site ne voie jamais un état à moitié fait.
    const client = await pool.connect();
    let flipped = 0;
    try {
      await client.query('BEGIN');
      const t = reimport
        // Même vidéo, autre piste audio : titre, sous-titres, miniature choisie et statistiques ne bougent pas.
        ? await client.query(
          `UPDATE talks SET video_ref = $2, video_status = 'ready', video_progress = 100, video_error = NULL, audio_status = $3, duration_seconds = $4,
                  poster_candidates = $5, audio_track = 'fr', language = 'fr'
            WHERE id = $1 AND source = 'upload' AND video_ref = $6`,
          [job.talk_id, job.object_key, audio, Math.round(info.duration), posters, oldRef])
        : await client.query(
          `UPDATE talks SET source = 'upload', video_ref = $2, video_status = 'ready', video_progress = 100, video_error = NULL, audio_status = $3,
                  duration_seconds = $4, poster_key = $5, poster_candidates = $6, imported_from = $7, imported_origin = $8, external_file = NULL, rights_confirmed = true,
                  audio_track = $9, language = CASE WHEN $9 = 'fr' THEN 'fr' ELSE language END
            WHERE id = $1 AND (source <> 'upload' OR video_status = 'importing')`,
          [job.talk_id, job.object_key, audio, Math.round(info.duration), `${prefix}poster.jpg`, posters, job.source_url, job.origin, french ? 'fr' : null]);
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
    swapping = false;
    if (reimport && oldRef && oldRef !== job.object_key) await deletePrefix(oldRef).catch(() => {}); // ancien fichier source (voix d'origine)
    if (french) await dropHomeDubbing(pool, job.talk_id, deletePrefix, log);
    log(reimport ? `[import ${job.id}] terminé : la conférence porte maintenant la voix française de sa plateforme d'origine`
      : `[import ${job.id}] terminé : la conférence est maintenant hébergée${french ? ' (piste audio française)' : ''}`);
    return { ok: true };
  } catch (err) {
    // Voix française d'une vidéo déjà hébergée : si les fichiers en place ont été entamés, la vidéo est reconvertie depuis son
    // ancien fichier source (video_ref n'a pas bougé). Sinon rien n'a été touché.
    if (swapping) {
      await pool.query(`UPDATE talks SET video_status = 'pending', video_progress = 0, video_error = NULL, transcode_attempts = 0 WHERE id = $1 AND video_status = 'processing'`, [job.talk_id]).catch(() => {});
      log(`[import ${job.id}] remplacement interrompu : la vidéo d'avant est reconvertie depuis son fichier`);
    }
    if (stopping()) return { ok: false, stopped: true };
    const final = job.convert_attempts >= MAX_ATTEMPTS;
    log(`[import ${job.id}] échec de la conversion (${job.convert_attempts}/${MAX_ATTEMPTS}) : ${err.message}`);
    if (!reimport) await deletePrefix(prefix).catch(() => {});
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
