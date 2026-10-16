// Favoris (cœur sur les vignettes) — sortis de routes/library.js à l'étape M2 pour devenir le module « favorites ».
//   GET /me/favorites, PUT /me/favorites/:id, DELETE /me/favorites/:id
import { z } from 'zod';
import { visibleSql } from '../../visibility.js';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';

const idSchema = z.object({ id: z.string().uuid() });
const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, c.name AS category,
  t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, left(regexp_replace(t.description, '\\s+', ' ', 'g'), 170) AS summary`;

async function cards(rows) {
  for (const r of rows) {
    r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
    delete r.poster_key;
    delete r.external_thumb;
    if (r.source === 'upload') delete r.video_ref; // clé de stockage interne
  }
  return rows;
}

export default async function favoritesRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/me/favorites', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT ${CARD}, f.created_at AS "favoritedAt"
       FROM favorites f JOIN talks t ON t.id = f.talk_id LEFT JOIN category_names c ON c.id = t.category_id
       WHERE f.user_id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} ORDER BY f.created_at DESC LIMIT 200`,
      [req.user.sub]
    );
    return cards(rows);
  });

  app.put('/me/favorites/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const talk = await pool.query('SELECT 1 FROM talks WHERE id = $1', [id]);
    if (!talk.rowCount) return reply.code(404).send({ error: 'Conférence introuvable' });
    await pool.query('INSERT INTO favorites(user_id, talk_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.sub, id]);
    return reply.code(204).send();
  });

  app.delete('/me/favorites/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM favorites WHERE user_id = $1 AND talk_id = $2', [req.user.sub, id]);
    return reply.code(204).send();
  });

}
