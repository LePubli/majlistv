// Module « Doublage français » — côté spectateurs (étape D2) : version française d'une conférence et demandes des abonnés.
//   GET    /talks/:id/dub?t=<jeton de lecture>   état + liens temporaires des pistes (lecture complète seulement)
//   POST   /talks/:id/dub/request                 « Demander la version française » (abonnés ; administrateurs pour essayer)
//   DELETE /talks/:id/dub/request                 retirer sa demande
import { z } from 'zod';
import { pool } from '../../db.js';
import { storage, presignGet } from '../../storage.js';
import { playbackLevel } from '../../playback.js';
import { hasActiveSubscription } from '../../access.js';
import { visibleSql } from '../../visibility.js';

const idSchema = z.object({ id: z.string().uuid() });

export default async function publicRoutes(app) {
  async function visibleTalk(id) {
    return (await pool.query(`SELECT t.id, t.source FROM talks t WHERE t.id = $1 AND ${visibleSql('t')}`, [id])).rows[0] || null;
  }
  async function canRequest(user) {
    if (!user) return false;
    return user.role === 'admin' || (await hasActiveSubscription(user.sub));
  }
  async function counts(id, user) {
    const n = (await pool.query('SELECT count(*)::int AS n FROM dub_requests WHERE talk_id = $1', [id])).rows[0].n;
    const mine = user ? (await pool.query('SELECT 1 FROM dub_requests WHERE talk_id = $1 AND user_id = $2', [id, user.sub])).rowCount > 0 : false;
    return { requests: n, requested: mine };
  }

  app.get('/talks/:id/dub', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { t } = z.object({ t: z.string().max(200).optional() }).parse(req.query ?? {});
    const talk = await visibleTalk(id);
    if (!talk) return reply.code(404).send({ error: 'Conférence introuvable' });
    const user = await app.optionalUser(req);
    const tr = (await pool.query(
      `SELECT tr.mix_key, tr.voice_key, tr.duration_s::float AS "durationS", tr.created_at AS "createdAt", j.params->>'duck' AS duck
       FROM dub_tracks tr LEFT JOIN dub_jobs j ON j.id = tr.job_id WHERE tr.talk_id = $1`, [id])).rows[0];
    const base = { ...(await counts(id, user)), canRequest: await canRequest(user), signedIn: Boolean(user) };
    if (!tr) return { available: false, ...base };
    const level = playbackLevel(id, t);
    // Lecture complète seulement : un aperçu (non abonné sur une conférence premium) n'obtient pas la piste entière.
    const urls = level === 'full' && storage
      ? { mix: tr.mix_key ? await presignGet(tr.mix_key) : null, voice: await presignGet(tr.voice_key) }
      : null;
    return {
      available: true, level: level || 'none', urls, hasMix: Boolean(tr.mix_key), durationS: tr.durationS, createdAt: tr.createdAt,
      duck: Math.min(100, Math.max(0, Number(tr.duck ?? 15))), ...base,
    };
  });

  app.post('/talks/:id/dub/request', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await visibleTalk(id))) return reply.code(404).send({ error: 'Conférence introuvable' });
    const user = await app.optionalUser(req);
    if (!(await canRequest(user))) return reply.code(403).send({ error: 'Réservé aux abonnés', code: 'subscribers_only' });
    if ((await pool.query('SELECT 1 FROM dub_tracks WHERE talk_id = $1', [id])).rowCount) return reply.code(409).send({ error: 'La version française existe déjà', code: 'available' });
    await pool.query('INSERT INTO dub_requests(talk_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user.sub]);
    return counts(id, user);
  });

  app.delete('/talks/:id/dub/request', { preHandler: app.authenticate }, async (req) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM dub_requests WHERE talk_id = $1 AND user_id = $2', [id, req.user.sub]);
    return counts(id, { sub: req.user.sub });
  });
}

// Prévient par e-mail les membres qui avaient demandé la version française, une fois qu'elle existe (toutes les 2 minutes).
export async function notifyReady(enqueueForUser, log = console) {
  const { rows } = await pool.query(
    `SELECT r.talk_id, r.user_id, t.title FROM dub_requests r
       JOIN dub_tracks tr ON tr.talk_id = r.talk_id JOIN talks t ON t.id = r.talk_id
     WHERE r.notified_at IS NULL ORDER BY r.created_at LIMIT 200`);
  for (const r of rows) {
    try {
      await enqueueForUser(pool, r.user_id, 'dub_ready', { title: r.title, path: `/talks/${r.talk_id}` }, `dub_ready:${r.talk_id}:${r.user_id}`);
      await pool.query('UPDATE dub_requests SET notified_at = now() WHERE talk_id = $1 AND user_id = $2', [r.talk_id, r.user_id]);
    } catch (err) { log.warn?.(`Doublage : e-mail « version française prête » impossible : ${err.message}`); }
  }
  return rows.length;
}
