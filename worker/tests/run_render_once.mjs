// Étape E4a — outil de test : le worker prend UN rendu en attente (même code que le service) et le calcule.
// Variables : DATABASE_URL, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION, S3_BUCKET, WORK_DIR (facultatif), FFMPEG_THREADS.
// Sortie : une ligne JSON { claimed, id, ok, error }.
import os from 'node:os';
import pg from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { makeRenderClaim, processRender } from '../src/render.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || 'garage', forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
const job = await makeRenderClaim(pool, (...a) => console.error(...a))();
if (!job) { console.log(JSON.stringify({ claimed: false })); await pool.end(); process.exit(0); }
const r = await processRender({ job, pool, s3, bucket: process.env.S3_BUCKET || 'majlis-videos', workDir: process.env.WORK_DIR || os.tmpdir(),
  threads: Number(process.env.FFMPEG_THREADS || 2), log: (...a) => console.error(...a) });
console.log(JSON.stringify({ claimed: true, id: job.id, ...r }));
await pool.end();
