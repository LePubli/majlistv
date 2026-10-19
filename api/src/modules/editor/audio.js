// Module « Éditeur de montage » — étape E2 : formes d'onde, niveau sonore mesuré et extraits d'écoute « réduction du bruit ».
//
// Formes d'onde : une file dans la base (editor_waveforms), traitée par l'API une analyse à la fois avec FFmpeg :
//   voix d'origine  = piste son de la qualité 360p (playlist HLS v0, lue par l'API elle-même avec un jeton de lecture),
//   voix française  = piste « voix seule » du doublage (lien fourni par le module Doublage, événement editor.media),
//   musique         = fichier importé dans la bibliothèque.
// Résultat : un pic toutes les 100 ms (0-255) + le niveau sonore intégré (LUFS, EBU R128) + la durée.
// Les analyses sont visibles dans Studio → Activité (file « editor », tâche légère : ni la plage horaire ni la pause
// générale des tâches lourdes ne les retiennent ; pause et priorité possibles).
import { spawn } from 'node:child_process';
import { pool } from '../../db.js';
import { config } from '../../config.js';
import { presignGet } from '../../storage.js';
import { makePlaybackToken } from '../../playback.js';
import * as ext from '../../ext.js';
import { DENOISE_FILTER } from './denoise.js';

export const STEP_MS = 100;
const RATE = 8000; // échantillons par seconde pour l'analyse (largement assez pour une forme d'onde)
const PER_STEP = (RATE * STEP_MS) / 1000;
const MAX_SECONDS = 15 * 60; // une analyse ne doit jamais bloquer la file
export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// Lien interne vers la qualité 360p d'une conférence (l'API répond elle-même et signe les segments).
export const internalHls = (talkId) => `http://127.0.0.1:${config.port}/hls/${talkId}/v0/index.m3u8?t=${encodeURIComponent(makePlaybackToken(talkId, 3600))}`;

let ffmpegOk = null;
export async function hasFfmpeg() {
  if (ffmpegOk !== null) return ffmpegOk;
  ffmpegOk = await new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-version']);
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
  return ffmpegOk;
}

// Analyse un fichier ou un flux : pics, durée, LUFS. Sans dépendance : FFmpeg écrit du PCM 16 bits mono sur sa sortie.
export function analyse(input, { timeoutS = MAX_SECONDS } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-nostats', '-v', 'info', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,hls', '-i', input, '-vn',
      '-filter_complex', `[0:a:0]asplit=2[w][l];[l]ebur128=peak=none[lo]`,
      '-map', '[w]', '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:1', '-map', '[lo]', '-f', 'null', '-'];
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const peaks = [];
    let cur = 0; let n = 0; let total = 0; let rest = null; let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Analyse trop longue (arrêtée)')); }, timeoutS * 1000);
    p.stdout.on('data', (chunk) => {
      let buf = rest ? Buffer.concat([rest, chunk]) : chunk;
      const even = buf.length - (buf.length % 2);
      rest = even < buf.length ? buf.subarray(even) : null;
      buf = buf.subarray(0, even);
      for (let i = 0; i < buf.length; i += 2) {
        const v = Math.abs(buf.readInt16LE(i));
        if (v > cur) cur = v;
        n += 1; total += 1;
        if (n === PER_STEP) { peaks.push(Math.min(255, Math.round((cur / 32768) * 255))); cur = 0; n = 0; }
      }
    });
    p.stderr.on('data', (d) => { err = (err + d.toString()).slice(-20000); });
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`FFmpeg introuvable (${e.message})`)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (n > 0) peaks.push(Math.min(255, Math.round((cur / 32768) * 255)));
      if (code !== 0 || total === 0) {
        const line = err.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !/^\[Parsed_ebur128/.test(l)).slice(-2).join(' · ');
        reject(new Error(total === 0 ? `Aucun son lu${line ? ` : ${line}` : ''}` : `FFmpeg (${code}) : ${line}`.slice(0, 400)));
        return;
      }
      const m = [...err.matchAll(/I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/g)].pop();
      resolve({ peaks: Buffer.from(peaks), durationS: total / RATE, lufs: m ? Number(m[1]) : null });
    });
  });
}

// Réduction du bruit : réglages d'afftdn (FFmpeg). Les mêmes seront utilisés par le rendu final (étape E4).
export { DENOISE_FILTER };

// Extrait de 10 s de la voix d'origine, avec ou sans réduction du bruit, pour comparer à l'oreille (AAC dans un conteneur MP4).
export function denoiseSample(talkId, at, level, seconds = 10) {
  return new Promise((resolve, reject) => {
    const f = [DENOISE_FILTER[level], 'aresample=44100'].filter(Boolean).join(',');
    const args = ['-hide_banner', '-v', 'error', '-ss', String(Math.max(0, at)), '-t', String(seconds), '-i', internalHls(talkId), '-vn', '-ac', '1',
      '-af', f, '-c:a', 'aac', '-b:a', '96k', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'];
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Extrait trop long à préparer')); }, 60_000);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err = (err + d.toString()).slice(-4000); });
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`FFmpeg introuvable (${e.message})`)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(out);
      if (code !== 0 || !buf.length) reject(new Error(`Extrait impossible : ${err.trim().split('\n').pop() || code}`.slice(0, 300)));
      else resolve(buf);
    });
  });
}

// --- File des analyses

// Ce qu'il faut analyser pour une conférence : voix d'origine (playlist v0) et, s'il y en a une, voix française.
async function sourcesOf(talkId) {
  const t = (await pool.query("SELECT id, source, video_status FROM talks WHERE id = $1", [talkId])).rows[0];
  if (!t || t.source !== 'upload' || t.video_status !== 'ready') return {};
  const media = { dub: null };
  await ext.emit('editor.media', media, { talkId });
  return { orig: `hls:${talkId}:v0`, dub: media.dub?.trackId ? `dub:${media.dub.trackId}` : null };
}

// Met en file les analyses manquantes ou périmées d'une conférence. Renvoie les lignes à jour.
export async function ensureTalkWaveforms(talkId) {
  const src = await sourcesOf(talkId);
  for (const kind of ['orig', 'dub']) {
    if (!src[kind]) continue;
    await pool.query(
      `INSERT INTO editor_waveforms(kind, talk_id, src) VALUES ($1, $2, $3)
       ON CONFLICT (talk_id, kind) WHERE talk_id IS NOT NULL DO UPDATE
         SET src = EXCLUDED.src, status = 'queued', peaks = NULL, lufs = NULL, duration_s = NULL, error = NULL, attempts = 0, updated_at = now()
         WHERE editor_waveforms.src <> EXCLUDED.src`, [kind, talkId, src[kind]]);
  }
  return src;
}

export async function ensureAssetWaveform(assetId, key) {
  await pool.query(
    `INSERT INTO editor_waveforms(kind, asset_id, src) VALUES ('music', $1, $2) ON CONFLICT (asset_id) WHERE asset_id IS NOT NULL DO NOTHING`, [assetId, key]);
}

export const waveView = (w) => (w ? {
  status: w.status, stepMs: w.step_ms, peaks: w.peaks ? Buffer.from(w.peaks).toString('base64') : null,
  durationS: w.duration_s == null ? null : Number(w.duration_s), lufs: w.lufs == null ? null : Number(w.lufs), error: w.error || null,
} : null);

let controlsReady = null;
async function hasControls() {
  if (controlsReady === null) controlsReady = Boolean((await pool.query("SELECT to_regprocedure('activity_paused(text,text)') AS f")).rows[0].f);
  return controlsReady;
}

// Prend la prochaine analyse (priorité de Studio → Activité, puis ancienneté), en sautant celles mises en pause.
async function claim() {
  const ctl = await hasControls();
  const PAUSED = ctl ? "activity_paused('editor', id::text)" : 'false';
  const PRIORITY = ctl ? "activity_priority('editor', id::text)" : '0';
  return (await pool.query(
    `UPDATE editor_waveforms SET status = 'running', started_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = (SELECT id FROM editor_waveforms WHERE status = 'queued' AND NOT ${PAUSED}
                  ORDER BY ${PRIORITY} DESC, created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows[0] || null;
}

async function inputOf(w) {
  if (w.kind === 'orig') return internalHls(w.talk_id);
  if (w.kind === 'dub') {
    const media = { dub: null };
    await ext.emit('editor.media', media, { talkId: w.talk_id });
    if (!media.dub?.voiceUrl) throw new Error('Plus de piste française pour cette conférence');
    return media.dub.voiceUrl;
  }
  const a = (await pool.query('SELECT key FROM editor_assets WHERE id = $1', [w.asset_id])).rows[0];
  if (!a) throw new Error('Musique supprimée');
  return presignGet(a.key);
}

let busy = false;
export async function processQueue(log) {
  if (busy) return 0;
  busy = true;
  let done = 0;
  try {
    if (!(await hasFfmpeg())) return 0;
    for (;;) {
      const w = await claim();
      if (!w) break;
      try {
        const r = await analyse(await inputOf(w));
        await pool.query(`UPDATE editor_waveforms SET status = 'ready', peaks = $2, duration_s = $3, lufs = $4, error = NULL, step_ms = $5, updated_at = now() WHERE id = $1`,
          [w.id, r.peaks, r.durationS, r.lufs, STEP_MS]);
        done += 1;
      } catch (err) {
        // Deux essais, puis « en échec » (relançable depuis l'éditeur).
        await pool.query(`UPDATE editor_waveforms SET status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'queued' END, error = $2, updated_at = now() WHERE id = $1`,
          [w.id, err.message.slice(0, 400)]);
        log?.warn(`Éditeur : forme d'onde ${w.kind} impossible (${err.message})`);
      }
    }
  } finally { busy = false; }
  return done;
}

// Au démarrage : une analyse interrompue par un arrêt de l'API repart.
export const recover = () => pool.query("UPDATE editor_waveforms SET status = 'queued', updated_at = now() WHERE status = 'running'");

// Studio → Activité : analyses en cours, en attente et en échec (30 derniers jours).
export async function collectTasks(out, { organizerId }) {
  const { rows } = await pool.query(
    `SELECT w.id, w.kind, w.status, w.error, w.created_at, w.talk_id, COALESCE(t.title, a.title) AS title
       FROM editor_waveforms w LEFT JOIN talks t ON t.id = w.talk_id LEFT JOIN editor_assets a ON a.id = w.asset_id
      WHERE (w.status IN ('queued', 'running') OR (w.status = 'failed' AND w.updated_at > now() - interval '30 days'))
        AND ($1::uuid IS NULL OR t.organizer_id = $1)`, [organizerId]);
  for (const r of rows) {
    out.push({ queue: 'editor', ref: r.id, talkId: r.talk_id, title: r.title || '', kind: r.kind,
      status: r.status === 'running' ? 'running' : r.status === 'failed' ? 'failed' : 'waiting', progress: null, error: r.error,
      createdAt: r.created_at, light: true, link: '/studio/editor' });
  }
}
