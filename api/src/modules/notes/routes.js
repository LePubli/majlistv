// Marque-pages et notes personnelles (étape 17b). Strictement privés : chaque requête est filtrée par l'utilisateur connecté.
//   GET    /talks/:id/notes      notes de l'utilisateur sur cette conférence (par ordre de position)
//   POST   /talks/:id/notes      { positionMs, body? }  crée un marque-page (body vide) ou une note
//   PATCH  /me/notes/:id         { body }                modifie le texte
//   DELETE /me/notes/:id         supprime
//   GET    /me/notes             toutes les notes, regroupées par conférence (Ma bibliothèque)
import { z } from 'zod';
import { pool } from '../../db.js';

const MAX_PER_TALK = 300;
const idSchema = z.object({ id: z.string().uuid() });
const createSchema = z.object({
  positionMs: z.number().int().min(0).max(86_400_000),
  body: z.string().trim().max(2000).default(''),
});
const patchSchema = z.object({ body: z.string().trim().max(2000) });
const FIELDS = 'id, talk_id AS "talkId", position_ms AS "positionMs", body, created_at AS "createdAt", updated_at AS "updatedAt"';

export default async function notesRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/talks/:id/notes', auth, async (req) => {
    const { id } = idSchema.parse(req.params);
    return (await pool.query(`SELECT ${FIELDS} FROM talk_notes WHERE user_id = $1 AND talk_id = $2 ORDER BY position_ms, created_at`, [req.user.sub, id])).rows;
  });

  app.post('/talks/:id/notes', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const data = createSchema.parse(req.body);
    const talk = await pool.query('SELECT 1 FROM talks WHERE id = $1', [id]);
    if (!talk.rowCount) return reply.code(404).send({ error: 'Conférence introuvable' });
    const n = (await pool.query('SELECT count(*)::int AS n FROM talk_notes WHERE user_id = $1 AND talk_id = $2', [req.user.sub, id])).rows[0].n;
    if (n >= MAX_PER_TALK) return reply.code(409).send({ error: `Limite de ${MAX_PER_TALK} notes par conférence atteinte` });
    // Même seconde, déjà un marque-page vide : on le réutilise au lieu d'en empiler.
    if (!data.body) {
      const dup = await pool.query(`SELECT ${FIELDS} FROM talk_notes WHERE user_id = $1 AND talk_id = $2 AND body = '' AND abs(position_ms - $3) < 1500 LIMIT 1`, [req.user.sub, id, data.positionMs]);
      if (dup.rowCount) return dup.rows[0];
    }
    const { rows } = await pool.query(
      `INSERT INTO talk_notes(user_id, talk_id, position_ms, body) VALUES ($1, $2, $3, $4) RETURNING ${FIELDS}`,
      [req.user.sub, id, data.positionMs, data.body]);
    return reply.code(201).send(rows[0]);
  });

  app.patch('/me/notes/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { body } = patchSchema.parse(req.body);
    const { rows } = await pool.query(`UPDATE talk_notes SET body = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${FIELDS}`, [id, req.user.sub, body]);
    return rows[0] || reply.code(404).send({ error: 'Note introuvable' });
  });

  app.delete('/me/notes/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM talk_notes WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    return r.rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Note introuvable' });
  });

  // Ma bibliothèque : conférences avec leurs notes (les plus récemment modifiées d'abord).
  app.get('/me/notes', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT n.id, n.talk_id AS "talkId", n.position_ms AS "positionMs", n.body, n.updated_at AS "updatedAt", t.title, t.slug
       FROM talk_notes n JOIN talks t ON t.id = n.talk_id
       WHERE n.user_id = $1 ORDER BY n.updated_at DESC LIMIT 1000`, [req.user.sub]);
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.talkId)) groups.set(r.talkId, { talkId: r.talkId, title: r.title, slug: r.slug, updatedAt: r.updatedAt, notes: [] });
      groups.get(r.talkId).notes.push({ id: r.id, positionMs: r.positionMs, body: r.body });
    }
    const out = [...groups.values()];
    out.forEach((g) => g.notes.sort((a, b) => a.positionMs - b.positionMs));
    return out;
  });
}
