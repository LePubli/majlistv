// Catégories automatiques (étape « suggérer ») :
//  • Analyse : service translator (IA) — il lit la transcription (ou, à défaut, le résumé ou le titre) et propose 1 à 3 catégories
//    PARMI CELLES QUI EXISTENT, avec une confiance et une justification.
//  • Studio (organisateur, modérateur, administrateur) : lancer l'analyse d'une vidéo, valider ou refuser chaque proposition.
//  • Vidéos Kids : propositions parmi les univers et thèmes Kids (ajoutés en catégories supplémentaires) ; vidéo mixte : les deux catalogues.
//  • Administration : bouton de rattrapage « analyser les vidéos sans catégorie » (par lots).
// Une proposition validée S'AJOUTE : catégorie principale si la vidéo n'en a pas, sinon catégorie supplémentaire. Rien n'est jamais remplacé.
import { z } from 'zod';
import { pool } from '../../db.js';
import { viaChannel } from '../../channelAccess.js';

const idSchema = z.object({ id: z.guid() });
const sidSchema = z.object({ sid: z.guid() });
const STAFF = new Set(['admin', 'moderator']);
const BATCH = 100;

export default async function autocatRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const adminOnly = { preHandler: app.requireRole('admin') };
  const sourceOf = (t) => t.transcript_language || t.language;

  async function ownedTalk(req, reply, id) {
    const { rows } = await pool.query('SELECT id, organizer_id, title, transcript_status, transcript_language, language, show_adults, cardinality(kids_bands) > 0 OR NOT show_adults AS kids FROM talks WHERE id = $1', [id]);
    const t = rows[0];
    if (!t || (!STAFF.has(req.user.role) && t.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) { reply.code(404).send({ error: 'Vidéo introuvable' }); return null; }
    return t;
  }

  const SUGG = `SELECT s.id, s.talk_id AS "talkId", s.category_id AS "categoryId", n.name AS category, s.confidence, s.reason, s.status
                  FROM talk_category_suggestions s JOIN category_names n ON n.id = s.category_id`;

  // État d'une vidéo : analyse en cours, propositions, catégories actuelles.
  app.get('/talks/:id/studio/categories-suggest', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const [job, sg, cur] = await Promise.all([
      pool.query('SELECT status, produced, basis, error, updated_at FROM category_jobs WHERE talk_id = $1', [id]),
      pool.query(`${SUGG} WHERE s.talk_id = $1 ORDER BY (s.status <> 'draft'), s.confidence DESC`, [id]),
      pool.query(`SELECT n.name FROM category_names n WHERE n.id = (SELECT category_id FROM talks WHERE id = $1)
                  OR n.id IN (SELECT category_id FROM talk_categories WHERE talk_id = $1) ORDER BY n.name`, [id]),
    ]);
    const j = job.rows[0];
    return {
      transcriptReady: t.transcript_status === 'ready', adult: t.show_adults !== false, kids: !!t.kids, current: cur.rows.map((r) => r.name),
      job: j ? { status: j.status, produced: j.produced, basis: j.basis, error: j.error, updatedAt: j.updated_at } : null,
      suggestions: sg.rows,
    };
  });

  // Lancer l'analyse (reprise par le service translator). Les propositions non traitées seront remplacées ; validées et refusées restent.
  app.post('/talks/:id/studio/categories-suggest/run', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const cur = (await pool.query('SELECT status FROM category_jobs WHERE talk_id = $1', [id])).rows[0];
    if (cur && ['pending', 'processing'].includes(cur.status)) return reply.code(409).send({ error: 'Une analyse est déjà en cours', code: 'busy' });
    await pool.query(
      `INSERT INTO category_jobs(talk_id, lang, status) VALUES ($1, $2, 'pending')
       ON CONFLICT (talk_id) DO UPDATE SET lang = EXCLUDED.lang, status = 'pending', produced = 0, basis = '', error = NULL, attempts = 0, created_at = now(), updated_at = now()`,
      [id, sourceOf(t)]);
    return reply.code(202).send({ ok: true });
  });

  // Valider : la catégorie est ajoutée à la vidéo.
  app.post('/studio/categories-suggest/:sid/accept', organizer, async (req, reply) => {
    const { sid } = sidSchema.parse(req.params);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const s = (await c.query('SELECT * FROM talk_category_suggestions WHERE id = $1 FOR UPDATE', [sid])).rows[0];
      if (!s) { await c.query('ROLLBACK'); return reply.code(404).send({ error: 'Proposition introuvable' }); }
      const t = await ownedTalk(req, reply, s.talk_id);
      if (!t) { await c.query('ROLLBACK'); return; }
      if (s.status === 'approved') { await c.query('ROLLBACK'); return { ok: true, already: true }; }
      // La catégorie doit exister, être active et appartenir à un catalogue où la vidéo est présente (adultes et/ou Kids).
      const cat = (await c.query('SELECT catalogue_type FROM categories WHERE id = $1 AND is_active', [s.category_id])).rows[0];
      const talk = (await c.query('SELECT category_id, show_adults, cardinality(kids_bands) > 0 OR NOT show_adults AS kids FROM talks WHERE id = $1 FOR UPDATE', [s.talk_id])).rows[0];
      if (!cat || (cat.catalogue_type === 'adult' ? !talk.show_adults : !talk.kids)) { await c.query('ROLLBACK'); return reply.code(409).send({ error: "Cette catégorie n'existe plus, n'est plus active ou ne correspond plus au public de la vidéo", code: 'gone' }); }
      let placed;
      // Kids : toujours en catégorie supplémentaire (comme le classement Kids de l'administration), jamais en catégorie principale.
      if (cat.catalogue_type === 'kids' && talk.category_id !== s.category_id) { await c.query('INSERT INTO talk_categories(talk_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.talk_id, s.category_id]); placed = 'extra'; }
      else if (talk.category_id == null) { await c.query('UPDATE talks SET category_id = $2 WHERE id = $1', [s.talk_id, s.category_id]); placed = 'main'; }
      else if (talk.category_id === s.category_id) placed = 'main';
      else { await c.query('INSERT INTO talk_categories(talk_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.talk_id, s.category_id]); placed = 'extra'; }
      await c.query(`UPDATE talk_category_suggestions SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [sid, req.user.sub]);
      await c.query('COMMIT');
      return { ok: true, placed };
    } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
  });

  app.post('/studio/categories-suggest/:sid/reject', organizer, async (req, reply) => {
    const { sid } = sidSchema.parse(req.params);
    const s = (await pool.query('SELECT talk_id FROM talk_category_suggestions WHERE id = $1', [sid])).rows[0];
    if (!s) return reply.code(404).send({ error: 'Proposition introuvable' });
    if (!(await ownedTalk(req, reply, s.talk_id))) return;
    await pool.query(`UPDATE talk_category_suggestions SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [sid, req.user.sub]);
    return { ok: true };
  });

  // File de relecture : toutes les propositions à valider (celles de l'organisateur ; toutes pour un modérateur ou un administrateur).
  app.get('/studio/categories-suggest/review', organizer, async (req) => {
    const { rows } = await pool.query(
      `${SUGG.replace('s.talk_id AS "talkId"', 's.talk_id AS "talkId", t.title AS "talkTitle"')} JOIN talks t ON t.id = s.talk_id
        WHERE s.status = 'draft' AND ($1::boolean OR t.organizer_id = $2)
        ORDER BY t.title, s.talk_id, s.confidence DESC LIMIT 400`, [STAFF.has(req.user.role), req.user.sub]);
    return { suggestions: rows };
  });

  // Administration : état et rattrapage.
  app.get('/admin/categories-suggest/stats', adminOnly, async () => {
    const [todo, jobs, drafts] = await Promise.all([
      pool.query(`SELECT count(*)::int AS n FROM talks t WHERE t.category_id IS NULL AND NOT EXISTS (SELECT 1 FROM talk_categories x WHERE x.talk_id = t.id) AND t.video_status = 'ready'
                    AND NOT EXISTS (SELECT 1 FROM category_jobs j WHERE j.talk_id = t.id)`),
      pool.query(`SELECT status, count(*)::int AS n FROM category_jobs GROUP BY status`),
      pool.query(`SELECT count(*)::int AS n FROM talk_category_suggestions WHERE status = 'draft'`),
    ]);
    return { withoutCategory: todo.rows[0].n, jobs: Object.fromEntries(jobs.rows.map((r) => [r.status, r.n])), drafts: drafts.rows[0].n, batch: BATCH };
  });

  app.post('/admin/categories-suggest/backfill', adminOnly, async () => { // inscrit au journal d'audit par le mécanisme général
    const r = await pool.query(
      `INSERT INTO category_jobs(talk_id, lang) SELECT t.id, COALESCE(t.transcript_language, t.language) FROM talks t
        WHERE t.category_id IS NULL AND NOT EXISTS (SELECT 1 FROM talk_categories x WHERE x.talk_id = t.id) AND t.video_status = 'ready'
          AND NOT EXISTS (SELECT 1 FROM category_jobs j WHERE j.talk_id = t.id)
        ORDER BY t.created_at DESC LIMIT ${BATCH} ON CONFLICT DO NOTHING`);
    return { queued: r.rowCount };
  });
}
