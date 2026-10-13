// Séries et saisons (étape 14.1).
//  - Public : GET /series, GET /series/:id, GET /talks/:id/series (contexte pour la fiche conférence).
//  - Studio (organisateur propriétaire ou admin) : création, modification, saisons, ordre et accès des épisodes.
// Règle d'accès : chaque épisode hérite de l'accès de la série, sauf s'il a son propre réglage (l'épisode l'emporte).
// talks.access garde la valeur effective ; syncAccess() la recalcule.
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet, putObject, deleteObject } from '../storage.js';
import { visibleSql } from '../visibility.js';

const uuid = z.string().uuid();
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const idParam = z.object({ id: uuid });
const seriesBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  speaker: z.string().trim().max(200),
  categoryId: z.number().int().positive().nullable(),
  access: z.enum(['free', 'premium']),
  published: z.boolean(),
  hasSeasons: z.boolean(),
}).partial().strict();
const createBody = seriesBody.extend({ title: z.string().trim().min(1).max(200) }).strict();
const layoutBody = z.object({
  episodes: z.array(z.object({
    talkId: uuid,
    seasonId: uuid.nullable().optional(),
    access: z.enum(['inherit', 'free', 'premium']).default('inherit'),
  }).strict()).max(500),
}).strict();

const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
const thumbOf = async (r) => (r.poster_key ? presignGet(r.poster_key) : (r.external_thumb || null));

// Recalcule talks.access des épisodes : réglage propre à l'épisode, sinon accès de la série.
export async function syncAccess(db, seriesId) {
  await db.query(
    `UPDATE talks t SET access = COALESCE(e.access_override, s.access)
       FROM series_episodes e JOIN series s ON s.id = e.series_id
      WHERE e.talk_id = t.id AND e.series_id = $1 AND t.access <> COALESCE(e.access_override, s.access)`, [seriesId]);
}

// Séries publiées avec au moins un épisode en ligne (utilisé par GET /series, l'accueil, la recherche et la bibliothèque).
//  - q : mot-clé (titre, intervenant, présentation) ; startedBy : ne garde que les séries que ce compte a commencées,
//    triées de la plus récemment regardée, avec `watched` (épisodes terminés) pour la barre d'avancement.
export async function listSeries({ limit = 40, category = null, q = null, startedBy = null } = {}) {
  const vals = [limit];
  const where = ['s.published'];
  if (category) { vals.push(category); where.push(`s.category_id = $${vals.length}`); }
  if (q) { vals.push(`%${String(q).replace(/[%_\\]/g, '\\$&')}%`); where.push(`(s.title ILIKE $${vals.length} OR s.speaker ILIKE $${vals.length} OR s.description ILIKE $${vals.length})`); }
  let join = '';
  let extra = '';
  let having = '';
  let order = 'max(COALESCE(t.publish_at, t.created_at)) DESC';
  if (startedBy) {
    vals.push(startedBy);
    join = `LEFT JOIN watch_progress p ON p.talk_id = t.id AND p.user_id = $${vals.length}`;
    extra = ', (count(p.talk_id) FILTER (WHERE p.completed))::int AS watched, max(p.updated_at) AS last_watched';
    having = 'HAVING count(p.talk_id) > 0';
    order = 'max(p.updated_at) DESC';
  }
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.speaker, s.description, s.has_seasons AS "hasSeasons", s.category_id AS "categoryId", c.name AS category, s.poster_key,
            count(t.id)::int AS "episodeCount",
            (SELECT count(*)::int FROM seasons z WHERE z.series_id = s.id) AS "seasonCount",
            bool_and(t.access = 'free') AS "allFree", bool_and(t.access = 'premium') AS "allPremium",
            (array_agg(t.poster_key ORDER BY e.position) FILTER (WHERE t.poster_key IS NOT NULL))[1] AS first_poster,
            (array_agg(t.external_thumb ORDER BY e.position) FILTER (WHERE t.external_thumb IS NOT NULL))[1] AS first_thumb${extra}
       FROM series s
       JOIN series_episodes e ON e.series_id = s.id
       JOIN talks t ON t.id = e.talk_id AND t.video_status = 'ready' AND ${visibleSql('t')}
       ${join}
       LEFT JOIN categories c ON c.id = s.category_id
      WHERE ${where.join(' AND ')}
      GROUP BY s.id, c.name ${having} ORDER BY ${order} LIMIT $1`, vals);
  const out = [];
  for (const r of rows) {
    const poster = r.poster_key || r.first_poster;
    const item = {
      id: r.id, title: r.title, speaker: r.speaker, summary: clip(r.description, 170), hasSeasons: r.hasSeasons, categoryId: r.categoryId, category: r.category,
      episodeCount: r.episodeCount, seasonCount: r.hasSeasons ? r.seasonCount : 0,
      access: r.allFree ? 'free' : r.allPremium ? 'premium' : 'mixed',
      posterUrl: poster ? await presignGet(poster) : (r.first_thumb || null),
    };
    if (startedBy) item.watched = r.watched;
    out.push(item);
  }
  return out;
}

// Épisodes (en ligne) des séries publiées qui contiennent l'une de ces conférences, rangés dans l'ordre de lecture.
async function seriesOrder(talkIds) {
  const { rows } = await pool.query(
    `SELECT e.series_id, s.title, s.has_seasons, e.talk_id, e.season_id,
            COALESCE((SELECT z.rn FROM (SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM seasons WHERE series_id = e.series_id) z WHERE z.id = e.season_id), 0)::int AS season_number
       FROM series_episodes e JOIN series s ON s.id = e.series_id AND s.published
       JOIN talks t ON t.id = e.talk_id AND t.video_status = 'ready' AND ${visibleSql('t')}
      WHERE e.series_id IN (SELECT series_id FROM series_episodes WHERE talk_id = ANY($1))
      ORDER BY e.series_id, CASE WHEN s.has_seasons THEN COALESCE((SELECT z.rn FROM (SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM seasons WHERE series_id = e.series_id) z WHERE z.id = e.season_id), 0) ELSE 0 END, e.position`, [talkIds]);
  const bySeries = new Map();
  for (const r of rows) { if (!bySeries.has(r.series_id)) bySeries.set(r.series_id, []); bySeries.get(r.series_id).push(r); }
  return bySeries;
}

// Pour des conférences : { id série, titre, saison, numéro } de leur place dans une série (absent si hors série).
export async function episodeLabels(talkIds) {
  const out = new Map();
  if (!talkIds.length) return out;
  for (const list of (await seriesOrder(talkIds)).values()) {
    const counters = new Map();
    for (const r of list) {
      const key = r.season_number;
      const n = (counters.get(key) || 0) + 1;
      counters.set(key, n);
      out.set(r.talk_id, { id: r.series_id, title: r.title, seasonNumber: r.has_seasons ? r.season_number : null, number: n });
    }
  }
  return out;
}

// « Épisode suivant » pour « Continuer à regarder » : dans chaque série commencée, sans épisode en cours de lecture,
// l'épisode qui suit le dernier terminé (s'il n'est pas déjà commencé). Triés du plus récemment regardé.
export async function seriesNextUp(userId, minResumeMs = 5000) {
  const { rows } = await pool.query(
    `SELECT e.series_id, e.talk_id, p.position_ms, p.completed, p.updated_at
       FROM series_episodes e JOIN series s ON s.id = e.series_id AND s.published
       JOIN talks t ON t.id = e.talk_id AND t.video_status = 'ready' AND ${visibleSql('t')}
       LEFT JOIN watch_progress p ON p.talk_id = e.talk_id AND p.user_id = $1
      WHERE e.series_id IN (SELECT e2.series_id FROM series_episodes e2 JOIN watch_progress p2 ON p2.talk_id = e2.talk_id AND p2.user_id = $1)
      ORDER BY e.series_id, COALESCE((SELECT z.rn FROM (SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM seasons WHERE series_id = e.series_id) z WHERE z.id = e.season_id), 0), e.position`, [userId]);
  const bySeries = new Map();
  for (const r of rows) { if (!bySeries.has(r.series_id)) bySeries.set(r.series_id, []); bySeries.get(r.series_id).push(r); }
  const out = [];
  for (const list of bySeries.values()) {
    if (list.some((r) => r.position_ms >= minResumeMs && !r.completed)) continue; // un épisode est déjà en cours : il apparaît seul
    let last = -1;
    list.forEach((r, i) => { if (r.completed && (last < 0 || r.updated_at > list[last].updated_at)) last = i; });
    const nxt = last >= 0 ? list[last + 1] : null;
    if (nxt && !nxt.completed && !(nxt.position_ms >= minResumeMs)) out.push({ talkId: nxt.talk_id, watchedAt: list[last].updated_at });
  }
  return out.sort((x, y) => y.watchedAt - x.watchedAt);
}

export default async function seriesRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const isAdmin = (req) => req.user.role === 'admin';

  // Série dont l'utilisateur est propriétaire (ou toutes pour un admin) ; sinon réponse 404.
  async function owned(req, reply, id) {
    const s = (await pool.query('SELECT * FROM series WHERE id = $1', [id])).rows[0];
    if (!s || (!isAdmin(req) && s.owner_id !== req.user.sub)) { reply.code(404).send({ error: 'Série introuvable' }); return null; }
    return s;
  }

  // Épisodes d'une série avec infos de carte ; `all` : inclut brouillons / non prêts (propriétaire).
  async function loadEpisodes(seriesId, { all, viewerId }) {
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, t.description,
              t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, t.video_status AS status,
              t.publication, ${visibleSql('t')} AS visible,
              e.season_id AS "seasonId", e.position, e.access_override AS "accessOverride",
              p.position_ms AS "positionMs", p.completed
         FROM series_episodes e JOIN talks t ON t.id = e.talk_id
         LEFT JOIN watch_progress p ON p.talk_id = t.id AND p.user_id = $2
        WHERE e.series_id = $1 ${all ? '' : `AND t.video_status = 'ready' AND ${visibleSql('t')}`}
        ORDER BY e.position`, [seriesId, viewerId || null]);
    const out = [];
    for (const r of rows) {
      const ep = { ...r, posterUrl: await thumbOf(r), summary: clip(r.description, 170) };
      for (const k of ['poster_key', 'external_thumb', 'description']) delete ep[k];
      if (ep.source === 'upload') delete ep.video_ref;
      if (!viewerId) { delete ep.positionMs; delete ep.completed; }
      if (!all) { delete ep.accessOverride; delete ep.publication; }
      out.push(ep);
    }
    return out;
  }

  // Numérote les épisodes (par saison si la série en a) et regroupe.
  function shape(series, seasons, episodes) {
    const bySeason = new Map(seasons.map((s) => [s.id, []]));
    const flat = [];
    episodes.forEach((e) => {
      const list = series.has_seasons ? bySeason.get(e.seasonId) : flat;
      if (!list) return;
      list.push(e);
    });
    const number = (list) => list.forEach((e, i) => { e.number = i + 1; });
    if (series.has_seasons) {
      let n = 0;
      const out = seasons.map((s, i) => { const eps = bySeason.get(s.id); number(eps); n += eps.length; return { id: s.id, number: i + 1, title: s.title, episodes: eps }; });
      return { seasons: out, episodes: null, total: n };
    }
    number(flat);
    return { seasons: null, episodes: flat, total: flat.length };
  }

  const loadSeasons = async (seriesId) => (await pool.query('SELECT id, title, position FROM seasons WHERE series_id = $1 ORDER BY position, id', [seriesId])).rows;
  const facts = (s) => ({ id: s.id, title: s.title, description: s.description, speaker: s.speaker, categoryId: s.category_id, hasSeasons: s.has_seasons, access: s.access, published: s.published });

  // ---------- Public ----------
  app.get('/series', async (req) => {
    const q = z.object({ category: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }).parse(req.query);
    return listSeries({ limit: q.limit, category: q.category || null });
  });

  // Séries que le compte a commencées (bibliothèque), la plus récemment regardée d'abord.
  app.get('/me/series', { preHandler: app.authenticate }, async (req) => listSeries({ limit: 40, startedBy: req.user.sub }));

  app.get('/series/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const s = (await pool.query('SELECT s.*, c.name AS category FROM series s LEFT JOIN categories c ON c.id = s.category_id WHERE s.id = $1', [id])).rows[0];
    if (!s) return reply.code(404).send({ error: 'Série introuvable' });
    const viewer = await app.optionalUser(req);
    const manage = viewer && (viewer.role === 'admin' || viewer.sub === s.owner_id);
    if (!s.published && !manage) return reply.code(404).send({ error: 'Série introuvable' });
    const episodes = await loadEpisodes(id, { all: false, viewerId: viewer?.sub });
    if (!episodes.length && !manage) return reply.code(404).send({ error: 'Série introuvable' });
    const seasons = s.has_seasons ? await loadSeasons(id) : [];
    const shaped = shape(s, seasons, episodes);
    const flat = shaped.seasons ? shaped.seasons.flatMap((x) => x.episodes) : shaped.episodes;
    // « Regarder / Reprendre » : l'épisode commencé non terminé, sinon le premier non terminé, sinon le premier.
    const started = flat.find((e) => e.positionMs > 0 && !e.completed);
    const next = started || flat.find((e) => !e.completed) || flat[0] || null;
    const poster = s.poster_key ? await presignGet(s.poster_key) : (flat.find((e) => e.posterUrl)?.posterUrl || null);
    return {
      ...facts(s), category: s.category, posterUrl: poster, episodeCount: shaped.total,
      seasons: shaped.seasons, episodes: shaped.episodes,
      resume: next ? { talkId: next.id, positionMs: started ? started.positionMs : 0, number: next.number, started: Boolean(started) } : null,
    };
  });

  // Contexte d'une conférence qui fait partie d'une série : numéro, précédent / suivant, liste des épisodes (colonne latérale).
  app.get('/talks/:id/series', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const link = (await pool.query(
      `SELECT s.*, e.season_id FROM series_episodes e JOIN series s ON s.id = e.series_id WHERE e.talk_id = $1`, [id])).rows[0];
    if (!link) return { series: null };
    const viewer = await app.optionalUser(req);
    const manage = viewer && (viewer.role === 'admin' || viewer.sub === link.owner_id);
    if (!link.published && !manage) return { series: null };
    const episodes = await loadEpisodes(link.id, { all: false, viewerId: viewer?.sub });
    const seasons = link.has_seasons ? await loadSeasons(link.id) : [];
    const shaped = shape(link, seasons, episodes);
    const groups = shaped.seasons ? shaped.seasons : [{ id: null, number: null, title: '', episodes: shaped.episodes }];
    const flat = groups.flatMap((g) => g.episodes.map((e) => ({ ...e, seasonNumber: g.number })));
    const i = flat.findIndex((e) => e.id === id);
    const brief = (e) => (e ? { id: e.id, title: e.title, access: e.access, number: e.number, seasonNumber: e.seasonNumber } : null);
    const cur = i >= 0 ? flat[i] : null;
    return {
      series: {
        id: link.id, title: link.title, hasSeasons: link.has_seasons, total: flat.length,
        season: cur && cur.seasonNumber ? { number: cur.seasonNumber, title: groups[cur.seasonNumber - 1].title } : null,
        number: cur ? cur.number : null,
        prev: i > 0 ? brief(flat[i - 1]) : null,
        next: i >= 0 && i < flat.length - 1 ? brief(flat[i + 1]) : null,
        seasons: groups.map((g) => ({ id: g.id, number: g.number, title: g.title })),
        episodes: flat.map((e) => ({ id: e.id, title: e.title, access: e.access, durationSeconds: e.durationSeconds, posterUrl: e.posterUrl, number: e.number, seasonNumber: e.seasonNumber,
          positionMs: e.positionMs, completed: e.completed, current: e.id === id })),
      },
    };
  });

  // ---------- Studio ----------
  app.get('/studio/series', organizer, async (req) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.title, s.speaker, s.published, s.has_seasons AS "hasSeasons", s.access, s.updated_at AS "updatedAt", u.name AS "ownerName",
              (SELECT count(*)::int FROM series_episodes e WHERE e.series_id = s.id) AS "episodeCount",
              (SELECT count(*)::int FROM seasons z WHERE z.series_id = s.id) AS "seasonCount"
         FROM series s JOIN users u ON u.id = s.owner_id
        ${isAdmin(req) ? '' : 'WHERE s.owner_id = $1'} ORDER BY s.updated_at DESC`, isAdmin(req) ? [] : [req.user.sub]);
    return rows;
  });

  // Conférences que l'on peut ajouter : les miennes (toutes pour un admin) qui ne sont dans aucune série.
  app.get('/studio/series-candidates', organizer, async (req) => {
    const q = z.object({ q: z.string().max(100).optional() }).parse(req.query);
    const vals = [];
    const where = ['NOT EXISTS (SELECT 1 FROM series_episodes e WHERE e.talk_id = t.id)'];
    if (!isAdmin(req)) { vals.push(req.user.sub); where.push(`t.organizer_id = $${vals.length}`); }
    if (q.q) { vals.push(`%${q.q.replace(/[%_]/g, '')}%`); where.push(`(t.title ILIKE $${vals.length} OR t.speaker ILIKE $${vals.length})`); }
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.access, t.duration_seconds AS "durationSeconds", t.video_status AS status, t.publication
         FROM talks t WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT 100`, vals);
    return rows;
  });

  app.post('/series', organizer, async (req, reply) => {
    const b = createBody.parse(req.body ?? {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO series(owner_id, title, description, speaker, category_id, has_seasons, access, published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [req.user.sub, b.title, b.description ?? '', b.speaker ?? '', b.categoryId ?? null, b.hasSeasons ?? false, b.access ?? 'free', b.published ?? false]);
      if (b.hasSeasons) await client.query("INSERT INTO seasons(series_id, position, title) VALUES ($1, 1, '')", [rows[0].id]);
      await client.query('COMMIT');
      return reply.code(201).send({ id: rows[0].id });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue' });
      throw err;
    } finally { client.release(); }
  });

  // Fiche complète pour l'édition : tous les épisodes, y compris brouillons et conversions en cours.
  app.get('/series/:id/manage', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const s = await owned(req, reply, id);
    if (!s) return;
    const episodes = await loadEpisodes(id, { all: true, viewerId: null });
    const seasons = s.has_seasons ? (await loadSeasons(id)).map((z, i) => ({ id: z.id, number: i + 1, title: z.title })) : [];
    return { ...facts(s), posterUrl: s.poster_key ? await presignGet(s.poster_key) : null, seasons, episodes };
  });

  app.patch('/series/:id', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = seriesBody.parse(req.body ?? {});
    const s = await owned(req, reply, id);
    if (!s) return;
    const sets = ['updated_at = now()'];
    const vals = [id];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.title !== undefined) set('title', b.title);
    if (b.description !== undefined) set('description', b.description);
    if (b.speaker !== undefined) set('speaker', b.speaker);
    if (b.categoryId !== undefined) set('category_id', b.categoryId);
    if (b.access !== undefined) set('access', b.access);
    if (b.published !== undefined) set('published', b.published);
    if (b.hasSeasons !== undefined) set('has_seasons', b.hasSeasons);
    if (sets.length === 1) return reply.code(400).send({ error: 'Rien à modifier' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE series SET ${sets.join(', ')} WHERE id = $1`, vals);
      if (b.hasSeasons === true && !s.has_seasons) {
        // Passage « avec saisons » : une première saison reçoit tous les épisodes.
        const z = await client.query("INSERT INTO seasons(series_id, position, title) VALUES ($1, 1, '') RETURNING id", [id]);
        await client.query('UPDATE series_episodes SET season_id = $2 WHERE series_id = $1', [id, z.rows[0].id]);
      } else if (b.hasSeasons === false && s.has_seasons) {
        // Retour « sans saisons » : les épisodes gardent leur ordre, les saisons disparaissent.
        await client.query('UPDATE series_episodes SET season_id = NULL WHERE series_id = $1', [id]);
        await client.query('DELETE FROM seasons WHERE series_id = $1', [id]);
      }
      if (b.access !== undefined) await syncAccess(client, id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue' });
      throw err;
    } finally { client.release(); }
    return { ok: true };
  });

  // Supprime la série : les conférences restent, redevenues isolées (leur accès actuel est conservé).
  app.delete('/series/:id', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const s = await owned(req, reply, id);
    if (!s) return;
    await pool.query('DELETE FROM series_episodes WHERE series_id = $1', [id]);
    await pool.query('DELETE FROM series WHERE id = $1', [id]);
    if (s.poster_key?.startsWith('series/')) await deleteObject(s.poster_key).catch(() => {});
    return reply.code(204).send();
  });

  // ---------- Saisons ----------
  app.post('/series/:id/seasons', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { title } = z.object({ title: z.string().trim().max(120).default('') }).parse(req.body ?? {});
    const s = await owned(req, reply, id);
    if (!s) return;
    if (!s.has_seasons) return reply.code(409).send({ error: "Cette série n'a pas de saisons : activez-les d'abord" });
    const { rows } = await pool.query('INSERT INTO seasons(series_id, position, title) VALUES ($1, COALESCE((SELECT max(position) FROM seasons WHERE series_id = $1), 0) + 1, $2) RETURNING id', [id, title]);
    return reply.code(201).send({ id: rows[0].id });
  });

  app.patch('/series/:id/seasons/:sid', organizer, async (req, reply) => {
    const { id, sid } = z.object({ id: uuid, sid: uuid }).parse(req.params);
    const { title } = z.object({ title: z.string().trim().max(120) }).strict().parse(req.body ?? {});
    if (!await owned(req, reply, id)) return;
    const r = await pool.query('UPDATE seasons SET title = $3 WHERE id = $2 AND series_id = $1', [id, sid, title]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Saison introuvable' });
    return { ok: true };
  });

  app.put('/series/:id/seasons-order', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { ids } = z.object({ ids: z.array(uuid).min(1).max(50) }).strict().parse(req.body ?? {});
    if (!await owned(req, reply, id)) return;
    const have = (await pool.query('SELECT id FROM seasons WHERE series_id = $1', [id])).rows.map((r) => r.id).sort();
    if (JSON.stringify(have) !== JSON.stringify([...ids].sort())) return reply.code(400).send({ error: 'La liste doit contenir toutes les saisons, une seule fois' });
    await pool.query('UPDATE seasons s SET position = o.n FROM (SELECT x::uuid AS id, ord::int AS n FROM unnest($2::text[]) WITH ORDINALITY AS u(x, ord)) o WHERE s.id = o.id AND s.series_id = $1', [id, ids]);
    return { ok: true };
  });

  app.delete('/series/:id/seasons/:sid', organizer, async (req, reply) => {
    const { id, sid } = z.object({ id: uuid, sid: uuid }).parse(req.params);
    if (!await owned(req, reply, id)) return;
    const used = await pool.query('SELECT 1 FROM series_episodes WHERE season_id = $1 LIMIT 1', [sid]);
    if (used.rowCount) return reply.code(409).send({ error: "Cette saison contient des épisodes : déplacez-les d'abord" });
    const r = await pool.query('DELETE FROM seasons WHERE id = $2 AND series_id = $1', [id, sid]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Saison introuvable' });
    return reply.code(204).send();
  });

  // ---------- Épisodes : ordre, saison et accès, en une seule sauvegarde ----------
  // Remplace la liste : les conférences absentes quittent la série (isolées, accès conservé).
  app.put('/series/:id/episodes', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { episodes } = layoutBody.parse(req.body ?? {});
    const s = await owned(req, reply, id);
    if (!s) return;
    const ids = episodes.map((e) => e.talkId);
    if (new Set(ids).size !== ids.length) return reply.code(400).send({ error: 'Une conférence ne peut figurer qu\'une fois' });
    const seasons = new Set((await pool.query('SELECT id FROM seasons WHERE series_id = $1', [id])).rows.map((r) => r.id));
    for (const e of episodes) {
      if (s.has_seasons && !(e.seasonId && seasons.has(e.seasonId))) return reply.code(400).send({ error: 'Chaque épisode doit être placé dans une saison de la série' });
      if (!s.has_seasons && e.seasonId) return reply.code(400).send({ error: "Cette série n'a pas de saisons" });
    }
    if (ids.length) {
      const talks = (await pool.query(
        `SELECT t.id, t.organizer_id, e.series_id FROM talks t LEFT JOIN series_episodes e ON e.talk_id = t.id WHERE t.id = ANY($1::uuid[])`, [ids])).rows;
      if (talks.length !== ids.length) return reply.code(400).send({ error: 'Conférence introuvable' });
      for (const t of talks) {
        if (!isAdmin(req) && t.organizer_id !== req.user.sub) return reply.code(403).send({ error: 'Vous ne pouvez ajouter que vos propres conférences' });
        if (t.series_id && t.series_id !== id) return reply.code(409).send({ error: 'Une de ces conférences fait déjà partie d\'une autre série' });
      }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM series_episodes WHERE series_id = $1 AND NOT (talk_id = ANY($2::uuid[]))', [id, ids]);
      for (let i = 0; i < episodes.length; i++) {
        const e = episodes[i];
        await client.query(
          `INSERT INTO series_episodes(talk_id, series_id, season_id, position, access_override) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (talk_id) DO UPDATE SET season_id = EXCLUDED.season_id, position = EXCLUDED.position, access_override = EXCLUDED.access_override`,
          [e.talkId, id, e.seasonId ?? null, i + 1, e.access === 'inherit' ? null : e.access]);
      }
      await syncAccess(client, id);
      await client.query('UPDATE series SET updated_at = now() WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    return { ok: true, count: episodes.length };
  });

  // ---------- Image de la série (JPEG / PNG / WebP en data-URL, 2,5 Mo max) ----------
  // Sans image, la page et les vignettes utilisent la miniature du premier épisode.
  app.post('/series/:id/poster', { ...organizer, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { image } = z.object({ image: z.string().max(3_500_000) }).strict().parse(req.body ?? {});
    const s = await owned(req, reply, id);
    if (!s) return;
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Image JPEG, PNG ou WebP attendue' });
    const buf = Buffer.from(m[2], 'base64');
    const magic = (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
      || (m[1] === 'image/png' && buf.subarray(1, 4).toString() === 'PNG')
      || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!magic || buf.length > 2.5 * 1024 * 1024) return reply.code(400).send({ error: 'Image invalide ou trop lourde (2,5 Mo maximum)' });
    const key = `series/${id}-${Date.now()}.${IMG_TYPES[m[1]]}`;
    await putObject(key, buf, m[1]);
    await pool.query('UPDATE series SET poster_key = $2, updated_at = now() WHERE id = $1', [id, key]);
    if (s.poster_key?.startsWith('series/')) await deleteObject(s.poster_key).catch(() => {});
    return reply.code(201).send({ posterUrl: await presignGet(key) });
  });

  app.delete('/series/:id/poster', organizer, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const s = await owned(req, reply, id);
    if (!s) return;
    await pool.query('UPDATE series SET poster_key = NULL, updated_at = now() WHERE id = $1', [id]);
    if (s.poster_key?.startsWith('series/')) await deleteObject(s.poster_key).catch(() => {});
    return reply.code(204).send();
  });
}
