// Playlists HLS protégées : le jeton de lecture est délivré par GET /talks/:id après contrôle d'accès.
import { z } from 'zod';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { storage, presignGet } from '../storage.js';
import { playbackLevel } from '../playback.js';
import { HLS_PATH, rewriteMaster, rewriteVariant, truncateVariant } from '../hls.js';

export default async function hlsRoutes(app) {
  app.get('/hls/:id/*', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const path = req.params['*'];
    const token = req.query.t;
    if (!HLS_PATH.test(path)) return reply.code(404).send({ error: 'Introuvable' });
    const level = playbackLevel(id, token); // 'full' | 'preview' | null
    if (!storage || !level) return reply.code(403).send({ error: 'Accès refusé' });

    let text;
    try {
      const obj = await storage.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: `hls/${id}/${path}` }));
      text = await obj.Body.transformToString();
    } catch {
      return reply.code(404).send({ error: 'Introuvable' });
    }
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const body = path === 'master.m3u8'
      ? rewriteMaster(text, token)
      : await rewriteVariant(level === 'preview' ? truncateVariant(text, config.previewSeconds) : text, (rel) => presignGet(`hls/${id}/${dir}${rel}`));
    return reply.header('content-type', 'application/vnd.apple.mpegurl').header('cache-control', 'private, no-store').send(body);
  });
}
