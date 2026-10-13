// Bibliothèque personnelle : favoris et reprise de lecture ("Continuer à regarder").
import { z } from 'zod';
import { visibleSql } from '../visibility.js';
import { pool } from '../db.js';
import { presignGet } from '../storage.js';
import { episodeLabels, seriesNextUp } from './series.js';
import { getSetting, getNumber, isOn } from '../settings.js';

const idSchema = z.object({ id: z.string().uuid() });
const progressSchema = z.object({
  positionMs: z.number().int().min(0).max(86_400_000),
  durationMs: z.number().int().min(0).max(86_400_000).default(0),
});

// Une conférence est "terminée" quand il reste moins de 5 % (ou 30 s) à lire.
const isCompleted = (pos, dur) => dur > 0 && pos >= Math.min(dur * 0.95, dur - 30_000);
// En dessous de ce seuil, ce n'est pas une vraie reprise (évite "Reprendre à 0:02").
const MIN_RESUME_MS = 5000;

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

export default async function libraryRoutes(app) {
  const auth = { preHandler: app.authenticate };

  // --- Favoris ---
  app.get('/me/favorites', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT ${CARD}, f.created_at AS "favoritedAt"
       FROM favorites f JOIN talks t ON t.id = f.talk_id LEFT JOIN categories c ON c.id = t.category_id
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

  // --- Reprise de lecture ---
  // Enregistre la position (appelé toutes les ~10 s pendant la lecture). Ignoré si la conférence n'existe plus.
  app.put('/me/progress/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { positionMs, durationMs } = progressSchema.parse(req.body);
    const talk = await pool.query('SELECT duration_seconds FROM talks WHERE id = $1', [id]);
    if (!talk.rowCount) return reply.code(404).send({ error: 'Conférence introuvable' });
    // La durée connue du serveur fait foi (le navigateur peut envoyer 0 pendant le chargement).
    const dur = durationMs || Math.round((talk.rows[0].duration_seconds || 0) * 1000);
    const pos = dur ? Math.min(positionMs, dur) : positionMs;
    await pool.query(
      `INSERT INTO watch_progress(user_id, talk_id, position_ms, duration_ms, completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, talk_id) DO UPDATE
         SET position_ms = EXCLUDED.position_ms, duration_ms = EXCLUDED.duration_ms, completed = EXCLUDED.completed, updated_at = now()`,
      [req.user.sub, id, pos, dur, isCompleted(pos, dur)]
    );
    return reply.code(204).send();
  });

  app.delete('/me/progress/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM watch_progress WHERE user_id = $1 AND talk_id = $2', [req.user.sub, id]);
    return reply.code(204).send();
  });

  // "Continuer à regarder" : conférences commencées et non terminées, la plus récente d'abord.
  // Les épisodes de série portent leur place (`series`), et l'épisode qui suit un épisode terminé est proposé (`nextUp`).
  app.get('/me/continue', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT ${CARD}, p.position_ms AS "positionMs", p.duration_ms AS "durationMs", p.updated_at AS "watchedAt"
       FROM watch_progress p JOIN talks t ON t.id = p.talk_id LEFT JOIN categories c ON c.id = t.category_id
       WHERE p.user_id = $1 AND NOT p.completed AND p.position_ms >= $2 AND t.video_status = 'ready' AND ${visibleSql('t')}
       ORDER BY p.updated_at DESC LIMIT 12`,
      [req.user.sub, MIN_RESUME_MS]
    );
    const nexts = await seriesNextUp(req.user.sub, MIN_RESUME_MS);
    if (nexts.length) {
      const have = new Set(rows.map((r) => r.id));
      const ids = nexts.map((n) => n.talkId).filter((id) => !have.has(id));
      const more = ids.length ? (await pool.query(
        `SELECT ${CARD} FROM talks t LEFT JOIN categories c ON c.id = t.category_id WHERE t.id = ANY($1)`, [ids])).rows : [];
      const when = new Map(nexts.map((n) => [n.talkId, n.watchedAt]));
      for (const m of more) rows.push({ ...m, positionMs: 0, durationMs: 0, watchedAt: when.get(m.id), nextUp: true });
      rows.sort((x, y) => new Date(y.watchedAt) - new Date(x.watchedAt));
      rows.length = Math.min(rows.length, 12);
    }
    const labels = await episodeLabels(rows.map((r) => r.id));
    for (const r of rows) r.series = labels.get(r.id) || null;
    return cards(rows);
  });

  // « Quiz à rattraper » : conférences terminées dont le quiz n'est pas encore validé (jamais tenté : « à passer », tenté sans réussite : « à revoir »).
  app.get('/me/quiz/todo', auth, async (req) => {
    const enabledByDefault = isOn(await getSetting('quiz_default_enabled'));
    const min = await getNumber('quiz_min_questions');
    const { rows } = await pool.query(
      `SELECT ${CARD},
              (SELECT max(a.percent) FROM quiz_attempts a WHERE a.user_id = $1 AND a.talk_id = t.id) AS "bestPercent",
              EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.user_id = $1 AND a.talk_id = t.id) AS attempted,
              GREATEST((SELECT max(a.created_at) FROM quiz_attempts a WHERE a.user_id = $1 AND a.talk_id = t.id),
                       (SELECT p.updated_at FROM watch_progress p WHERE p.user_id = $1 AND p.talk_id = t.id)) AS "since"
         FROM talks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.video_status = 'ready' AND ${visibleSql('t')}
          AND COALESCE(t.quiz_enabled, $2::boolean)
          AND (SELECT count(*) FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved') >= $3
          AND NOT EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.user_id = $1 AND a.talk_id = t.id AND a.passed)
          AND (EXISTS (SELECT 1 FROM watch_progress p WHERE p.user_id = $1 AND p.talk_id = t.id AND p.completed)
               OR EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.user_id = $1 AND a.talk_id = t.id))
        ORDER BY "since" DESC NULLS LAST LIMIT 12`, [req.user.sub, enabledByDefault, min]);
    for (const r of rows) r.quizState = r.attempted ? 'retry' : 'todo';
    const labels = await episodeLabels(rows.map((r) => r.id));
    for (const r of rows) r.series = labels.get(r.id) || null;
    return cards(rows);
  });
}
