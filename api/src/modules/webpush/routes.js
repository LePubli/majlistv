// Notifications dans le navigateur (Web Push).
//   GET    /web-push/key        clé publique VAPID du site (le navigateur en a besoin pour s'abonner)
//   GET    /me/web-push         { subscribed: n } nombre de navigateurs abonnés pour ce compte
//   POST   /me/web-push         enregistrer l'abonnement du navigateur : { endpoint, keys: { p256dh, auth }, locale }
//   DELETE /me/web-push         retirer un navigateur : { endpoint }
//   POST   /me/web-push/test    envoie une notification d'essai aux navigateurs du compte
// Les envois eux-mêmes sont faits par push.js (pushToUser) avec les mêmes textes que l'application.
import { z } from 'zod';
import { pool } from '../../db.js';
import { parseSubscription } from '../../webPushLib.js';
import { vapidKeys, webPushToUser } from '../../webPush.js';

const MAX_PER_USER = 10;
const TEST_TEXT = {
  fr: { title: 'Mejliss TV', body: 'Test réussi : les notifications fonctionnent sur cet appareil.' },
  en: { title: 'Mejliss TV', body: 'Success: notifications work on this device.' },
  ar: { title: 'Mejliss TV', body: 'نجح الاختبار: الإشعارات تعمل على هذا الجهاز.' },
};

export default async function webPushRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/web-push/key', auth, async (req, reply) => {
    const k = await vapidKeys();
    if (!k) return reply.code(503).send({ error: 'Notifications indisponibles sur ce serveur', code: 'webpush_unavailable' });
    return { publicKey: k.publicKey };
  });

  app.get('/me/web-push', auth, async (req) => {
    const n = (await pool.query('SELECT count(*)::int AS n FROM web_push_subscriptions WHERE user_id = $1', [req.user.sub])).rows[0].n;
    return { subscribed: n };
  });

  app.post('/me/web-push', { preHandler: app.authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const r = parseSubscription(req.body);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    const { endpoint, p256dh, auth: authKey, locale } = r.sub;
    const uid = req.user.sub;
    const n = (await pool.query('SELECT count(*)::int AS n FROM web_push_subscriptions WHERE user_id = $1 AND endpoint <> $2', [uid, endpoint])).rows[0].n;
    if (n >= MAX_PER_USER) {
      await pool.query('DELETE FROM web_push_subscriptions WHERE id = (SELECT id FROM web_push_subscriptions WHERE user_id = $1 ORDER BY last_seen LIMIT 1)', [uid]);
    }
    // Un navigateur partagé : l'abonnement passe au dernier compte connecté.
    await pool.query(
      `INSERT INTO web_push_subscriptions(user_id, endpoint, p256dh, auth, locale) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, locale = EXCLUDED.locale, last_seen = now()`,
      [uid, endpoint, p256dh, authKey, locale]);
    return { ok: true };
  });

  app.delete('/me/web-push', auth, async (req, reply) => {
    const b = z.object({ endpoint: z.string().trim().min(10).max(2048) }).parse(req.body ?? {});
    await pool.query('DELETE FROM web_push_subscriptions WHERE endpoint = $1 AND user_id = $2', [b.endpoint, req.user.sub]);
    return reply.code(204).send();
  });

  app.post('/me/web-push/test', { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const sent = await webPushToUser(req.user.sub, (loc) => TEST_TEXT[loc] || TEST_TEXT.fr, '/account?tab=emails', 'test', req.log);
    if (!sent) return reply.code(409).send({ error: "Aucune notification n'a pu être envoyée : réactivez-les sur cet appareil", code: 'webpush_none' });
    return { sent };
  });
}
