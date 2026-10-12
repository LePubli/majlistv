// Client S3 (Garage) : liens temporaires, suppression, CORS du bucket.
import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutBucketCorsCommand,
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

export const presignGet = (key) =>
  getSignedUrl(storage, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 4 * 3600 });

export const putObject = (key, body, contentType) =>
  storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }));

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
        }],
      },
    }));
    console.log('CORS du bucket configuré.');
  } catch (err) {
    console.warn('CORS du bucket non configuré :', err.message);
  }
}
