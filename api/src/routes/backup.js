// Étape 37 — Rapports de sauvegarde envoyés par le VPS.
//   POST /backup/report   (jeton « Bearer » = réglage backup_report_token) { kind, ok, summary, details }
// Aucune donnée de membre ne passe ici : seulement des comptes (nombre de conférences…) et un court message.
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting } from '../settings.js';
import { tokenOk, bearer } from '../modules/appupdates/lib.js';
import { KINDS, cleanDetails } from '../backupLib.js';
import { runCheck } from '../health.js';

const KEEP = 200; // rapports gardés par type

const body = z.object({
  kind: z.enum(KINDS),
  ok: z.boolean(),
  summary: z.string().max(600).default(''),
  details: z.record(z.any()).optional(),
});

export default async function backupRoutes(app) {
  app.post('/backup/report', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const expected = await getSetting('backup_report_token');
    if (!expected) return reply.code(503).send({ error: 'Suivi des sauvegardes non configuré (Admin → Paramètres → Santé du serveur).' });
    if (!tokenOk(bearer(req.headers.authorization), expected)) return reply.code(401).send({ error: 'Jeton invalide' });
    const b = body.parse(req.body ?? {});
    await pool.query('INSERT INTO backup_reports(kind, ok, summary, details) VALUES ($1, $2, $3, $4)', [b.kind, b.ok, b.summary.replace(/[\r\n]+/g, ' ').trim(), JSON.stringify(cleanDetails(b.details))]);
    await pool.query('DELETE FROM backup_reports WHERE kind = $1 AND id NOT IN (SELECT id FROM backup_reports WHERE kind = $1 ORDER BY id DESC LIMIT $2)', [b.kind, KEEP]);
    // Évalue tout de suite : un échec rapporté déclenche l'alerte sans attendre la prochaine mesure (10 min).
    runCheck().catch(() => {});
    return { ok: true };
  });
}
