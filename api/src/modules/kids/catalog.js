// Mejliss Kids — catalogue (20/10) : rubriques Kids, rangées de suggestions, recherche adaptée.
//
// Admin       GET/POST /admin/kids/rubrics · PATCH/DELETE /admin/kids/rubrics/:id · PUT /admin/kids/rubrics/order
// Studio      GET /studio/kids/rubrics (liste pour les menus) · GET/PUT /studio/talks/:id/kid-rubrics · POST /studio/kids/rubrics/bulk
// Enfant      GET /kids/catalog (rubriques + rangées + conférences) · GET /kids/search?q=
// Règles : l'enfant ne voit que ce qu'il voit déjà (prête, publiée, sa tranche d'âge, catalogue autorisé par le parent, gratuites sans abonnement).
// La recherche enfant est une recherche SQL volontairement simple (titre, intervenant, description, rubrique) : pas de moteur externe,
// jamais d'extrait de transcription, jamais de contenu adulte. Les « plus regardés » sont des totaux anonymes (aucun enfant n'est comparé).
import { z } from 'zod';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';
import { visibleSql } from '../../visibility.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { bandOkSql } from '../../taxonomy.js';
import { catalogSql, timeState } from '../../kidsControl.js';
import { slugify } from '../../slugs.js';
import { fold, foldSql } from '../../fold.js';
import { viaChannel, managedSpeakers } from '../../channelAccess.js';
import { parentAllowed } from './routes.js';

const idSchema = z.object({ id: z.string().uuid() });
const rid = z.object({ id: z.coerce.number().int().positive() });
const names = z.object({
  fr: z.string().trim().min(1).max(60), en: z.string().trim().max(60).optional().default(''), ar: z.string().trim().max(60).optional().default(''),
});
const emoji = z.string().trim().min(1).max(8);
const SHELF_MAX = 24, POPULAR_MIN = 3, TALK_MAX = 200;

const rubricRow = (r) => ({ id: r.id, slug: r.slug, names: r.names, emoji: r.emoji, position: r.position, active: r.active, ...(r.n !== undefined ? { talks: r.n } : {}) });

export default async function kidCatalogRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  const manager = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const orgAdmin = { preHandler: app.requireRole('organizer', 'admin') };
  const kidAuth = { preHandler: app.authenticate, config: { kidOk: true } };
  const off = async (reply) => (isOn(await getSetting('kids_enabled')) ? null : reply.code(404).send({ error: 'Espace Kids indisponible' }));

  // ------------------------------------------------------------------ Admin : rubriques
  app.get('/admin/kids/rubrics', adminOnly, async () => (await pool.query(
    `SELECT r.*, (SELECT count(*)::int FROM talk_kid_rubrics x WHERE x.rubric_id = r.id) AS n FROM kid_rubrics r ORDER BY r.position, r.id`)).rows.map(rubricRow));

  app.post('/admin/kids/rubrics', adminOnly, async (req, reply) => {
    const b = z.object({ names, emoji: emoji.default('⭐') }).parse(req.body ?? {});
    let base = slugify(b.names.fr) || 'rubrique'; let slug = base; let i = 2;
    while ((await pool.query('SELECT 1 FROM kid_rubrics WHERE slug = $1', [slug])).rowCount) slug = `${base}-${i++}`;
    const pos = (await pool.query('SELECT COALESCE(max(position), 0) + 10 AS p FROM kid_rubrics')).rows[0].p;
    const { rows } = await pool.query('INSERT INTO kid_rubrics(slug, names, emoji, position) VALUES ($1, $2::jsonb, $3, $4) RETURNING *', [slug, JSON.stringify(b.names), b.emoji, pos]);
    req.auditSummary = `Rubrique Kids « ${b.names.fr} » créée`;
    return reply.code(201).send(rubricRow(rows[0]));
  });

  app.put('/admin/kids/rubrics/order', adminOnly, async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }).parse(req.body ?? {});
    for (let i = 0; i < ids.length; i += 1) await pool.query('UPDATE kid_rubrics SET position = $2 WHERE id = $1', [ids[i], (i + 1) * 10]);
    req.auditSummary = 'Rubriques Kids : ordre modifié';
    return reply.code(204).send();
  });

  app.patch('/admin/kids/rubrics/:id', adminOnly, async (req, reply) => {
    const { id } = rid.parse(req.params);
    const b = z.object({ names: names.optional(), emoji: emoji.optional(), active: z.boolean().optional() }).refine((x) => Object.keys(x).length > 0).parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM kid_rubrics WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Rubrique introuvable' });
    const { rows } = await pool.query('UPDATE kid_rubrics SET names = $2::jsonb, emoji = $3, active = $4 WHERE id = $1 RETURNING *',
      [id, JSON.stringify(b.names ?? cur.names), b.emoji ?? cur.emoji, b.active ?? cur.active]);
    req.auditSummary = `Rubrique Kids « ${rows[0].names.fr} » modifiée`;
    return rubricRow(rows[0]);
  });

  app.delete('/admin/kids/rubrics/:id', adminOnly, async (req, reply) => {
    const { id } = rid.parse(req.params);
    const r = (await pool.query('DELETE FROM kid_rubrics WHERE id = $1 RETURNING names', [id])).rows[0];
    if (!r) return reply.code(404).send({ error: 'Rubrique introuvable' });
    req.auditSummary = `Rubrique Kids « ${r.names.fr} » supprimée (les conférences sont conservées)`;
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Studio : classer les conférences
  app.get('/studio/kids/rubrics', manager, async () => (await pool.query('SELECT * FROM kid_rubrics ORDER BY position, id')).rows.map(rubricRow));

  // Droit sur une conférence : créateur, administrateur, propriétaire / éditeur de sa chaîne.
  async function mine(req, reply, id) {
    const t = (await pool.query('SELECT id, organizer_id, speaker FROM talks WHERE id = $1', [id])).rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub && !(await viaChannel(req.user, t)))) { reply.code(404).send({ error: 'Conférence introuvable' }); return null; }
    return t;
  }
  app.get('/studio/talks/:id/kid-rubrics', orgAdmin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await mine(req, reply, id))) return undefined;
    return { rubricIds: (await pool.query('SELECT rubric_id FROM talk_kid_rubrics WHERE talk_id = $1 ORDER BY rubric_id', [id])).rows.map((r) => r.rubric_id) };
  });
  const idsBody = z.object({ rubricIds: z.array(z.number().int().positive()).max(20) });
  app.put('/studio/talks/:id/kid-rubrics', orgAdmin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rubricIds } = idsBody.parse(req.body ?? {});
    if (!(await mine(req, reply, id))) return undefined;
    const ok = (await pool.query('SELECT id FROM kid_rubrics WHERE id = ANY($1::int[])', [rubricIds])).rows.map((r) => r.id);
    if (ok.length !== new Set(rubricIds).size) return reply.code(400).send({ error: 'Rubrique inconnue' });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM talk_kid_rubrics WHERE talk_id = $1', [id]);
      for (const r of ok) await c.query('INSERT INTO talk_kid_rubrics(talk_id, rubric_id) VALUES ($1, $2)', [id, r]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    req.auditSummary = `Conférence ${id} : rubriques Kids modifiées`;
    return { rubricIds: ok };
  });

  // En lot : { ids, rubricIds, mode: 'add' | 'replace' | 'remove' }.
  app.post('/studio/kids/rubrics/bulk', orgAdmin, async (req, reply) => {
    const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), rubricIds: z.array(z.number().int().positive()).max(20), mode: z.enum(['add', 'replace', 'remove']) }).parse(req.body ?? {});
    const talks = (await pool.query(
      'SELECT id FROM talks WHERE id = ANY($1::uuid[]) AND ($2::boolean OR organizer_id = $3 OR lower(trim(speaker)) = ANY($4::text[]))',
      [b.ids, req.user.role === 'admin', req.user.sub, await managedSpeakers(req.user.sub)])).rows.map((r) => r.id);
    if (talks.length !== new Set(b.ids).size) return reply.code(404).send({ error: 'Certaines conférences sont introuvables' });
    const ok = (await pool.query('SELECT id FROM kid_rubrics WHERE id = ANY($1::int[])', [b.rubricIds])).rows.map((r) => r.id);
    if (ok.length !== new Set(b.rubricIds).size) return reply.code(400).send({ error: 'Rubrique inconnue' });
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      if (b.mode === 'replace') await c.query('DELETE FROM talk_kid_rubrics WHERE talk_id = ANY($1::uuid[])', [talks]);
      if (b.mode === 'remove') await c.query('DELETE FROM talk_kid_rubrics WHERE talk_id = ANY($1::uuid[]) AND rubric_id = ANY($2::int[])', [talks, ok]);
      else for (const t of talks) for (const r of ok) await c.query('INSERT INTO talk_kid_rubrics(talk_id, rubric_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [t, r]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    req.auditSummary = `Rubriques Kids (${b.mode}) sur ${talks.length} conférence(s)`;
    return { updated: talks.length };
  });

  // ------------------------------------------------------------------ Enfant : catalogue
  const ctx = async (req, reply) => {
    const c = await app.kidContext(req);
    if (!c) { reply.code(401).send({ error: 'Session enfant expirée', code: 'kid_expired' }); return null; }
    return c;
  };
  const CARD = `t.id, t.title, t.speaker, t.access, t.source, t.kids_bands AS "kidsBands", t.duration_seconds AS "durationSeconds",
      t.poster_key, t.external_thumb, COALESCE(t.publish_at, t.created_at) AS "at",
      COALESCE(k.completed, false) AS completed, COALESCE(k.position_ms, 0) AS "positionMs",
      (SELECT COALESCE(array_agg(x.rubric_id ORDER BY x.rubric_id), '{}') FROM talk_kid_rubrics x JOIN kid_rubrics r ON r.id = x.rubric_id AND r.active WHERE x.talk_id = t.id) AS "rubricIds",
      (SELECT max(stars) FROM kid_quiz_attempts a WHERE a.profile_id = $1 AND a.talk_id = t.id) AS stars`;
  const BASE = `FROM talks t LEFT JOIN kid_progress k ON k.talk_id = t.id AND k.profile_id = $1
      WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 4)} AND ($3::boolean OR t.access = 'free')`;
  async function withPosters(rows) {
    for (const r of rows) { r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null); delete r.poster_key; delete r.external_thumb; delete r.at; delete r.pop; }
    return rows;
  }

  app.get('/kids/catalog', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    const time = await timeState(c.profile);
    const rubrics = (await pool.query('SELECT * FROM kid_rubrics WHERE active ORDER BY position, id')).rows;
    if (time.timeUp) return { rubrics: rubrics.map(rubricRow), shelves: [], talks: [], time };
    const open = await parentAllowed(c.parent.sub, c.parent.role);
    const { rows } = await pool.query(
      `SELECT ${CARD}, (SELECT count(DISTINCT p.profile_id)::int FROM kid_progress p WHERE p.talk_id = t.id AND p.updated_at > now() - interval '30 days') AS pop
         ${BASE} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT ${TALK_MAX}`,
      [c.profile.id, c.profile.band, open, c.profile.catalog_mode]);
    const shelves = [];
    const top = (list) => list.slice(0, 12).map((x) => x.id);
    const resume = rows.filter((r) => r.positionMs >= 5000 && !r.completed);
    if (resume.length) shelves.push({ kind: 'resume', ids: top(resume) });
    // « Parce que tu as aimé » : même rubrique que la dernière vidéo terminée, pas encore vue.
    const last = (await pool.query(
      `SELECT t.id, t.title FROM kid_progress k JOIN talks t ON t.id = k.talk_id WHERE k.profile_id = $1 AND k.completed ORDER BY k.updated_at DESC LIMIT 1`, [c.profile.id])).rows[0];
    if (last) {
      const rr = rows.find((x) => x.id === last.id)?.rubricIds
        || (await pool.query('SELECT rubric_id FROM talk_kid_rubrics WHERE talk_id = $1', [last.id])).rows.map((x) => x.rubric_id);
      const like = rows.filter((x) => x.id !== last.id && !x.completed && x.rubricIds.some((i) => rr.includes(i)));
      if (like.length) shelves.push({ kind: 'because', basedOn: { id: last.id, title: last.title }, ids: top(like) });
    }
    const mine = rows.filter((x) => x.kidsBands[0] === c.profile.band && !x.completed); // sa tranche est la plus basse de la vidéo : « pour ton âge »
    if (mine.length) shelves.push({ kind: 'age', ids: top(mine) });
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

  // ------------------------------------------------------------------ Enfant : recherche
  const searchQuery = z.object({ q: z.string().trim().min(1).max(80), rubric: z.coerce.number().int().positive().optional() });
  app.get('/kids/search', kidAuth, async (req, reply) => {
    if (await off(reply)) return undefined;
    const c = await ctx(req, reply); if (!c) return undefined;
    const p = searchQuery.parse(req.query);
    const time = await timeState(c.profile);
    if (time.timeUp) return { talks: [] };
    const open = await parentAllowed(c.parent.sub, c.parent.role);
    // Mots tapés, sans accents ni majuscules (registre n°47) ; comparés aux colonnes « repliées » de la même façon.
    const clean = [...new Set(fold(p.q).split(/\s+/).filter(Boolean))].slice(0, 5).map((w) => w.replace(/[\\%_]/g, '').slice(0, 40)).filter((w) => w.length > 0);
    const run = async (terms) => {
      const words = terms.map((w) => `%${w}%`).filter((w) => w.length > 2);
      if (!words.length) return [];
      const vals = [c.profile.id, c.profile.band, open, c.profile.catalog_mode];
      const conds = words.map((w) => {
        vals.push(w); const n = vals.length;
        return `(${foldSql('t.title')} LIKE $${n} OR ${foldSql("coalesce(t.speaker, '')")} LIKE $${n} OR ${foldSql("coalesce(t.description, '')")} LIKE $${n}
                 OR EXISTS (SELECT 1 FROM talk_kid_rubrics x JOIN kid_rubrics r ON r.id = x.rubric_id AND r.active WHERE x.talk_id = t.id AND ${foldSql('r.names::text')} LIKE $${n}))`;
      });
      if (p.rubric) { vals.push(p.rubric); conds.push(`EXISTS (SELECT 1 FROM talk_kid_rubrics x WHERE x.talk_id = t.id AND x.rubric_id = $${vals.length})`); }
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
