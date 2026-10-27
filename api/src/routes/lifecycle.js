// Étape 33 — E-mails de cycle de vie (administrateur uniquement).
//   GET  /admin/lifecycle           réglages, aperçu (combien d'e-mails partiraient, sans rien envoyer), envois des 14 derniers jours
//   POST /admin/lifecycle/run       lance un passage maintenant (mêmes garde-fous : interrupteur, plage horaire, plafond, délai minimum)
//   POST /admin/lifecycle/test      { kind } envoie un exemple du modèle à l'adresse de l'administrateur connecté (ne touche pas au journal)
import { z } from 'zod';
import { preview, runLifecycle } from '../lifecycle.js';
import { KINDS } from '../lifecycleLib.js';
import { enqueueEmail, smtpConf } from '../mailer.js';
import { pool } from '../db.js';

export default async function lifecycleRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/admin/lifecycle', adminOnly, async () => preview());

  app.post('/admin/lifecycle/run', adminOnly, async (req) => ({ queued: await runLifecycle(req.log) }));

  app.post('/admin/lifecycle/test', adminOnly, async (req, reply) => {
    const { kind } = z.object({ kind: z.enum(KINDS) }).parse(req.body ?? {});
    if (!(await smtpConf())) return reply.code(400).send({ error: "L'envoi d'e-mails n'est pas configuré (Admin → Paramètres → E-mails)." });
    const u = (await pool.query('SELECT id, email, name, locale FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const sample = kind === 'resume_talk'
      ? { title: 'Exemple de conférence', speaker: 'Intervenant', minutes: '12', path: '/' }
      : { titles: '• Première conférence — Intervenant\n• Deuxième conférence — Intervenant\n• Troisième conférence — Intervenant', path: '/' };
    await enqueueEmail(pool, { userId: u.id, to: u.email, locale: u.locale, kind, vars: { name: u.name, ...sample }, dedupeKey: `lc:test:${kind}:${u.id}:${Date.now()}` });
    return { ok: true, to: u.email };
  });
}
