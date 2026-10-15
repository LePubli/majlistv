// Étape 21 — Suivre un intervenant, préférences d'e-mails, désinscription en un clic.
//   GET  /me/notifications              mes réglages + intervenants suivis
//   PUT  /me/notifications              { speakers?, weekly? }
//   PUT/DELETE /speakers/:slug/follow   suivre / ne plus suivre
//   GET/POST /unsubscribe/:token        désinscription (sans compte ni connexion : le jeton signé suffit)
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting, isOn } from '../settings.js';
import { publicSpeakers } from '../speakers.js';
import { CATEGORIES, parseUnsubToken } from '../unsubscribe.js';

export const MAX_FOLLOWS = 100;
const slugParam = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) });

export default async function notificationsRoutes(app) {
  app.get('/me/notifications', { preHandler: app.authenticate }, async (req) => {
    const u = (await pool.query('SELECT notify_speakers, notify_weekly FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const follows = (await pool.query(
      'SELECT speaker_slug AS slug, speaker_name AS name, created_at AS "createdAt" FROM speaker_follows WHERE user_id = $1 ORDER BY speaker_name', [req.user.sub])).rows;
    return {
      prefs: { speakers: u.notify_speakers, weekly: u.notify_weekly },
      available: { speakers: isOn(await getSetting('notify_speakers_enabled')), weekly: isOn(await getSetting('weekly_enabled')) },
      follows, maxFollows: MAX_FOLLOWS,
    };
  });

  app.put('/me/notifications', { preHandler: app.authenticate }, async (req) => {
    const b = z.object({ speakers: z.boolean().optional(), weekly: z.boolean().optional() }).parse(req.body ?? {});
    const { rows } = await pool.query(
      `UPDATE users SET notify_speakers = COALESCE($2, notify_speakers), notify_weekly = COALESCE($3, notify_weekly) WHERE id = $1
       RETURNING notify_speakers AS speakers, notify_weekly AS weekly`, [req.user.sub, b.speakers ?? null, b.weekly ?? null]);
    return rows[0];
  });

  app.put('/speakers/:slug/follow', { preHandler: app.authenticate }, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const sp = (await publicSpeakers()).find((x) => x.slug === slug);
    if (!sp) return reply.code(404).send({ error: 'Intervenant introuvable' });
    const n = (await pool.query('SELECT count(*)::int AS n FROM speaker_follows WHERE user_id = $1 AND speaker_slug <> $2', [req.user.sub, slug])).rows[0].n;
    if (n >= MAX_FOLLOWS) return reply.code(409).send({ error: `Vous suivez déjà ${MAX_FOLLOWS} intervenants` });
    await pool.query(
      `INSERT INTO speaker_follows(user_id, speaker_slug, speaker_name) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, speaker_slug) DO UPDATE SET speaker_name = EXCLUDED.speaker_name`, [req.user.sub, slug, sp.name]);
    return { slug, name: sp.name, following: true };
  });

  app.delete('/speakers/:slug/follow', { preHandler: app.authenticate }, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    await pool.query('DELETE FROM speaker_follows WHERE user_id = $1 AND speaker_slug = $2', [req.user.sub, slug]);
    return reply.code(204).send();
  });

  // --- Désinscription : plugin à part car le bouton « Se désabonner » des messageries envoie un formulaire (RFC 8058).
  await app.register(async (u) => {
    u.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => done(null, {}));
    const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
    // Lecture seule : les logiciels de sécurité qui « visitent » les liens ne désinscrivent personne par erreur.
    u.get('/unsubscribe/:token', limit, async (req, reply) => {
      const t = parseUnsubToken(req.params.token);
      if (!t) return reply.code(404).send({ error: 'Lien invalide' });
      const row = (await pool.query(`SELECT ${CATEGORIES[t.cat]} AS on FROM users WHERE id = $1`, [t.userId])).rows[0];
      if (!row) return reply.code(404).send({ error: 'Lien invalide' });
      reply.header('cache-control', 'no-store');
      return { category: t.cat, subscribed: row.on };
    });
    u.post('/unsubscribe/:token', limit, async (req, reply) => {
      const t = parseUnsubToken(req.params.token);
      if (!t) return reply.code(404).send({ error: 'Lien invalide' });
      const r = await pool.query(`UPDATE users SET ${CATEGORIES[t.cat]} = false WHERE id = $1`, [t.userId]);
      if (!r.rowCount) return reply.code(404).send({ error: 'Lien invalide' });
      reply.header('cache-control', 'no-store');
      return { category: t.cat, subscribed: false };
    });
  });
}
