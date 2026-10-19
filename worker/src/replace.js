// Étape E4b : préparation d'une NOUVELLE VERSION de la vidéo publiée (remplacement par un montage, ou restauration de l'original).
// Le fichier (copie du rendu final, ou original) est converti comme une vidéo envoyée (HLS multi-qualités, miniatures, audio seul)
// dans un dossier à part : hls/<conférence>/r/<remplacement>/. La version publiée ne bouge pas : la bascule est faite ensuite par l'API.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { probe, transcode, makeAudio, killCurrent } from './transcode.js';

const MAX_ATTEMPTS = 2;

export function makeReplaceClaim(pool, log = () => {}) {
  let controls = true;
  return async function claimReplace() {
    const cond = controls ? `AND activity_allows('video') AND NOT activity_paused('replace', id::text)` : '';
    const order = controls ? `activity_priority('replace', id::text) DESC, created_at` : 'created_at';
    try {
      const { rows } = await pool.query(
        `UPDATE editor_replacements SET stage = 'download', progress = 1, error = NULL, attempts = attempts + 1, updated_at = now()
          WHERE id = (SELECT id FROM editor_replacements WHERE status = 'converting' AND stage IS NULL AND NOT cancel_requested ${cond}
                      ORDER BY ${order} LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, talk_id, kind, source_key, new_prefix, attempts`);
      return rows[0];
    } catch (err) {
      if (err.code === '42P01') return undefined; // migration de l'API pas encore passée
      if (controls && err.code === '42883') { controls = false; log('Pause et priorité indisponibles : file simple'); return claimReplace(); }
      throw err;
    }
  };
}

// Au démarrage : une préparation interrompue repart du début.
export const requeueReplace = (pool) => pool.query(`UPDATE editor_replacements SET stage = NULL, progress = 0, updated_at = now() WHERE status = 'converting' AND stage IS NOT NULL`).catch(() => {});

export async function processReplace({ job, pool, workDir, threads = 0, log = () => {}, download, uploadDir, deletePrefix, stopping = () => false }) {
  const dir = path.join(workDir, `replace-${job.id}`);
  const out = path.join(dir, 'out');
  let last = 0; let lastWrite = 0; let canceled = false;
  const put = (stage, progress) => pool.query(
    'UPDATE editor_replacements SET stage = $2, progress = $3, updated_at = now() WHERE id = $1 RETURNING cancel_requested', [job.id, stage, progress])
    .then((r) => { if (r.rows[0]?.cancel_requested) { canceled = true; killCurrent(); } }).catch(() => {});
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(out, { recursive: true });
    const input = path.join(dir, 'source');
    log(`[nouvelle version ${job.id}] téléchargement`);
    await download(job.source_key, input);
    const info = await probe(input);
    await put('convert', 5);
    await transcode({
      input, outDir: out, info, threads,
      onProgress: (p) => {
        const pct = 5 + Math.floor(p * 85);
        if (pct > last && Date.now() - lastWrite > 3000) { last = pct; lastWrite = Date.now(); put('convert', pct); }
      },
    });
    if (canceled) throw new Error('annulé');
    let hasAudio = info.hasAudio;
    if (info.hasAudio) {
      try { await makeAudio({ input, outDir: path.join(out, 'audio') }); } catch (err) { hasAudio = false; log(`[nouvelle version ${job.id}] audio seul : ${err.message}`); }
    }
    await put('upload', 92);
    await deletePrefix(job.new_prefix); // reste d'un essai précédent
    await uploadDir(out, job.new_prefix);
    const posters = ['poster.jpg', 'c1.jpg', 'c2.jpg', 'c3.jpg'].filter((f) => fs.existsSync(path.join(out, f)));
    const res = await pool.query(
      `UPDATE editor_replacements SET status = 'converted', stage = NULL, progress = 100, updated_at = now(), info = $2
        WHERE id = $1 AND status = 'converting' AND NOT cancel_requested RETURNING id`,
      [job.id, { duration: info.duration, height: info.height, hasAudio: Boolean(hasAudio && info.hasAudio), audioReady: Boolean(hasAudio), posters }]);
    if (!res.rowCount) { await deletePrefix(job.new_prefix).catch(() => {}); await pool.query(`UPDATE editor_replacements SET status = 'canceled', stage = NULL, finished_at = now() WHERE id = $1 AND status = 'converting'`, [job.id]).catch(() => {}); log(`[nouvelle version ${job.id}] annulée`); return { ok: false, canceled: true }; }
    log(`[nouvelle version ${job.id}] prête (${Math.round(info.duration)} s, ${info.height}p) : bascule par l'API`);
    return { ok: true };
  } catch (err) {
    await deletePrefix(job.new_prefix).catch(() => {});
    if (stopping()) return { ok: false, stopped: true };
    const c = (await pool.query('SELECT cancel_requested FROM editor_replacements WHERE id = $1', [job.id]).catch(() => ({ rows: [] }))).rows[0];
    if (canceled || c?.cancel_requested) {
      await pool.query(`UPDATE editor_replacements SET status = 'canceled', stage = NULL, finished_at = now(), updated_at = now() WHERE id = $1`, [job.id]).catch(() => {});
      log(`[nouvelle version ${job.id}] annulée`);
      return { ok: false, canceled: true };
    }
    const final = job.attempts >= MAX_ATTEMPTS;
    log(`[nouvelle version ${job.id}] échec (${job.attempts}/${MAX_ATTEMPTS}) : ${err.message}`);
    await pool.query(
      `UPDATE editor_replacements SET status = CASE WHEN $3 THEN 'failed' ELSE status END, stage = NULL, progress = 0, error = $2,
              finished_at = CASE WHEN $3 THEN now() ELSE finished_at END, updated_at = now() WHERE id = $1`,
      [job.id, String(err.message).slice(0, 800), final]).catch(() => {});
    return { ok: false, error: err.message };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
