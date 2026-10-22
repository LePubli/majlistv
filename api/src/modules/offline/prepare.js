// Étape 22b-6 — prépare le fichier « hors connexion » d'une conférence : FFmpeg copie (sans reconversion) la playlist HLS vers un seul fichier
// MP4 (vidéo) ou M4A (audio), qui est gardé dans le stockage (offline/<conférence>/<version>/…) et réutilisé pour les téléchargements suivants.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { config } from '../../config.js';
import { pool } from '../../db.js';
import { storage, presignGet, deleteObject } from '../../storage.js';
import { rewriteVariant } from '../../hls.js';
import { parseMaster, pickVariant, ffmpegArgs, offlineKey } from './lib.js';
import { versionOf } from '../../hls.js';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const MAX_PARALLEL = 2;
const FFMPEG_TIMEOUT_MS = 40 * 60 * 1000;
const PART = 16 * 1024 * 1024;
const bucket = config.s3.bucket;

const running = new Map(); // id de ligne → promesse
const waiting = [];
let active = 0;

const text = async (key) => (await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body.transformToString();

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('délai dépassé')); }, FFMPEG_TIMEOUT_MS);
    p.stderr.on('data', (b) => { err = (err + b).slice(-600); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(err.trim() || `FFmpeg ${code}`)); });
  });
}

function sha256Of(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// Envoi par morceaux (un seul gros envoi passerait mal par un proxy limité en taille).
async function putFile(key, path, size, contentType) {
  const { UploadId } = await storage.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
  const fh = await open(path, 'r');
  try {
    const parts = [];
    for (let n = 1, off = 0; off < size || n === 1; n += 1, off += PART) {
      const len = Math.min(PART, size - off);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, off);
      const r = await storage.send(new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber: n, Body: buf, ContentLength: len }));
      parts.push({ PartNumber: n, ETag: r.ETag });
      if (off + PART >= size) break;
    }
    await storage.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }));
  } catch (e) {
    await storage.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId })).catch(() => {});
    throw e;
  } finally { await fh.close(); }
}

async function work(row, log) {
  const dir = await mkdtemp(join(tmpdir(), 'offline-'));
  try {
    let playlist;
    if (row.kind === 'audio') playlist = 'audio/index.m3u8';
    else {
      const v = pickVariant(parseMaster(await text(`${row.prefix}master.m3u8`)), row.height);
      if (!v) throw new Error('aucune qualité vidéo disponible');
      playlist = v.path;
    }
    const slash = playlist.lastIndexOf('/');
    const base = slash >= 0 ? playlist.slice(0, slash + 1) : '';
    const signed = await rewriteVariant(await text(`${row.prefix}${playlist}`), (rel) => presignGet(`${row.prefix}${base}${rel}`));
    const inPath = join(dir, 'in.m3u8');
    const outPath = join(dir, row.kind === 'audio' ? 'out.m4a' : 'out.mp4');
    await writeFile(inPath, signed);
    await runFfmpeg(ffmpegArgs(inPath, outPath, row.kind));
    const size = (await stat(outPath)).size;
    if (size < 1000) throw new Error('fichier produit vide');
    const sha = await sha256Of(outPath);
    const key = offlineKey(row.talk_id, versionOf(row.talk_id, row.prefix) || '0', row.kind, row.height);
    await putFile(key, outPath, size, row.kind === 'audio' ? 'audio/mp4' : 'video/mp4');
    await pool.query(`UPDATE offline_files SET status = 'ready', object_key = $2, size = $3, sha256 = $4, error = NULL, updated_at = now() WHERE id = $1`, [row.id, key, size, sha]);
  } catch (e) {
    log?.warn?.(`Hors connexion : préparation impossible (${e.message})`);
    await pool.query(`UPDATE offline_files SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [row.id, String(e.message).slice(0, 300)]);
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** Lance (ou rejoint) la préparation d'une ligne `offline_files` ; au plus 2 FFmpeg en parallèle, les autres attendent. */
export function enqueue(row, log) {
  if (running.has(row.id)) return running.get(row.id);
  const job = new Promise((resolve) => {
    const start = async () => { active += 1; try { await work(row, log); } finally { active -= 1; running.delete(row.id); resolve(); const next = waiting.shift(); if (next) next(); } };
    if (active < MAX_PARALLEL) void start(); else waiting.push(start);
  });
  running.set(row.id, job);
  return job;
}

export const isRunning = (id) => running.has(id);

/** Au démarrage de l'API : les préparations interrompues sont oubliées (le prochain téléchargement repart de zéro). */
export async function resetStale() {
  await pool.query(`DELETE FROM offline_files WHERE status = 'preparing'`);
}

/** Efface les fichiers préparés d'une conférence (suppression de la conférence). */
export async function removeFiles(talkId) {
  const { rows } = await pool.query('SELECT object_key FROM offline_files WHERE talk_id = $1 AND object_key IS NOT NULL', [talkId]);
  for (const r of rows) await deleteObject(r.object_key).catch(() => {});
}

// ---- Fichiers temporaires : le serveur ne garde pas les fichiers préparés (ils restent sur le téléphone de l'abonné). ----
export const FILE_TTL_MIN = Math.max(15, Number(process.env.OFFLINE_FILE_TTL_MIN) || 180);   // durée de vie d'un fichier prêt, depuis le dernier envoi d'un lien
export const DONE_GRACE_MIN = 10;                                                             // après « téléchargement terminé »
let lastSweep = 0;

/** Efface les fichiers prêts non réclamés depuis FILE_TTL_MIN minutes (objet + ligne) et les échecs de plus d'une heure. Au plus une fois par minute. */
export async function sweep(log, { force = false } = {}) {
  if (!force && Date.now() - lastSweep < 60000) return 0;
  lastSweep = Date.now();
  let n = 0;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM offline_files
        WHERE (status = 'ready' AND updated_at < now() - make_interval(mins => $1))
           OR (status = 'failed' AND updated_at < now() - interval '1 hour')`, [FILE_TTL_MIN]);
    for (const r of rows) {
      // Suppression conditionnelle : si un abonné vient de redemander le fichier (updated_at rafraîchi), on le garde.
      const del = await pool.query(
        `DELETE FROM offline_files WHERE id = $1 AND ((status = 'ready' AND updated_at < now() - make_interval(mins => $2)) OR (status = 'failed' AND updated_at < now() - interval '1 hour')) RETURNING object_key`,
        [r.id, FILE_TTL_MIN]);
      if (!del.rowCount) continue;
      n += 1;
      if (del.rows[0].object_key) await deleteObject(del.rows[0].object_key).catch(() => {});
    }
  } catch (e) { log?.warn?.(`Hors connexion : ménage impossible (${e.message})`); }
  return n;
}
