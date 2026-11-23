// Diagnostic du stockage S3 « N0C Storage » (PlanetHoster) pour y diffuser les vidéos de Mejliss TV.
// Il utilise le MÊME client que l'API (SDK AWS v3, signature V4, adressage par chemin) : si un test échoue ici, il échouerait dans l'API.
// Il ne touche QU'À des fichiers préfixés « _mejliss-check/ » qu'il efface à la fin. Il n'affiche jamais la clé secrète.
// Lancement (sur le VPS) : voir ops/n0c/README.md. Variables : N0C_ENDPOINT, N0C_BUCKET, N0C_REGION, N0C_KEY, N0C_SECRET,
// N0C_PUBLIC_BASE (facultative : adresse publique, ex. https://mondomaine.fr/n0c-storage), N0C_ORIGIN (facultative : https://majlisstv.le-publicitaire.fr).
import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';

const env = (k, d) => process.env[k] || d;
const endpoint = env('N0C_ENDPOINT', 'https://ht2-storage.n0c.com:5443');
const bucket = env('N0C_BUCKET'); const region = env('N0C_REGION', 'ht2-storage');
const accessKeyId = env('N0C_KEY'); const secretAccessKey = env('N0C_SECRET');
const publicBase = env('N0C_PUBLIC_BASE', '').replace(/\/$/, ''); const origin = env('N0C_ORIGIN', 'https://majlisstv.le-publicitaire.fr');
if (!bucket || !accessKeyId || !secretAccessKey) { console.error('Variables manquantes : N0C_BUCKET, N0C_KEY, N0C_SECRET (et N0C_ENDPOINT si différent).'); process.exit(2); }

const s3 = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }); // réglages identiques à api/src/storage.js
const P = `_mejliss-check/${Date.now()}/`;
const results = [];
const created = [];
async function step(name, fn, { critical = false } = {}) {
  const t0 = Date.now();
  try { const info = await fn(); results.push({ name, ok: true, info: info || '', ms: Date.now() - t0 }); console.log(`OK    ${name}${info ? ' — ' + info : ''}`); return true; } catch (e) {
    const why = `${e.name || 'Erreur'}${e.$metadata?.httpStatusCode ? ' HTTP ' + e.$metadata.httpStatusCode : ''} : ${String(e.message || e).slice(0, 200)}`;
    results.push({ name, ok: false, info: why, ms: Date.now() - t0 }); console.log(`ÉCHEC ${name} — ${why}`);
    if (critical) { console.log('\nTest critique en échec : arrêt (le reste dépend de lui).'); await cleanup(); summary(); process.exit(1); }
    return false;
  }
}
const mb = (n) => (n / 1048576).toFixed(1);
const put = async (key, body, type = 'application/octet-stream') => { await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type, ContentLength: body.length })); created.push(key); };
async function cleanup() { for (const k of created) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })).catch(() => {}); }

console.log(`Essai de ${endpoint} (bucket « ${bucket} », région « ${region} »)\n`);
await step('1. Connexion et liste du bucket', async () => { const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 })); return `${r.KeyCount ?? 0} objet(s) vus`; }, { critical: true });
await step('2. Envoi d’un petit fichier (PUT)', async () => { await put(P + 'petit.txt', Buffer.from('mejliss-check'), 'text/plain'); }, { critical: true });
await step('3. Lecture et taille (GET, HEAD)', async () => {
  const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: P + 'petit.txt' }));
  const g = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: P + 'petit.txt' })); const txt = Buffer.from(await g.Body.transformToByteArray()).toString();
  if (txt !== 'mejliss-check' || Number(h.ContentLength) !== 13) throw new Error('contenu ou taille différents');
  return `type ${h.ContentType}`;
});
const video = randomBytes(3 * 1024 * 1024);
await step('4. Lecture partielle (Range) — indispensable au lecteur vidéo', async () => {
  await put(P + 'plage.bin', video);
  const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: P + 'plage.bin', Range: 'bytes=1000-1999' }));
  const n = (await r.Body.transformToByteArray()).length; if (n !== 1000) throw new Error(`reçu ${n} octets au lieu de 1000`); return `206 (${r.ContentRange})`;
});
let signed;
await step('5. Lien temporaire signé V4 (comme l’API) lu par un client externe', async () => {
  signed = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: P + 'plage.bin' }), { expiresIn: 600 });
  const r = await fetch(signed, { headers: { Range: 'bytes=0-99' } });
  if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return `HTTP ${r.status}, accept-ranges : ${r.headers.get('accept-ranges') || 'absent'}`;
});
await step('6. CORS du lien signé (lecture depuis le navigateur du site)', async () => {
  if (!signed) throw new Error('pas de lien signé (test 5)');
  const r = await fetch(signed, { headers: { Origin: origin, Range: 'bytes=0-9' } });
  const acao = r.headers.get('access-control-allow-origin');
  if (!acao) throw new Error(`aucun en-tête Access-Control-Allow-Origin pour ${origin} : le lecteur HLS du navigateur serait bloqué (voir README, « CORS »)`);
  return `Access-Control-Allow-Origin : ${acao}`;
});
await step('7. Envoi en plusieurs parties (multipart) — vidéos volumineuses', async () => {
  const key = P + 'multi.bin'; const m = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key }));
  try {
    const parts = [];
    for (const n of [1, 2]) { const body = randomBytes(5 * 1024 * 1024 + 1); const u = await s3.send(new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: m.UploadId, PartNumber: n, Body: body, ContentLength: body.length })); parts.push({ ETag: u.ETag, PartNumber: n }); }
    await s3.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: m.UploadId, MultipartUpload: { Parts: parts } })); created.push(key);
    const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return `${mb(Number(h.ContentLength))} Mo assemblés`;
  } catch (e) { await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: m.UploadId })).catch(() => {}); throw e; }
});
await step('8. Copie interne (CopyObject) — utilisée par l’éditeur', async () => {
  await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: P + 'copie.txt', CopySource: `${bucket}/${P}petit.txt` })); created.push(P + 'copie.txt');
});
await step('9. Débit d’envoi depuis ce serveur (20 Mo)', async () => {
  const body = randomBytes(20 * 1024 * 1024); const t0 = Date.now(); await put(P + 'debit.bin', body); const s = (Date.now() - t0) / 1000;
  const t1 = Date.now(); const g = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: P + 'debit.bin' })); await g.Body.transformToByteArray(); const d = (Date.now() - t1) / 1000;
  return `envoi ${(20 / s).toFixed(1)} Mo/s, lecture ${(20 / d).toFixed(1)} Mo/s`;
});
if (publicBase) {
  await step('10. Adresse publique (sans signature)', async () => {
    const r = await fetch(`${publicBase}/${P}petit.txt`, { headers: { Origin: origin } });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${publicBase}/… (adresse publique mal réglée, ou fichier non public)`);
    return `HTTP ${r.status}, Access-Control-Allow-Origin : ${r.headers.get('access-control-allow-origin') || 'absent'}, accept-ranges : ${r.headers.get('accept-ranges') || 'absent'}  ⚠ lisible par n’importe qui`;
  });
} else console.log('—     10. Adresse publique : non testée (N0C_PUBLIC_BASE non renseignée)');

await cleanup();
function summary() {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== Résumé : ${results.length - bad.length} réussi(s), ${bad.length} échec(s) ===`);
  for (const r of bad) console.log(`  ✗ ${r.name} : ${r.info}`);
  console.log('Fichiers d’essai effacés. Copiez ce résultat tel quel dans la conversation.');
}
summary();
process.exit(results.some((r) => !r.ok) ? 1 : 0);
