// Worker Mejliss TV : convertit les vidéos envoyées (talks.video_status = 'pending') en HLS.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import {
  S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { probe, transcode, killCurrent } from './transcode.js';

const env = (k, d) => process.env[k] ?? d;
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Variable manquante : ${k}`); process.exit(1); } return v; };

const DATABASE_URL = need('DATABASE_URL');
const BUCKET = env('S3_BUCKET', 'majlis-videos');
const WORK_DIR = env('WORK_DIR', '/work');
const POLL_MS = Number(env('POLL_SECONDS', '10')) * 1000;
const THREADS = Number(env('FFMPEG_THREADS', '0')); // 0 = automatique
const MAX_ATTEMPTS = 3;

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
const s3 = new S3Client({
  endpoint: need('S3_ENDPOINT'),
  region: env('S3_REGION', 'garage'),
  forcePathStyle: true,
  credentials: { accessKeyId: need('S3_ACCESS_KEY'), secretAccessKey: need('S3_SECRET_KEY') },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.m4s': 'video/iso.segment', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

let current = null; // { id } du job en cours
let stopping = false;
let lastOk = null;

// Réserve la plus ancienne vidéo en attente.
async function claim() {
  const { rows } = await pool.query(
    `UPDATE talks SET video_status = 'processing', video_progress = 0, video_error = NULL,
            transcode_attempts = transcode_attempts + 1
     WHERE id = (SELECT id FROM talks WHERE source = 'upload' AND video_status = 'pending'
                 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, video_ref, transcode_attempts`
  );
  return rows[0];
}

async function download(key, file) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await pipeline(obj.Body, fs.createWriteStream(file));
}

async function* walk(dir, base = dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else yield path.relative(base, full);
  }
}

async function uploadDir(dir, prefix) {
  const files = [];
  for await (const f of walk(dir)) files.push(f);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const rel = files[next++];
      const full = path.join(dir, rel);
      const { size } = await fsp.stat(full);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: prefix + rel.split(path.sep).join('/'), Body: fs.createReadStream(full),
        ContentLength: size, ContentType: TYPES[path.extname(rel)] || 'application/octet-stream',
      }));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return files.length;
}

async function deletePrefix(prefix) {
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    const objs = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (objs.length) await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: objs, Quiet: true } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

async function processJob(job) {
  const dir = path.join(WORK_DIR, job.id);
  const out = path.join(dir, 'out');
  const prefix = `hls/${job.id}/`;
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(out, { recursive: true });
    const input = path.join(dir, 'source');
    log(`[${job.id}] téléchargement`);
    await download(job.video_ref, input);
    const info = await probe(input);
    log(`[${job.id}] ${Math.round(info.duration)} s, ${info.height}p, audio=${info.hasAudio} : conversion`);

    let last = 0;
    let lastWrite = 0;
    await transcode({
      input, outDir: out, info, threads: THREADS,
      onProgress: (p) => {
        const pct = Math.floor(p * 95); // les 5 derniers % = envoi vers le stockage
        if (pct > last && Date.now() - lastWrite > 4000) {
          last = pct; lastWrite = Date.now();
          pool.query('UPDATE talks SET video_progress = $2 WHERE id = $1', [job.id, pct]).catch(() => {});
        }
      },
    });

    log(`[${job.id}] envoi vers le stockage`);
    const n = await uploadDir(out, prefix);
    const res = await pool.query(
      `UPDATE talks SET video_status = 'ready', video_progress = 100, video_error = NULL,
              duration_seconds = $2, poster_key = $3 WHERE id = $1`,
      [job.id, Math.round(info.duration), `${prefix}poster.jpg`]
    );
    if (!res.rowCount) { await deletePrefix(prefix); log(`[${job.id}] conférence supprimée entre-temps, nettoyé`); }
    else log(`[${job.id}] terminé (${n} fichiers)`);
    lastOk = new Date().toISOString();
  } catch (err) {
    if (stopping) throw err;
    const final = job.transcode_attempts >= MAX_ATTEMPTS;
    log(`[${job.id}] échec (${job.transcode_attempts}/${MAX_ATTEMPTS}) : ${err.message}`);
    await pool.query('UPDATE talks SET video_status = $2, video_error = $3 WHERE id = $1',
      [job.id, final ? 'failed' : 'pending', String(err.message).slice(0, 1000)]).catch(() => {});
    await deletePrefix(prefix).catch(() => {});
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  // Petit serveur de santé (certaines plateformes exigent un port ouvert).
  http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', current: current?.id ?? null, lastOk }));
  }).listen(Number(env('PORT', '3000')));

  // Un seul worker : toute conversion restée "processing" est reprise.
  for (;;) {
    try {
      await pool.query(`UPDATE talks SET video_status = 'pending' WHERE video_status = 'processing'`);
      break;
    } catch (err) { log('Base pas prête (migration 004 appliquée ?) :', err.message); await sleep(POLL_MS); }
  }
  log('Worker prêt.');
  while (!stopping) {
    let job;
    try { job = await claim(); } catch (err) { log('Erreur base :', err.message); }
    if (!job) { await sleep(POLL_MS); continue; }
    current = job;
    await processJob(job);
    current = null;
  }
}

// Arrêt propre (redéploiement) : la vidéo en cours repasse en attente.
const shutdown = async () => {
  stopping = true;
  killCurrent();
  if (current) await pool.query(`UPDATE talks SET video_status = 'pending' WHERE id = $1`, [current.id]).catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => { console.error(err); process.exit(1); });
