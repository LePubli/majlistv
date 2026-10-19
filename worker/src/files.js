// Fichiers du stockage S3 (Garage) utilisés par le worker : téléchargement, envoi d'un dossier entier, suppression d'un préfixe.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.m4s': 'video/iso.segment', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };

export function makeFiles(s3, BUCKET) {
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

  return { download, uploadDir, deletePrefix };
}
