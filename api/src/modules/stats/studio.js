// Module « Statistiques d'audience » — chiffres pour le Studio (étape S3) : tableau de bord et colonne « Vues » des contenus.
import { pool } from '../../db.js';

const num = (v) => Number(v) || 0;
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((100 * a) / b)) : null);

// Période en cours et période précédente (même durée), pour les conférences de la personne ; plus la dernière conférence publiée.
export async function overview(out, { organizerId, days, talkId }) {
  const per = async (from, to) => (await pool.query(
    `SELECT COALESCE(sum(d.views), 0)::int AS views, COALESCE(sum(d.plays), 0)::int AS plays, COALESCE(sum(d.seconds), 0)::bigint AS seconds
       FROM stat_talk_daily d JOIN talks t ON t.id = d.talk_id
      WHERE d.audience = 'web' AND t.organizer_id = $1 AND d.day > (now() AT TIME ZONE 'utc')::date - $2::int AND d.day <= (now() AT TIME ZONE 'utc')::date - $3::int`,
    [organizerId, from, to])).rows[0];
  const cur = await per(days, 0);
  const prev = await per(days * 2, days);
  out.stats = { views: cur.views, prevViews: prev.views, plays: cur.plays, minutes: Math.round(num(cur.seconds) / 60),
    viewsChangePct: prev.views > 0 ? Math.round(((cur.views - prev.views) / prev.views) * 100) : null };
  if (talkId) {
    // Depuis la publication : toutes les données gardées de cette conférence.
    const t = (await pool.query(
      `SELECT COALESCE(sum(d.views), 0)::int AS views, COALESCE(sum(d.plays), 0)::int AS plays, COALESCE(sum(d.seconds), 0)::bigint AS seconds, max(t.duration_seconds) AS dur
         FROM stat_talk_daily d JOIN talks t ON t.id = d.talk_id WHERE d.audience = 'web' AND d.talk_id = $1`, [talkId])).rows[0];
    out.stats.last = { views: t.views, avgWatchPct: t.dur > 0 && t.plays > 0 ? pct(num(t.seconds), t.plays * t.dur) : null };
  }
}

// Vues de chaque conférence (toutes périodes).
export async function production(out, { ids }) {
  const { rows } = await pool.query(
    `SELECT talk_id AS id, sum(views)::int AS views FROM stat_talk_daily WHERE audience = 'web' AND talk_id = ANY($1::uuid[]) GROUP BY talk_id`, [ids]);
  for (const r of rows) if (out[r.id]) out[r.id].views = r.views;
  for (const id of ids) if (out[id] && out[id].views === undefined) out[id].views = 0;
}
