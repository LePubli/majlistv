// Mejliss Kids — catalogue : univers Kids, rangées de suggestions, recherche adaptée, pages « univers » et « série ».
//
// Depuis la phase 4 du nouveau catalogue (20/11/2026), les « rubriques » de l'enfant SONT les catégories Kids de la table `categories`
// (catalogue_type = 'kids', catégories principales = les 10 univers, sous-catégories = leurs thèmes). L'ancienne table kid_rubrics n'est plus lue
// (conservée telle quelle, sans effet). Les identifiants « rubricId / rubricIds » renvoyés aux clients sont donc des identifiants de catégories.
// Les textes viennent de categories.name (français) et categories.translations (en / ar) : tout se gère dans Admin → Catégories.
//
// Studio      GET /studio/kids/rubrics (univers pour les menus) · GET/PUT /studio/talks/:id/kid-rubrics · POST /studio/kids/rubrics/bulk
// Enfant      GET /kids/catalog (univers + rangées + vidéos) · GET /kids/search?q= · GET /kids/universes · GET /kids/universes/:slug
//             GET /kids/series/:id
// Règles : l'enfant ne voit que ce qu'il voit déjà (prête, publiée, SA tranche d'âge — contrôlée ici, côté serveur —, catalogue autorisé par
// le parent, gratuites sans abonnement). La recherche enfant est une recherche SQL volontairement simple (titre, intervenant, description,
// univers) : jamais d'extrait de transcription, jamais de contenu adulte. Les « plus regardés » sont des totaux anonymes.
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';
import { visibleSql } from '../../visibility.js';
import { isOn, getSetting } from '../../settings.js';
import { bandOkSql, inCategorySql } from '../../taxonomy.js';
import { catalogSql, timeState } from '../../kidsControl.js';
import { fold, foldSql } from '../../fold.js';
import { viaChannel, managedSpeakers } from '../../channelAccess.js';
import { parentAllowed } from './routes.js';

const idSchema = z.object({ id: z.guid() });
const SHELF_MAX = 24, POPULAR_MIN = 3, TALK_MAX = 200, PAGE = 24;

// Un univers = catégorie principale du catalogue Kids. Même forme qu'avant pour les clients (site, application, télé).
const rubricRow = (c) => ({
  id: c.id, slug: c.slug,
  names: { fr: c.name, en: c.translations?.en?.name || '', ar: c.translations?.ar?.name || '' },
  emoji: c.icon || '⭐', color: c.color || null, image: c.image || null, position: c.display_order, active: c.is_active,
  ...(c.n !== undefined ? { talks: c.n } : {}),
});
const UNIVERSES = `FROM categories c WHERE c.catalogue_type = 'kids' AND c.parent_id IS NULL`;
const SUBS = `FROM categories c WHERE c.catalogue_type = 'kids' AND c.parent_id IS NOT NULL`;
const names3 = (c) => ({ fr: c.name, en: c.translations?.en?.name || '', ar: c.translations?.ar?.name || '' });

// Classement Kids d'une ou plusieurs vidéos : on écrit dans talk_categories (catégories supplémentaires), jamais ailleurs.
//   add : ajoute les univers · remove : retire les univers (et leurs sous-catégories) · replace : ne garde que ces univers.
// Une catégorie principale Kids (talks.category_id) retirée est vidée (la vidéo reste en ligne, sans catégorie principale).
async function applyUniverses(c, talkIds, uniIds, mode) {
  let drop = uniIds;
  if (mode === 'replace') drop = (await c.query(`SELECT c.id ${UNIVERSES} AND c.id <> ALL($1::int[])`, [uniIds])).rows.map((r) => r.id);
  if (mode === 'replace' || mode === 'remove') {
    const tree = 'SELECT id FROM categories WHERE id = ANY($2::int[]) OR parent_id = ANY($2::int[])';
    await c.query(`DELETE FROM talk_categories WHERE talk_id = ANY($1::uuid[]) AND category_id IN (${tree})`, [talkIds, drop]);
    await c.query(`UPDATE talks SET category_id = NULL WHERE id = ANY($1::uuid[]) AND category_id IN (${tree})`, [talkIds, drop]);
  }
  if (mode !== 'remove') {
    await c.query(
      `INSERT INTO talk_categories(talk_id, category_id)
         SELECT t.id, u.id FROM talks t, categories u
          WHERE t.id = ANY($1::uuid[]) AND u.id = ANY($2::int[])
            AND NOT COALESCE(${inCategorySql('t', 'u.id')}, false)   -- category_id vide : le test vaut NULL, pas faux
       ON CONFLICT DO NOTHING`, [talkIds, uniIds]);
  }
}

export default async function kidCatalogRoutes(app) {
  const manager = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const orgAdmin = { preHandler: app.requireRole('organizer', 'admin') };
  const kidAuth = { preHandler: app.authenticate, config: { kidOk: true } };
  const off = async (reply) => (isOn(await getSetting('kids_enabled')) ? null : reply.code(404).send({ error: 'Espace Kids indisponible' }));

  // ------------------------------------------------------------------ Studio : classer les vidéos dans les univers
  app.get('/studio/kids/rubrics', manager, async () => (await pool.query(`SELECT c.* ${UNIVERSES} ORDER BY c.display_order, c.id`)).rows.map(rubricRow));

  // Droit sur une vidéo : créateur, administrateur, propriétaire / éditeur de sa chaîne.
  async function mine(req, reply, id) {
    const t = (await pool.query('SELECT id, organizer_id, speaker FROM talks WHERE id = $1', [id])).rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub && !(await viaChannel(req.user, t)))) { reply.code(404).send({ error: 'Vidéo introuvable' }); return null; }
    return t;
  }
  const universesOf = async (id) => (await pool.query(
    `SELECT c.id ${UNIVERSES} AND (SELECT ${inCategorySql('t', 'c.id')} FROM talks t WHERE t.id = $1) ORDER BY c.id`, [id])).rows.map((r) => r.id);
  const universeIds = async (ids) => (await pool.query(`SELECT c.id ${UNIVERSES} AND c.id = ANY($1::int[])`, [ids])).rows.map((r) => r.id);
  const idsBody = z.object({ rubricIds: z.array(z.number().int().positive()).max(20) });

  app.get('/studio/talks/:id/kid-rubrics', orgAdmin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await mine(req, reply, id))) return undefined;
    return { rubricIds: await universesOf(id) };
  });
  app.put('/studio/talks/:id/kid-rubrics', orgAdmin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rubricIds } = idsBody.parse(req.body ?? {});
    if (!(await mine(req, reply, id))) return undefined;
    const ok = await universeIds(rubricIds);
    if (ok.length !== new Set(rubricIds).size) return reply.code(400).send({ error: 'Univers inconnu' });
    const c = await pool.connect();
    try { await c.query('BEGIN'); await applyUniverses(c, [id], ok, 'replace'); await c.query('COMMIT'); }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    req.auditSummary = `Vidéo ${id} : univers Kids modifiés`;
    return { rubricIds: await universesOf(id) };
  });

  // En lot : { ids, rubricIds, mode: 'add' | 'replace' | 'remove' }.
  app.post('/studio/kids/rubrics/bulk', orgAdmin, async (req, reply) => {
    const b = z.object({ ids: z.array(z.guid()).min(1).max(500), rubricIds: z.array(z.number().int().positive()).max(20), mode: z.enum(['add', 'replace', 'remove']) }).parse(req.body ?? {});
    const talks = (await pool.query(
      'SELECT id FROM talks WHERE id = ANY($1::uuid[]) AND ($2::boolean OR organizer_id = $3 OR lower(trim(speaker)) = ANY($4::text[]))',
      [b.ids, req.user.role === 'admin', req.user.sub, await managedSpeakers(req.user.sub)])).rows.map((r) => r.id);
    if (talks.length !== new Set(b.ids).size) return reply.code(404).send({ error: 'Certaines vidéos sont introuvables' });
    const ok = await universeIds(b.rubricIds);
    if (ok.length !== new Set(b.rubricIds).size) return reply.code(400).send({ error: 'Univers inconnu' });
    const c = await pool.connect();
    try { await c.query('BEGIN'); await applyUniverses(c, talks, ok, b.mode); await c.query('COMMIT'); }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    req.auditSummary = `Univers Kids (${b.mode}) sur ${talks.length} vidéo(s)`;
    return { updated: talks.length };
  });

  // ------------------------------------------------------------------ Enfant : catalogue
  const ctx = async (req, reply) => {
    const c = await app.kidContext(req);
    if (!c) { reply.code(401).send({ error: 'Session enfant expirée', code: 'kid_expired' }); return null; }
    return c;
  };
  // « rubricIds » d'une vidéo = ses univers actifs (catégorie principale ou supplémentaire, sous-catégories comprises).
  const CARD = `t.id, t.title, t.speaker, t.access, t.source, t.kids_bands AS "kidsBands", t.duration_seconds AS "durationSeconds",
      t.poster_key, t.external_thumb, COALESCE(t.publish_at, t.created_at) AS "at",
      COALESCE(k.completed, false) AS completed, COALESCE(k.position_ms, 0) AS "positionMs",
      (SELECT COALESCE(array_agg(u.id ORDER BY u.display_order, u.id), '{}') FROM categories u
        WHERE u.catalogue_type = 'kids' AND u.parent_id IS NULL AND u.is_active AND ${inCategorySql('t', 'u.id')}) AS "rubricIds",
      (SELECT max(stars) FROM kid_quiz_attempts a WHERE a.profile_id = $1 AND a.talk_id = t.id) AS stars`;
  // Règles de l'enfant ($1 profil, $2 SA tranche d'âge, $3 parent autorisé, $4 mode de catalogue). La tranche est toujours contrôlée ici.
  const BASE = `FROM talks t LEFT JOIN kid_progress k ON k.talk_id = t.id AND k.profile_id = $1
      WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 4)} AND ($3::boolean OR t.access = 'free') AND NOT EXISTS (SELECT 1 FROM sale_offers so_ WHERE so_.kind = 'talk' AND so_.item_id = t.id)`;
  const params = async (c) => [c.profile.id, c.profile.band, await parentAllowed(c.parent.sub, c.parent.role), c.profile.catalog_mode];
  async function withPosters(rows) {
    for (const r of rows) { r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null); delete r.poster_key; delete r.external_thumb; delete r.at; delete r.pop; }
    return rows;
  }

  app.get('/kids/catalog', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    const time = await timeState(c.profile);
    const rubrics = (await pool.query(`SELECT c.* ${UNIVERSES} AND c.is_active ORDER BY c.display_order, c.id`)).rows;
    if (time.timeUp) return { rubrics: rubrics.map(rubricRow), shelves: [], talks: [], time };
    const p = await params(c);
    const { rows } = await pool.query(
      `SELECT ${CARD}, (SELECT count(DISTINCT p.profile_id)::int FROM kid_progress p WHERE p.talk_id = t.id AND p.updated_at > now() - interval '30 days') AS pop
         ${BASE} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT ${TALK_MAX}`, p);
    const shelves = [];
    const top = (list) => list.slice(0, 12).map((x) => x.id);
    const resume = rows.filter((r) => r.positionMs >= 5000 && !r.completed);
    if (resume.length) shelves.push({ kind: 'resume', ids: top(resume) });
    // « Parce que tu as aimé » : même univers que la dernière vidéo terminée, pas encore vue.
    const last = (await pool.query(
      `SELECT t.id, t.title FROM kid_progress k JOIN talks t ON t.id = k.talk_id WHERE k.profile_id = $1 AND k.completed ORDER BY k.updated_at DESC LIMIT 1`, [c.profile.id])).rows[0];
    if (last) {
      const rr = rows.find((x) => x.id === last.id)?.rubricIds
        || (await pool.query(`SELECT u.id FROM talks lt, categories u WHERE lt.id = $1 AND u.catalogue_type = 'kids' AND u.parent_id IS NULL AND u.is_active AND ${inCategorySql('lt', 'u.id')}`, [last.id])).rows.map((x) => x.id);
      const like = rows.filter((x) => x.id !== last.id && !x.completed && x.rubricIds.some((i) => rr.includes(i)));
      if (like.length) shelves.push({ kind: 'because', basedOn: { id: last.id, title: last.title }, ids: top(like) });
    }
    const mineRows = rows.filter((x) => x.kidsBands[0] === c.profile.band && !x.completed); // sa tranche est la plus basse de la vidéo : « pour ton âge »
    if (mineRows.length) shelves.push({ kind: 'age', ids: top(mineRows) });
    shelves.push({ kind: 'new', ids: top(rows) });
    const popular = rows.filter((x) => x.pop > 0).sort((a, b) => b.pop - a.pop);
    if (popular.length >= POPULAR_MIN) shelves.push({ kind: 'popular', ids: top(popular) });
    const used = [];
    for (const r of rubrics) {
      const ids = rows.filter((x) => x.rubricIds.includes(r.id)).slice(0, SHELF_MAX).map((x) => x.id);
      if (ids.length) { shelves.push({ kind: 'rubric', rubricId: r.id, ids }); used.push(r.id); }
    }
    return { rubrics: rubrics.filter((r) => used.includes(r.id)).map(rubricRow), shelves, talks: await withPosters(rows), time };
  });

  // ------------------------------------------------------------------ Enfant : univers (tuiles) et page d'un univers
  // Compte exact des vidéos que CET enfant peut voir (sa tranche d'âge, son catalogue) ; un univers vide n'est pas proposé.
  const COUNT = (ref) => `(SELECT count(*)::int ${BASE} AND ${inCategorySql('t', ref)})`;
  const SERIES_OK = `s.published AND EXISTS (SELECT 1 FROM series_episodes e JOIN talks t ON t.id = e.talk_id LEFT JOIN kid_progress k ON k.talk_id = t.id AND k.profile_id = $1
      WHERE e.series_id = s.id AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 4)} AND ($3::boolean OR t.access = 'free')
        AND NOT EXISTS (SELECT 1 FROM sale_offers so_ WHERE so_.kind = 'talk' AND so_.item_id = t.id))`;
  const SERIES_COLS = `s.id, s.title, s.description, s.speaker, s.poster_key, s.has_seasons AS "hasSeasons",
      (SELECT count(*)::int FROM series_episodes e JOIN talks t ON t.id = e.talk_id WHERE e.series_id = s.id AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 4)} AND ($3::boolean OR t.access = 'free')
        AND NOT EXISTS (SELECT 1 FROM sale_offers so_ WHERE so_.kind = 'talk' AND so_.item_id = t.id)) AS episodes`;
  const seriesCards = async (rows) => { for (const r of rows) { r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : null; delete r.poster_key; } return rows; };

  app.get('/kids/universes', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    if ((await timeState(c.profile)).timeUp) return { universes: [] };
    const p = await params(c);
    const rows = (await pool.query(`SELECT c.*, ${COUNT('c.id')} AS n ${UNIVERSES} AND c.is_active ORDER BY c.display_order, c.id`, p)).rows.filter((r) => r.n > 0);
    return { universes: rows.map(rubricRow) };
  });

  const uniQuery = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), sub: z.string().regex(/^[a-z0-9-]+$/).max(120).optional() });
  app.get('/kids/universes/:slug', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    const { slug } = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(120) }).parse(req.params);
    const q = uniQuery.parse(req.query);
    const uni = (await pool.query(`SELECT c.* ${UNIVERSES} AND c.is_active AND c.slug = $1`, [slug])).rows[0];
    if (!uni) return reply.code(404).send({ error: 'Univers introuvable' });
    if ((await timeState(c.profile)).timeUp) return { universe: rubricRow(uni), subs: [], series: [], talks: [], total: 0, page: 1, pageSize: PAGE };
    const p = await params(c);
    const subs = (await pool.query(`SELECT c.*, ${COUNT('c.id')} AS n ${SUBS} AND c.parent_id = $5 AND c.is_active ORDER BY c.display_order, c.id`, [...p, uni.id])).rows.filter((r) => r.n > 0);
    const sub = q.sub ? subs.find((x) => x.slug === q.sub) : null;
    if (q.sub && !sub) return reply.code(404).send({ error: 'Thème introuvable' });
    const scope = sub ? sub.id : uni.id;
    const total = (await pool.query(`SELECT count(*)::int AS n ${BASE} AND ${inCategorySql('t', '$5')}`, [...p, scope])).rows[0].n;
    const talks = (await pool.query(
      `SELECT ${CARD} ${BASE} AND ${inCategorySql('t', '$5')} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT ${PAGE} OFFSET $6`,
      [...p, scope, (q.page - 1) * PAGE])).rows;
    // Séries de l'univers : rangée dans l'univers (ou son thème), ou une de ses vidéos y est classée.
    const inScope = `(s.category_id IN (SELECT id FROM categories WHERE id = $5 OR parent_id = $5)
      OR EXISTS (SELECT 1 FROM series_episodes e JOIN talks t ON t.id = e.talk_id WHERE e.series_id = s.id AND ${inCategorySql('t', '$5')}))`;
    const series = await seriesCards((await pool.query(
      `SELECT ${SERIES_COLS} FROM series s WHERE ${SERIES_OK} AND ${inScope} ORDER BY s.created_at DESC LIMIT 24`, [...p, scope])).rows);
    return { universe: rubricRow(uni), subs: subs.map(rubricRow), sub: sub ? rubricRow(sub) : null, series, talks: await withPosters(talks), total, page: q.page, pageSize: PAGE };
  });

  // Une série vue par l'enfant : seulement les épisodes qu'il peut voir (tranche d'âge, catalogue du parent, gratuits sans abonnement).
  app.get('/kids/series/:id', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    const { id } = idSchema.parse(req.params);
    const p = await params(c);
    const s = (await pool.query(`SELECT ${SERIES_COLS} FROM series s WHERE s.id = $5 AND ${SERIES_OK}`, [...p, id])).rows[0];
    if (!s) return reply.code(404).send({ error: 'Série introuvable' });
    if ((await timeState(c.profile)).timeUp) return reply.code(403).send({ error: "C'est fini pour aujourd'hui", code: 'kid_time_up' });
    const eps = (await pool.query(
      `SELECT ${CARD}, e.position, e.season_id AS "seasonId" ${BASE.replace('FROM talks t', 'FROM series_episodes e JOIN talks t ON t.id = e.talk_id')} AND e.series_id = $5 ORDER BY e.position`,
      [...p, id])).rows;
    const seasons = s.hasSeasons ? (await pool.query('SELECT id, position, title FROM seasons WHERE series_id = $1 ORDER BY position', [id])).rows : [];
    await seriesCards([s]);
    return { series: s, seasons, episodes: await withPosters(eps) };
  });

  // ------------------------------------------------------------------ Enfant : recherche
  const searchQuery = z.object({ q: z.string().trim().min(1).max(80), rubric: z.coerce.number().int().positive().optional() });
  app.get('/kids/search', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    const p = searchQuery.parse(req.query);
    const time = await timeState(c.profile);
    if (time.timeUp) return { talks: [] };
    const base = await params(c);
    // Mots tapés, sans accents ni majuscules ; comparés aux colonnes « repliées » de la même façon.
    const clean = [...new Set(fold(p.q).split(/\s+/).filter(Boolean))].slice(0, 5).map((w) => w.replace(/[\\%_]/g, '').slice(0, 40)).filter((w) => w.length > 0);
    const run = async (terms) => {
      const words = terms.map((w) => `%${w}%`).filter((w) => w.length > 2);
      if (!words.length) return [];
      const vals = [...base];
      const conds = words.map((w) => {
        vals.push(w); const n = vals.length;
        return `(${foldSql('t.title')} LIKE $${n} OR ${foldSql("coalesce(t.speaker, '')")} LIKE $${n} OR ${foldSql("coalesce(t.description, '')")} LIKE $${n}
                 OR EXISTS (SELECT 1 FROM categories u WHERE u.catalogue_type = 'kids' AND u.parent_id IS NULL AND u.is_active AND ${foldSql('u.name')} LIKE $${n} AND ${inCategorySql('t', 'u.id')}))`;
      });
      if (p.rubric) { vals.push(p.rubric); conds.push(inCategorySql('t', vals.length)); }
      return (await pool.query(
        `SELECT ${CARD} ${BASE} AND ${conds.join(' AND ')}
          ORDER BY (${foldSql('t.title')} LIKE $${vals.length + 1}) DESC, COALESCE(t.publish_at, t.created_at) DESC LIMIT 40`,
        [...vals, words[0]])).rows;
    };
    let rows = await run(clean);
    // Faute de frappe : rien trouvé ? On réessaie avec le début de chaque mot (4 premières lettres des mots de 5 lettres et plus).
    if (!rows.length && clean.some((w) => w.length >= 5)) rows = await run(clean.map((w) => (w.length >= 5 ? w.slice(0, 4) : w)));
    return { talks: await withPosters(rows) };
  });
}
