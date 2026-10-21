// Étape Import — outil de test : le worker prend UNE vidéo copiée à convertir (même code que le service).
// Variables : DATABASE_URL, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION, S3_BUCKET, WORK_DIR (facultatif), FFMPEG_THREADS.
// Sortie : une ligne JSON { claimed, id, ok, error }.
import os from 'node:os';
import pg from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { makeImportClaim, processImport } from '../src/importconv.js';
import { makeFiles } from '../src/files.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const bucket = process.env.S3_BUCKET || 'majlis-videos';
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || 'garage', forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
const job = await makeImportClaim(pool, (...a) => console.error(...a))();
if (!job) { console.log(JSON.stringify({ claimed: false })); await pool.end(); process.exit(0); }
const r = await processImport({ job, pool, workDir: process.env.WORK_DIR || os.tmpdir(), threads: Number(process.env.FFMPEG_THREADS || 2),
  log: (...a) => console.error(...a), ...makeFiles(s3, bucket) });
console.log(JSON.stringify({ claimed: true, id: job.id, ...r }));
await pool.end();
