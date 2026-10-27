// Étape 29 — Santé du serveur (administrateur uniquement).
//   GET  /admin/health             état du disque, de la mémoire, de la charge, historique 7 jours, base de données, alertes
//   POST /admin/health/check       mesure immédiate (enregistre un échantillon, envoie une alerte si un seuil est franchi)
//   POST /admin/health/test-alert  envoie un e-mail d'essai « alerte » aux destinataires
import { report, runCheck, recipients } from '../health.js';
import { enqueueEmail, smtpConf } from '../mailer.js';
import { pool } from '../db.js';

export default async function healthRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/admin/health', adminOnly, async () => report());

  app.post('/admin/health/check', adminOnly, async () => {
    await runCheck();
    return report();
  });

  app.post('/admin/health/test-alert', adminOnly, async (req, reply) => {
    if (!(await smtpConf())) return reply.code(400).send({ error: "L'envoi d'e-mails n'est pas configuré (Admin → Paramètres → E-mails)." });
    const to = await recipients();
    if (!to.length) return reply.code(400).send({ error: 'Aucun destinataire.' });
        const slot = Date.now();
    for (const addr of to) {
      await enqueueEmail(pool, { to: addr, locale: 'fr', kind: 'health_alert', vars: { title: '[Essai] Alerte de santé du serveur', summary: "Ceci est un essai : les alertes e-mail de la santé du serveur fonctionnent. Aucune action n'est nécessaire.", advice: '', path: '/admin?tab=health' }, dedupeKey: `health:test:${slot}:${addr}` });
    }
    return { ok: true, sent: to.length };
  });
}
