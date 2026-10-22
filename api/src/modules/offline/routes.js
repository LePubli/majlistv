// Étape 22b-6 — Hors connexion (application Android).
//   GET  /me/offline/:id/options   ce qui peut être téléchargé pour cette conférence (audio, qualités vidéo, tailles estimées)
//   POST /me/offline/:id           { kind: 'audio'|'video', height?: 360|720, retry?: true } → 202 « preparing » (à rappeler), 200 « ready » + lien signé, taille, empreinte, fin de validité, ou 502 « failed » + message (retry: true relance)
//   POST /me/offline/renew         { talkIds: [...] } → pour chacune : toujours autorisée ? nouvelle fin de validité
//   POST /me/offline/:id/done      { kind, height? } → l'application a bien reçu le fichier : le serveur l'efface dans quelques minutes
//   GET  /me/offline/:id/pack      résumé, chapitres, transcription, quiz (avec réponses) pour la lecture hors connexion
// Droit : abonnement en cours (ou accès offert), propriétaire/modérateur/administrateur. Une conférence en accès libre n'est PAS téléchargeable sans abonnement.
// Les fichiers préparés sont temporaires sur le serveur (ménage automatique) : ils s'accumulent sur le téléphone, pas dans le stockage.
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
import { enqueue, isRunning, sweep, FILE_TTL_MIN, DONE_GRACE_MIN } from './prepare.js';
import { issueLicense } from './license.js';
import { buildPack } from './pack.js';

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
  const allowed = owner || await hasActiveSubscription(user.sub);   // abonnés seulement, même pour une conférence en accès libre
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
    void sweep(req.log);
    if (row.status === 'preparing') {
      if (!isRunning(row.id)) void enqueue(row, req.log);
      return reply.code(202).send({ status: 'preparing' });
    }
    // Fichier prêt : lien signé court (1 h), l'application le télécharge tout de suite. Le fichier reste sur le serveur le temps du ménage (FILE_TTL_MIN).
    await pool.query('UPDATE offline_files SET updated_at = now() WHERE id = $1', [row.id]);
    const now = Date.now();
    const until = expiresAt(now, await getNumber('mod_offline_valid_days'));
    const lic = await issueLicense({ userId: req.user.sub, talkId: id, kind: row.kind, height: row.height, sha256: row.sha256, now, expiresAt: until });
    return {
      status: 'ready', kind: row.kind, height: row.height, size: Number(row.size), sha256: row.sha256,
      url: await presignGet(row.object_key, { download: row.kind === 'audio' ? 'conference.m4a' : 'conference.mp4' }),
      version: versionOf(id, t.prefix) || '0',
      expiresAt: until, serverTime: new Date(now).toISOString(), licence: lic.licence, publicKey: lic.publicKey,
    };
  });

  // Échec d'une préparation : l'application l'apprend en rappelant POST (status « failed » + message), puis peut réessayer.
  app.get('/me/offline/:id/status', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ kind: z.enum(OFFLINE_KIND), height: z.coerce.number().int().default(0) }).parse(req.query ?? {});
    const row = (await pool.query(`SELECT status, error FROM offline_files WHERE talk_id = $1 AND kind = $2 AND height = $3 ORDER BY updated_at DESC LIMIT 1`, [id, q.kind, q.kind === 'audio' ? 0 : q.height])).rows[0];
    return { status: row?.status ?? 'none', error: row?.status === 'failed' ? row.error : null };
  });

  // L'application a reçu le fichier : il n'a plus besoin de rester sur le serveur (effacé après quelques minutes de grâce).
  app.post('/me/offline/:id/done', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ kind: z.enum(OFFLINE_KIND), height: z.number().int().optional() }).strict().parse(req.body ?? {});
    await pool.query(
      `UPDATE offline_files SET updated_at = LEAST(updated_at, now() - make_interval(mins => $4))
        WHERE talk_id = $1 AND kind = $2 AND height = $3 AND status = 'ready'`,
      [id, b.kind, b.kind === 'audio' ? 0 : (b.height ?? 0), Math.max(1, FILE_TTL_MIN - DONE_GRACE_MIN)]);
    return { ok: true };
  });

  // Pack hors connexion : résumé, chapitres, transcription, quiz.
  app.get('/me/offline/:id/pack', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const c = await check(req.user, id);
    if (!c.talk) return reply.code(c.code).send({ error: c.error, reason: c.reason, code: c.reason });
    return buildPack(id);
  });

  // Renouvellement. Ancienne forme : { talkIds } (sans licence). Forme actuelle : { files: [{ talkId, kind, height, sha256 }] } → une licence neuve par fichier.
  app.post('/me/offline/renew', auth, async (req) => {
    const b = z.object({
      talkIds: z.array(z.string().uuid()).min(1).max(50).optional(),
      files: z.array(z.object({ talkId: z.string().uuid(), kind: z.enum(OFFLINE_KIND), height: z.number().int().min(0).max(4320).default(0), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).min(1).max(100).optional(),
    }).strict().refine((v) => v.talkIds || v.files, { message: 'talkIds ou files requis' }).parse(req.body ?? {});
    const days = await getNumber('mod_offline_valid_days');
    const now = Date.now();
    const until = expiresAt(now, days);
    const items = [];
    const cache = new Map();
    const verdict = async (talkId) => { if (!cache.has(talkId)) cache.set(talkId, await check(req.user, talkId)); return cache.get(talkId); };
    if (b.files) {
      for (const f of b.files) {
        const c = await verdict(f.talkId);
        if (!c.talk) { items.push({ talkId: f.talkId, kind: f.kind, height: f.height, ok: false, reason: c.reason ?? 'gone' }); continue; }
        const lic = await issueLicense({ userId: req.user.sub, talkId: f.talkId, kind: f.kind, height: f.kind === 'audio' ? 0 : f.height, sha256: f.sha256, now, expiresAt: until });
        items.push({ talkId: f.talkId, kind: f.kind, height: f.height, ok: true, expiresAt: until, licence: lic.licence, publicKey: lic.publicKey });
      }
    } else {
      for (const talkId of b.talkIds) {
        const c = await verdict(talkId);
        items.push(c.talk ? { talkId, ok: true, expiresAt: until } : { talkId, ok: false, reason: c.reason ?? 'gone' });
      }
    }
    return { items, serverTime: new Date(now).toISOString() };
  });
}
