// Client S3 (Garage) : liens temporaires, suppression, CORS du bucket.
import {
  S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutBucketCorsCommand, CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

const { endpoint, region, bucket, accessKey, secretKey } = config.s3;

// Désactivé tant que les variables S3_* ne sont pas renseignées.
export const storage = endpoint && accessKey && secretKey
  ? new S3Client({
      endpoint,
      region,
      forcePathStyle: true, // Garage sans root_domain : adressage par chemin
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', // compatibilité avec les stockages S3 tiers
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  : null;

// download : nom de fichier proposé au téléchargement (en-tête Content-Disposition: attachment), facultatif.
export const presignGet = (key, { download } = {}) =>
  getSignedUrl(storage, new GetObjectCommand({ Bucket: bucket, Key: key,
    ...(download ? { ResponseContentDisposition: `attachment; filename="${String(download).replace(/[^\w.\- ]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(download)}` } : {}) }),
  { expiresIn: 4 * 3600 });

export const putObject = (key, body, contentType) =>
  storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }));

// Lien d'envoi direct navigateur -> stockage (PDF des ouvrages) : valable 30 min, type de contenu imposé.
export const presignPut = (key, contentType) =>
  getSignedUrl(storage, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 1800 });
export const headObject = (key) => storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
export async function getObjectBuffer(key) {
  const r = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await r.Body.transformToByteArray());
}

// Copie d'un fichier dans le même bucket, sans le télécharger (étape E4b : rendu → nouvelle vidéo de la conférence).
export const copyObject = (from, to, contentType) => storage.send(new CopyObjectCommand({
  Bucket: bucket, Key: to, CopySource: `${bucket}/${from.split('/').map(encodeURIComponent).join('/')}`,
  ...(contentType ? { ContentType: contentType, MetadataDirective: 'REPLACE' } : {}),
}));

// Clés d'un préfixe (avec leur taille).
export async function listKeys(prefix) {
  const out = []; let token;
  do {
    const page = await storage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents || []) out.push({ key: o.Key, size: Number(o.Size) || 0 });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

// Supprime une liste de clés (par paquets de 1000).
export async function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const objs = keys.slice(i, i + 1000).map((k) => ({ Key: k }));
    if (objs.length) await storage.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objs, Quiet: true } }));
  }
}

export const deleteObject = (key) => storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

// Supprime tous les objets d'un préfixe (ex. hls/<id>/).
export async function deletePrefix(prefix) {
  let token;
  do {
    const page = await storage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const objs = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (objs.length) await storage.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objs, Quiet: true } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

// Autorise le navigateur du site à envoyer les morceaux (et à lire l'ETag, indispensable).
export async function ensureCors() {
  if (!storage) {
    console.warn('Stockage S3 non configuré : upload désactivé.');
    return;
  }
  try {
    await storage.send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: config.corsOrigin.split(','),
          AllowedMethods: ['GET', 'HEAD', 'PUT'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        }, {
          // Lecture seule ouverte : le récepteur Chromecast du téléviseur télécharge les segments vidéo (liens signés, à durée limitée) depuis un autre domaine.
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 3600,
        }],
      },
    }));
    console.log('CORS du bucket configuré.');
  } catch (err) {
    console.warn('CORS du bucket non configuré :', err.message);
  }
}
