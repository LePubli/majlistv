// Playlists HLS protégées : le jeton de lecture est délivré par GET /talks/:id après contrôle d'accès.
import { z } from 'zod';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { getNumber } from '../settings.js';
import { storage, presignGet } from '../storage.js';
import { playbackLevel } from '../playback.js';
import { HLS_PATH, rewriteMaster, rewriteVariant, truncateVariant, prefixOf, versionOf } from '../hls.js';
import { pool } from '../db.js';

export default async function hlsRoutes(app) {
  app.get('/hls/:id/*', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const path = req.params['*'];
    const token = req.query.t;
    if (!HLS_PATH.test(path)) return reply.code(404).send({ error: 'Introuvable' });
    const level = playbackLevel(id, token); // 'full' | 'preview' | null
    if (!storage || !level) return reply.code(403).send({ error: 'Accès refusé' });

    // Dossier de la version : celle demandée par le lien (v, posé dans le master), sinon la version publiée (étape E4b).
    let prefix;
    if (typeof req.query.v === 'string') prefix = prefixOf(id, req.query.v);
    if (!prefix) prefix = (await pool.query('SELECT media_prefix FROM talks WHERE id = $1', [id])).rows[0]?.media_prefix || `hls/${id}/`;
    let text;
    try {
      const obj = await storage.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: `${prefix}${path}` }));
      text = await obj.Body.transformToString();
    } catch {
      return reply.code(404).send({ error: 'Introuvable' });
    }
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const body = path === 'master.m3u8'
      ? rewriteMaster(text, token, versionOf(id, prefix))
      : await rewriteVariant(level === 'preview' ? truncateVariant(text, await getNumber('preview_seconds')) : text, (rel) => presignGet(`${prefix}${dir}${rel}`));
    // CORS ouvert : le récepteur Chromecast du téléviseur lit lui-même ces playlists depuis un autre domaine (22b-10). Aucun cookie, l'accès est porté par le jeton dans l'adresse.
    return reply.header('content-type', 'application/vnd.apple.mpegurl').header('cache-control', 'private, no-store').header('access-control-allow-origin', '*').send(body);
  });
}
