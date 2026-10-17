// Module « Chaînes » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « channels » (Admin → Fonctions).
import routes from './routes.js';
import { startChannelSync } from '../../channels.js';

import { pool } from '../../db.js';

export default async function register(app, ctx) {
  // Étape S3 : abonnés de mes chaînes pour le tableau de bord du Studio (et nouveaux abonnés des 7 derniers jours).
  ctx.on('studio.overview', async (out, { organizerId }) => {
    const r = (await pool.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE f.created_at > now() - interval '7 days')::int AS week
         FROM speaker_follows f JOIN speakers c ON c.slug = f.speaker_slug WHERE c.owner_id = $1`, [organizerId])).rows[0];
    const owns = (await pool.query('SELECT count(*)::int AS n FROM speakers WHERE owner_id = $1', [organizerId])).rows[0].n;
    out.channel = { channels: owns, followers: r.n, followersWeek: r.week };
  });
  await app.register(routes);
}

// Chaînes manquantes créées à partir des conférences.
export async function start(app) { startChannelSync(app.log); }
