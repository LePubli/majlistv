// Rappels : bibliothèque indépendante des quiz (étape 24.6) et citations du corpus (versets, hadiths).
//   GET  /studio/reminders              toute la bibliothèque visible par l'utilisateur (filtres : origine, statut, recherche)
//   POST /studio/reminders              rappel libre saisi à la main (source obligatoire), sans conférence
//   GET  /admin/citations               état du corpus, de la génération et du stock
//   POST /admin/citations/import        (admin) importe le corpus depuis les dépôts publics
//   POST /admin/citations/generate      (admin) demande à l'IA de choisir des références (le texte vient du corpus)
//   POST /admin/citations/approve-all   (admin) valide d'un coup les brouillons du corpus
//   GET  /citation/today                citation du jour (publique), identique pour tout le monde
import { z } from 'zod';
import { pool } from '../../db.js';
import { shape } from '../../reminderFormat.js';
import { corpusStatus, startImport } from '../../corpus.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { TZ } from '../../revision.js';

const textSchema = z.string().trim().min(5).max(800);

// Stock de citations publiées (nombre) et état de la dernière demande de génération.
export async function citationStock() {
  const s = (await pool.query(
    `SELECT count(*) FILTER (WHERE status = 'approved')::int AS approved, count(*) FILTER (WHERE status = 'draft')::int AS draft
       FROM reminders WHERE origin = 'corpus'`)).rows[0];
  const job = (await pool.query('SELECT id, status, wanted, produced, dropped, error, updated_at FROM citation_jobs ORDER BY id DESC LIMIT 1')).rows[0] || null;
  return { ...s, job };
}

// Ajoute une demande de génération si aucune n'est en cours. Renvoie false sinon.
export async function enqueueCitations(wanted) {
  const busy = (await pool.query("SELECT 1 FROM citation_jobs WHERE status IN ('pending', 'processing') LIMIT 1")).rows.length;
  if (busy) return false;
  await pool.query('INSERT INTO citation_jobs(wanted) VALUES ($1)', [wanted]);
  return true;
}

// Génération automatique : appelée toutes les heures. Réapprovisionne quand le stock publié passe sous le minimum.
export async function autoTopUp() {
  if (!isOn(await getSetting('citations_auto'))) return;
  const corpus = (await pool.query("SELECT status, items FROM corpus_import WHERE id = 1")).rows[0];
  if (corpus.status !== 'ready' || !corpus.items) return;
  const st = await citationStock();
  const min = await getNumber('citations_min_stock');
  // En mode « validation humaine », les brouillons en attente comptent dans le stock pour ne pas en redemander sans fin.
  const have = st.approved + (isOn(await getSetting('citations_review')) ? st.draft : 0);
  if (have >= min) return;
  if (st.job?.status === 'failed' && Date.now() - new Date(st.job.updated_at).getTime() < 6 * 3600 * 1000) return; // pas d'acharnement
  await enqueueCitations(Math.min(await getNumber('citations_per_run'), min - have));
}

export default async function citationRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const admin = { preHandler: app.requireRole('admin') };

  app.get('/studio/reminders', organizer, async (req) => {
    const q = z.object({
      origin: z.enum(['all', 'transcript', 'quiz', 'manual', 'corpus']).default('all'),
      status: z.enum(['all', 'draft', 'approved']).default('all'),
      q: z.string().trim().max(100).default(''),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).parse(req.query);
    const isAdmin = req.user.role === 'admin';
    const params = isAdmin ? [] : [req.user.sub];
    const where = [isAdmin ? 'true' : '((m.talk_id IS NOT NULL AND t.organizer_id = $1) OR (m.talk_id IS NULL AND m.origin <> \'corpus\' AND m.created_by = $1))'];
    if (q.origin !== 'all') { params.push(q.origin); where.push(`m.origin = $${params.length}`); }
    if (q.status !== 'all') { params.push(q.status); where.push(`m.status = $${params.length}`); }
    if (q.q) { params.push(`%${q.q.replace(/[%_\\]/g, '\\$&')}%`); where.push(`(m.text ILIKE $${params.length} OR m.attribution ILIKE $${params.length})`); }
    const sql = `FROM reminders m LEFT JOIN talks t ON t.id = m.talk_id WHERE ${where.join(' AND ')}`;
    const per = 30;
    const [list, total] = await Promise.all([
      pool.query(`SELECT m.*, t.title AS talk_title ${sql} ORDER BY m.status, m.created_at DESC LIMIT ${per} OFFSET ${(q.page - 1) * per}`, params),
      pool.query(`SELECT count(*)::int AS n ${sql}`, params),
    ]);
    return { reminders: list.rows.map(shape), total: total.rows[0].n, page: q.page, perPage: per };
  });

  // Rappel libre : un passage saisi à la main (hadith, verset, citation) avec sa source obligatoire. Arrive en brouillon.
  const freeBody = z.object({ text: textSchema, textAr: z.string().trim().max(1600).default(''), attribution: z.string().trim().min(3).max(300), lang: z.string().trim().min(2).max(10).default('fr') });
  app.post('/studio/reminders', organizer, async (req, reply) => {
    const b = freeBody.parse(req.body ?? {});
    const { rows } = await pool.query(
      `INSERT INTO reminders(talk_id, lang, text, text_ar, origin, attribution, created_by) VALUES (NULL, $1, $2, $3, 'manual', $4, $5) RETURNING *`,
      [b.lang, b.text, b.textAr, b.attribution, req.user.sub]);
    return reply.code(201).send(shape(rows[0]));
  });

  app.get('/admin/citations', admin, async () => {
    const [corpus, stock] = await Promise.all([corpusStatus(), citationStock()]);
    return { corpus, stock, auto: isOn(await getSetting('citations_auto')), review: isOn(await getSetting('citations_review')), minStock: await getNumber('citations_min_stock') };
  });

  app.post('/admin/citations/import', admin, async (req, reply) => {
    const started = await startImport(req.log);
    if (!started) return reply.code(409).send({ error: 'Un import est déjà en cours', code: 'busy' });
    return reply.code(202).send({ ok: true });
  });

  app.post('/admin/citations/generate', admin, async (req, reply) => {
    const b = z.object({ count: z.number().int().min(1).max(50).optional() }).parse(req.body ?? {});
    const c = (await pool.query("SELECT status, items FROM corpus_import WHERE id = 1")).rows[0];
    if (c.status !== 'ready' || !c.items) return reply.code(409).send({ error: "Importez d'abord le corpus", code: 'no_corpus' });
    const ok = await enqueueCitations(b.count ?? (await getNumber('citations_per_run')));
    if (!ok) return reply.code(409).send({ error: 'Une génération est déjà en cours', code: 'busy' });
    return reply.code(202).send({ ok: true });
  });

  app.post('/admin/citations/approve-all', admin, async () => {
    const { rowCount } = await pool.query("UPDATE reminders SET status = 'approved', approved_at = now() WHERE origin = 'corpus' AND status = 'draft'");
    return { approved: rowCount };
  });

  // Citation du jour : publique et identique pour tous. On parcourt les citations publiées dans l'ordre, une par jour.
  app.get('/citation/today', async (req, reply) => {
    const { rows } = await pool.query(
      `WITH pool AS (SELECT id, text, text_ar, attribution, row_number() OVER (ORDER BY approved_at, id) - 1 AS n, count(*) OVER () AS total
                       FROM reminders WHERE origin = 'corpus' AND status = 'approved')
       SELECT id, text, text_ar AS "textAr", attribution FROM pool
        WHERE n = ((now() AT TIME ZONE '${TZ}')::date - DATE '2024-01-01') % total`);
    reply.header('cache-control', 'public, max-age=300');
    return rows[0] || null;
  });
}
