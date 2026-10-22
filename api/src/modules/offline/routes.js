// Étape 22b-6 — Hors connexion (application Android).
//   GET  /me/offline/:id/options   ce qui peut être téléchargé pour cette conférence (audio, qualités vidéo, tailles estimées)
//   POST /me/offline/:id           { kind: 'audio'|'video', height?: 360|720, retry?: true } → 202 « preparing » (à rappeler), 200 « ready » + lien signé, taille, empreinte, fin de validité, ou 502 « failed » + message (retry: true relance)
//   POST /me/offline/renew         { talkIds: [...] } → pour chacune : toujours autorisée ? nouvelle fin de validité
// Droit : abonnement en cours (ou accès offert), propriétaire/modérateur/administrateur ; une conférence en accès libre est téléchargeable par tout compte connecté.
import { z } from 'zod';
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { storage, presignGet } from '../../storage.js';
import { config } from '../../config.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { hasActiveSubscription } from '../../access.js';
import { viaChannel } from '../../channelAccess.js';
import { visibleSql } from '../../visibility.js';
import { versionOf } from '../../hls.js';
import { parseMaster, offeredHeights, estimateBytes, AUDIO_BANDWIDTH, expiresAt, OFFLINE_KIND, OFFLINE_HEIGHTS } from './lib.js';
import { enqueue, isRunning } from './prepare.js';

const idParam = z.object({ id: z.string().uuid() });
const rate = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

/** Conférence téléchargeable par cet utilisateur ? → { talk } ou { code, error } */
async function check(user, talkId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.access, t.source, t.speaker, t.organizer_id, t.video_status, t.audio_status, t.duration_seconds, t.media_prefix, ${visibleSql('t')} AS visible
       FROM talks t WHERE t.id = $1`, [talkId]);
  const t = rows[0];
  if (!t) return { code: 404, error: 'Conférence introuvable' };
  const owner = user.role === 'admin' || user.role === 'moderator' || user.sub === t.organizer_id || await viaChannel(user, t);
  if (!t.visible && !owner) return { code: 404, error: 'Conférence introuvable' };
  if (t.source !== 'upload') return { code: 409, error: "Cette vidéo est lue depuis une autre plateforme : elle n'est pas téléchargeable.", reason: 'external' };
  if (t.video_status !== 'ready') return { code: 409, error: "La vidéo n'est pas encore prête.", reason: 'not_ready' };
  const allowed = t.access === 'free' || owner || await hasActiveSubscription(user.sub);
  if (!allowed) return { code: 403, error: "Le téléchargement est réservé aux abonnés.", reason: 'subscription' };
  return { talk: { ...t, prefix: t.media_prefix || `hls/${t.id}/` } };
}

export default async function offlineRoutes(app) {
  const auth = { preHandler: app.authenticate, ...rate };

  app.get('/me/offline/:id/options', auth, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré' });
    const { id } = idParam.parse(req.params);
    const c = await check(req.user, id);
    if (!c.talk) return reply.code(c.code).send({ error: c.error, reason: c.reason, code: c.reason });
    const t = c.talk;
    let variants = [];
    try {
      const obj = await storage.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: `${t.prefix}master.m3u8` }));
      variants = parseMaster(await obj.Body.transformToString());
    } catch { /* playlist illisible : seulement l'audio, s'il existe */ }
    const secs = Number(t.duration_seconds) || 0;
    return {
      validDays: await getNumber('mod_offline_valid_days'),
      audio: t.audio_status === 'ready' ? { estimatedBytes: estimateBytes(AUDIO_BANDWIDTH, secs) } : null,
      video: offeredHeights(variants).map((v) => ({ height: v.height, estimatedBytes: estimateBytes(v.bandwidth, secs) })),
    };
  });

  app.post('/me/offline/:id', auth, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré' });
    const { id } = idParam.parse(req.params);
    const b = z.object({ kind: z.enum(OFFLINE_KIND), height: z.number().int().optional(), retry: z.boolean().optional() }).strict().parse(req.body ?? {});
    if (b.kind === 'video' && !OFFLINE_HEIGHTS.includes(b.height ?? 0)) return reply.code(400).send({ error: 'Qualité inconnue (360 ou 720)' });
    const c = await check(req.user, id);
    if (!c.talk) return reply.code(c.code).send({ error: c.error, reason: c.reason, code: c.reason });
    const t = c.talk;
    if (b.kind === 'audio' && t.audio_status !== 'ready') return reply.code(409).send({ error: "L'audio seul n'est pas encore prêt pour cette conférence.", reason: 'no_audio', code: 'no_audio' });
    const height = b.kind === 'audio' ? 0 : b.height;
    let row = (await pool.query(
      `INSERT INTO offline_files (talk_id, prefix, kind, height) VALUES ($1, $2, $3, $4)
       ON CONFLICT (talk_id, prefix, kind, height) DO UPDATE SET updated_at = offline_files.updated_at RETURNING *`, [id, t.prefix, b.kind, height])).rows[0];
    if (row.status === 'failed' && !b.retry) return reply.code(502).send({ status: 'failed', error: row.error || 'La préparation a échoué' });
    if (row.status === 'failed') {
      row = (await pool.query(`UPDATE offline_files SET status = 'preparing', error = NULL, updated_at = now() WHERE id = $1 RETURNING *`, [row.id])).rows[0];
    }
    if (row.status === 'preparing') {
      if (!isRunning(row.id)) void enqueue(row, req.log);
      return reply.code(202).send({ status: 'preparing' });
    }
    // Fichier prêt : lien signé court (1 h), l'application le télécharge tout de suite.
    return {
      status: 'ready', kind: row.kind, height: row.height, size: Number(row.size), sha256: row.sha256,
      url: await presignGet(row.object_key, { download: row.kind === 'audio' ? 'conference.m4a' : 'conference.mp4' }),
      version: versionOf(id, t.prefix) || '0',
      expiresAt: expiresAt(Date.now(), await getNumber('mod_offline_valid_days')),
    };
  });

  // Échec d'une préparation : l'application l'apprend en rappelant POST (status « failed » + message), puis peut réessayer.
  app.get('/me/offline/:id/status', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ kind: z.enum(OFFLINE_KIND), height: z.coerce.number().int().default(0) }).parse(req.query ?? {});
    const row = (await pool.query(`SELECT status, error FROM offline_files WHERE talk_id = $1 AND kind = $2 AND height = $3 ORDER BY updated_at DESC LIMIT 1`, [id, q.kind, q.kind === 'audio' ? 0 : q.height])).rows[0];
    return { status: row?.status ?? 'none', error: row?.status === 'failed' ? row.error : null };
  });

  app.post('/me/offline/renew', auth, async (req) => {
    const b = z.object({ talkIds: z.array(z.string().uuid()).min(1).max(50) }).strict().parse(req.body ?? {});
    const days = await getNumber('mod_offline_valid_days');
    const items = [];
    for (const talkId of b.talkIds) {
      const c = await check(req.user, talkId);
      items.push(c.talk ? { talkId, ok: true, expiresAt: expiresAt(Date.now(), days) } : { talkId, ok: false, reason: c.reason ?? 'gone' });
    }
    return { items };
  });
}
