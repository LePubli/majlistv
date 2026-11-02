// Amélioration 2.5 — « À regarder plus tard » (membre connecté, gratuit).
//   GET    /me/watchlater          conférences gardées pour plus tard (les plus récentes d'abord) ; les terminées en sortent
//   GET    /me/watchlater/ids      identifiants seuls (état des boutons sur les vignettes)
//   PUT    /me/watchlater/:id      ajouter (au plus MAX_ITEMS)
//   DELETE /me/watchlater/:id      retirer
import { z } from 'zod';
import { pool } from '../../db.js';
import { visibleSql } from '../../visibility.js';
import { CARD, cards } from '../../talkCards.js';

export const MAX_ITEMS = 200;
const idSchema = z.object({ id: z.string().uuid() });

// Une conférence regardée jusqu'au bout n'a plus sa place dans « plus tard ».
async function dropFinished(userId) {
  await pool.query(
    `DELETE FROM watch_later w USING watch_progress p
      WHERE w.user_id = $1 AND p.user_id = w.user_id AND p.talk_id = w.talk_id AND p.completed AND p.updated_at >= w.added_at`, [userId]);
}

export default async function watchLaterRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/me/watchlater', auth, async (req) => {
    await dropFinished(req.user.sub);
    const { rows } = await pool.query(
      `SELECT ${CARD}, w.added_at AS "addedAt",
              (SELECT p.position_ms FROM watch_progress p WHERE p.user_id = w.user_id AND p.talk_id = t.id) AS "positionMs"
         FROM watch_later w JOIN talks t ON t.id = w.talk_id LEFT JOIN category_names c ON c.id = t.category_id
        WHERE w.user_id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}
        ORDER BY w.added_at DESC LIMIT ${MAX_ITEMS}`, [req.user.sub]);
    return cards(rows);
  });

  app.get('/me/watchlater/ids', auth, async (req) => {
    await dropFinished(req.user.sub);
    return (await pool.query('SELECT talk_id FROM watch_later WHERE user_id = $1 ORDER BY added_at DESC', [req.user.sub])).rows.map((r) => r.talk_id);
  });

  app.put('/me/watchlater/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const ok = await pool.query(`SELECT 1 FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [id]);
    if (!ok.rowCount) return reply.code(404).send({ error: 'Conférence introuvable' });
    const n = (await pool.query('SELECT count(*)::int AS n FROM watch_later WHERE user_id = $1', [req.user.sub])).rows[0].n;
    const has = (await pool.query('SELECT 1 FROM watch_later WHERE user_id = $1 AND talk_id = $2', [req.user.sub, id])).rowCount;
    if (!has && n >= MAX_ITEMS) return reply.code(409).send({ error: `Votre liste « À regarder plus tard » est pleine (${MAX_ITEMS}). Retirez-en une conférence.`, code: 'full' });
    await pool.query('INSERT INTO watch_later(user_id, talk_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.sub, id]);
    return { saved: true };
  });

  app.delete('/me/watchlater/:id', auth, async (req) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM watch_later WHERE user_id = $1 AND talk_id = $2', [req.user.sub, id]);
    return { saved: false };
  });
}
