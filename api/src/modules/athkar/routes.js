// Adhkar (étape 45D) — formule Apprentissage.
//   GET  /athkar?lang=fr              membre : dhikr publiés avec le compte du jour, objectif, série, rappel
//   POST /athkar/:id/tap  { n }       membre : ajoute n (1 à 1000) au compte du jour
//   POST /athkar/:id/reset            membre : remet le compte du jour à zéro
//   PUT  /athkar/prefs { goal, remindHour }   membre : objectif du jour et heure du rappel (null = aucun)
//   GET/POST /admin/athkar, PUT/DELETE /admin/athkar/:id, POST /admin/athkar/import, POST /admin/athkar/bulk, POST /admin/athkar/restore-provided   administrateur
import { z } from 'zod';
import { pool } from '../../db.js';
import { hasLearningTier } from '../../access.js';
import { BULK_ACTIONS, LABELS, bulkIds, runBulk } from '../../bulk.js';
import { restoreProvided } from './provided.js';
import { CATEGORIES, THEMES, MAX_COUNT, themeFor, doneByDay, nowDate, prefsOf, published, streakOf, today } from './lib.js';

const itemSchema = z.object({
  category: z.enum(CATEGORIES), textAr: z.string().trim().min(2).max(4000), translit: z.string().trim().max(4000).default(''),
  trFr: z.string().trim().max(4000).default(''), trEn: z.string().trim().max(4000).default(''),
  theme: z.enum(THEMES).optional(), reviewNote: z.string().trim().max(1000).default(''),
  reference: z.string().trim().min(3, 'La référence (source) est obligatoire.').max(500),
  target: z.number().int().min(1).max(1000).default(1), position: z.number().int().min(0).max(10000).default(0),
  validated: z.boolean().default(false), enabled: z.boolean().default(false),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const adminRow = (r) => ({
  id: r.id, category: r.category, textAr: r.text_ar, translit: r.translit, trFr: r.tr_fr, trEn: r.tr_en, reference: r.reference, target: r.target, theme: r.theme, reviewNote: r.review_note,
  position: r.position, enabled: r.enabled, validated: Boolean(r.reviewed_at), reviewedAt: r.reviewed_at,
});

export default async function athkarRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const adminOnly = { preHandler: app.requireRole('admin') };
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });
  const gate = async (req, reply) => { if (!(await hasLearningTier(req.user.sub))) { required(reply); return false; } return true; };
  const itemOf = async (id) => (await pool.query('SELECT * FROM athkar_items WHERE id = $1 AND enabled AND reviewed_at IS NOT NULL', [id])).rows[0];

  app.get('/athkar', auth, async (req, reply) => {
    if (!(await gate(req, reply))) return undefined;
    const l = String(req.query?.lang || 'fr').slice(0, 2);
    const day = today();
    const items = await published();
    const counts = new Map((await pool.query('SELECT item_id, count FROM athkar_counts WHERE user_id = $1 AND day = $2', [req.user.sub, day])).rows.map((r) => [r.item_id, r.count]));
    const prefs = await prefsOf(req.user.sub);
    const byDay = await doneByDay(req.user.sub);
    return {
      today: day, goal: prefs.goal, remindHour: prefs.remindHour, doneToday: byDay.get(day) || 0, streak: streakOf(byDay, prefs.goal, day), total: items.length,
      items: items.map((i) => ({
        id: i.id, category: i.category, theme: i.theme, ar: i.text_ar, translit: i.translit, tr: l === 'en' ? (i.tr_en || i.tr_fr) : l === 'ar' ? '' : (i.tr_fr || i.tr_en),
        reference: i.reference, target: i.target, count: counts.get(i.id) || 0,
      })),
    };
  });

  app.post('/athkar/:id/tap', auth, async (req, reply) => {
    if (!(await gate(req, reply))) return undefined;
    const { id } = idSchema.parse(req.params);
    const { n } = z.object({ n: z.number().int().min(1).max(1000).default(1) }).parse(req.body ?? {});
    if (!(await itemOf(id))) return reply.code(404).send({ error: 'Dhikr introuvable.' });
    const { rows } = await pool.query(
      `INSERT INTO athkar_counts(user_id, item_id, day, count) VALUES ($1, $2, $3::date, LEAST($4::int, $5::int))
       ON CONFLICT (user_id, item_id, day) DO UPDATE SET count = LEAST(athkar_counts.count + EXCLUDED.count, $5::int) RETURNING count`,
      [req.user.sub, id, today(), n, MAX_COUNT]);
    return { count: rows[0].count };
  });

  app.post('/athkar/:id/reset', auth, async (req, reply) => {
    if (!(await gate(req, reply))) return undefined;
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM athkar_counts WHERE user_id = $1 AND item_id = $2 AND day = $3', [req.user.sub, id, today()]);
    return { count: 0 };
  });

  app.put('/athkar/prefs', auth, async (req, reply) => {
    if (!(await gate(req, reply))) return undefined;
    const b = z.object({ goal: z.number().int().min(1).max(100), remindHour: z.number().int().min(0).max(23).nullable() }).parse(req.body ?? {});
    await pool.query(
      `INSERT INTO athkar_prefs(user_id, daily_goal, remind_hour) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET daily_goal = $2, remind_hour = $3, updated_at = now()`, [req.user.sub, b.goal, b.remindHour]);
    return { goal: b.goal, remindHour: b.remindHour };
  });

  // ---- Administration ----------------------------------------------------------------------------------------------------------
  app.get('/admin/athkar', adminOnly, async () => ({ items: (await pool.query('SELECT * FROM athkar_items ORDER BY position, id')).rows.map(adminRow), categories: CATEGORIES, themes: THEMES }));

  const save = async (req, reply, id) => {
    const b = itemSchema.parse(req.body ?? {});
    if (b.enabled && !b.validated) return reply.code(400).send({ error: 'Validez d\'abord ce dhikr (relu par une personne qualifiée) avant de l\'afficher.' });
    const vals = [b.category, b.textAr, b.translit, b.trFr, b.trEn, b.reference, b.target, b.position, b.enabled, b.validated, req.user.sub, b.theme || themeFor(b.category, b.position), b.reviewNote];
    const sql = id
      ? `UPDATE athkar_items SET category=$1, text_ar=$2, translit=$3, tr_fr=$4, tr_en=$5, reference=$6, target=$7, position=$8, enabled=$9,
                reviewed_at = CASE WHEN $10 THEN COALESCE(reviewed_at, now()) ELSE NULL END,
                reviewed_by = CASE WHEN $10 THEN COALESCE(reviewed_by, $11::uuid) ELSE NULL END, theme=$12, review_note=$13, updated_at=now() WHERE id=$14 RETURNING *`
      : `INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled, reviewed_at, reviewed_by, theme, review_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $10 THEN now() END, CASE WHEN $10 THEN $11::uuid END, $12, $13) RETURNING *`;
    const { rows } = await pool.query(sql, id ? [...vals, id] : vals);
    if (!rows.length) return reply.code(404).send({ error: 'Dhikr introuvable.' });
    req.auditSummary = `Adhkar : dhikr n° ${rows[0].id} ${id ? 'modifié' : 'créé'}${b.validated ? ' (validé)' : ''}${b.enabled ? ', affiché' : ''}`;
    return adminRow(rows[0]);
  };
  app.post('/admin/athkar', adminOnly, (req, reply) => save(req, reply, null));
  app.put('/admin/athkar/:id', adminOnly, (req, reply) => save(req, reply, idSchema.parse(req.params).id));

  app.delete('/admin/athkar/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM athkar_items WHERE id = $1 RETURNING id', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Dhikr introuvable.' });
    req.auditSummary = `Adhkar : dhikr n° ${id} supprimé`;
    return { ok: true };
  });

  // Actions en lot : valider, valider et afficher, afficher, masquer, dé-valider, supprimer, modifier le moment ou les répétitions.
  const bulkSchema = z.object({
    ids: bulkIds, action: z.enum(BULK_ACTIONS),
    set: z.object({ category: z.enum(CATEGORIES).optional(), theme: z.enum(THEMES).optional(), target: z.number().int().min(1).max(1000).optional() }).optional(),
  });
  app.post('/admin/athkar/bulk', adminOnly, async (req, reply) => {
    const b = bulkSchema.parse(req.body ?? {});
    const set = {}; if (b.set?.category) set.category = b.set.category; if (b.set?.theme) set.theme = b.set.theme; if (b.set?.target) set.target = b.set.target;
    if (b.action === 'update' && !Object.keys(set).length) return reply.code(400).send({ error: 'Choisissez le moment, le thème ou le nombre de répétitions à appliquer.' });
    const out = await runBulk({ table: 'athkar_items', ids: b.ids, action: b.action, userId: req.user.sub, set });
    req.auditSummary = `Adhkar : ${out.done} dhikr ${LABELS[b.action]} en lot${out.skipped ? ` (${out.skipped} ignorés)` : ''}`;
    return out;
  });

  // Restaurer les dhikr fournis (74 à ce jour) : ceux qui manquent sont réinsérés NON validés et NON affichés ; aucun doublon.
  app.post('/admin/athkar/restore-provided', adminOnly, async (req) => {
    const out = await restoreProvided();
    req.auditSummary = `Adhkar : ${out.created} dhikr fournis restaurés (non validés)`;
    return out;
  });

  // Import en lot (JSON) : chaque dhikr arrive NON validé et NON affiché ; on le relit puis on le valide un par un.
  app.post('/admin/athkar/import', { ...adminOnly, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const { items } = z.object({ items: z.array(z.any()).min(1).max(2000) }).parse(req.body ?? {});
    let created = 0; const errors = [];
    for (const [i, raw] of items.entries()) {
      const p = itemSchema.safeParse({ ...raw, validated: false, enabled: false, target: raw?.target === undefined ? 1 : Number(raw.target), position: raw?.position === undefined ? i : Number(raw.position) });
      if (!p.success) { errors.push(`n° ${i + 1} : ${p.error.issues.map((x) => x.message).join(', ')}`); continue; }
      const b = p.data;
      await pool.query('INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, theme, review_note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [b.category, b.textAr, b.translit, b.trFr, b.trEn, b.reference, b.target, b.position, b.theme || themeFor(b.category, b.position), b.reviewNote]);
      created++;
    }
    if (!created) return reply.code(400).send({ error: 'Aucun dhikr importé.', errors: errors.slice(0, 20) });
    req.auditSummary = `Adhkar : ${created} dhikr importés (non validés)`;
    return { created, errors: errors.slice(0, 20) };
  });
}
