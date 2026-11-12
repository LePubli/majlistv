// Upload multipart direct navigateur -> stockage : l'API ne fait que signer les liens.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CreateMultipartUploadCommand, UploadPartCommand,
  CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../db.js';
import { config } from '../config.js';
import { storage } from '../storage.js';

// 32 Mo par morceau : reste sous la limite de 64 Mo de Nginx (client_max_body_size posée par DockPanel).
const PART_SIZE = 32 * 1024 * 1024;
const bucket = config.s3.bucket;

const startSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().regex(/^video\/[\w.+-]+$/),
});
const idSchema = z.object({ id: z.guid() });
const completeSchema = z.object({
  parts: z.array(z.object({
    PartNumber: z.number().int().min(1).max(10000),
    ETag: z.string().min(1),
  })).min(1).max(10000),
});

export default async function uploadRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const off = (reply) => reply.code(503).send({ error: 'Stockage non configuré' });

  // 1) Démarre l'upload et renvoie un lien signé par morceau.
  app.post('/uploads', organizer, async (req, reply) => {
    if (!storage) return off(reply);
    const b = startSchema.parse(req.body);
    if (b.size > config.maxUploadBytes) return reply.code(413).send({ error: 'Fichier trop volumineux' });
    const key = `talks/${randomUUID()}`;
    const { UploadId } = await storage.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: b.contentType })
    );
    const { rows } = await pool.query(
      `INSERT INTO uploads(organizer_id, object_key, s3_upload_id, filename, size)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.sub, key, UploadId, b.filename, b.size]
    );
    const count = Math.ceil(b.size / PART_SIZE);
    const urls = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        getSignedUrl(storage, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber: i + 1 }), { expiresIn: 6 * 3600 }))
    );
    return reply.code(201).send({ id: rows[0].id, partSize: PART_SIZE, urls });
  });

  // 2) Assemble les morceaux une fois tous envoyés.
  app.post('/uploads/:id/complete', organizer, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const { parts } = completeSchema.parse(req.body);
    const { rows } = await pool.query(
      `SELECT object_key, s3_upload_id FROM uploads WHERE id = $1 AND organizer_id = $2 AND status = 'pending'`,
      [id, req.user.sub]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Upload introuvable' });
    await storage.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: rows[0].object_key,
      UploadId: rows[0].s3_upload_id,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }));
    await pool.query(`UPDATE uploads SET status = 'completed' WHERE id = $1`, [id]);
    return { id };
  });

  // Annule un upload en cours (échec ou abandon).
  app.delete('/uploads/:id', organizer, async (req, reply) => {
    if (!storage) return off(reply);
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(
      `DELETE FROM uploads WHERE id = $1 AND organizer_id = $2 AND status = 'pending' RETURNING object_key, s3_upload_id`,
      [id, req.user.sub]
    );
    if (rows[0]) {
      await storage.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: rows[0].object_key, UploadId: rows[0].s3_upload_id }))
        .catch(() => {});
    }
    return reply.code(204).send();
  });
}
