// Étape S3 — Studio : tableau de bord (maquette « Studio v2 », écran 1) et état de production de Studio → Contenus (écran 2).
// Le socle ne lit pas les tables des modules : chaque module ajoute ses chiffres par événement
//   studio.overview   (out, { organizerId, days, talkId, isAdmin }) : stats, doublage, chaînes, stockage
//   studio.production (out, { ids })                                 : vues et doublage par conférence
// Sans le module, sa partie est simplement absente (le site web n'affiche pas le bloc).
import { z } from 'zod';
import { pool } from '../db.js';
import { visibleSql } from '../visibility.js';
import * as ext from '../ext.js';
import { listTasks } from './activity.js';

export default async function overviewRoutes(app) {
  const viewer = { preHandler: app.requireRole('organizer', 'admin') };

  app.get('/studio/overview', viewer, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(28) }).parse(req.query ?? {});
    const organizerId = req.user.sub;
    const isAdmin = req.user.role === 'admin';
    // Dernière conférence publiée, visible et lisible (vidéo convertie) de la personne.
    const last = (await pool.query(
      `SELECT t.id, t.title, t.source, t.duration_seconds AS "durationSeconds", COALESCE(t.publish_at, t.created_at) AS "publishedAt"
         FROM talks t WHERE t.organizer_id = $1 AND t.publication = 'published' AND ${visibleSql('t')} AND (t.source <> 'upload' OR t.video_status = 'ready')
        ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT 1`, [organizerId])).rows[0] || null;
    const out = { days, last, channel: null, stats: null, dubbing: null, storage: null };
    await ext.emit('studio.overview', out, { organizerId, days, talkId: last?.id || null, isAdmin });
    // Production en cours : les tâches qui tournent ou attendent (toutes pour l'administrateur, les siennes sinon).
    const tasks = await listTasks(isAdmin ? null : organizerId);
    out.production = tasks.filter((t) => ['running', 'waiting', 'paused', 'blocked'].includes(t.status)).slice(0, 5);
    out.productionCount = tasks.filter((t) => ['running', 'waiting', 'paused', 'blocked'].includes(t.status)).length;
    out.failedTasks = tasks.filter((t) => t.status === 'failed').length;
    return out;
  });

  // Vues et état du doublage de mes conférences (colonnes « Production » et « Vues » de Studio → Contenus).
  app.get('/studio/production', viewer, async (req) => {
    const ids = (await pool.query('SELECT id FROM talks WHERE organizer_id = $1', [req.user.sub])).rows.map((r) => r.id);
    const out = Object.fromEntries(ids.map((id) => [id, {}]));
    if (ids.length) await ext.emit('studio.production', out, { ids });
    return { talks: out };
  });
}
