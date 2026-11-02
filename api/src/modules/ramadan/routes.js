// Circuit de Ramadan (étape 45F) — gratuit pour tout membre connecté.
//   GET  /ramadan?lang=fr                 public : état du mois, actions des 30 jours ; connecté : mes cases, mes tarawih, mon rappel
//   PUT  /ramadan/mark {day, itemId, done}            membre : cocher une action (pendant Ramadan, jour passé ou du jour)
//   PUT  /ramadan/tarawih {day, done, rakaat?, place?} membre : tarawih de la nuit n
//   PUT  /ramadan/prefs {remindHour|null}             membre : rappel quotidien (Paris)
//   GET/POST /admin/ramadan/items, PUT/DELETE /admin/ramadan/items/:id, POST /admin/ramadan/import   administrateur
import { z } from 'zod';
import { pool } from '../../db.js';
import { itemsOfDay, lang, publicItem, publishedItems, ramadanStatus } from './lib.js';

const trio = (max) => z.object({ fr: z.string().trim().max(max).default(''), en: z.string().trim().max(max).default(''), ar: z.string().trim().max(max).default('') });
const itemSchema = z.object({
  audience: z.enum(['adult', 'kid']).default('adult'),
  day: z.number().int().min(0).max(30), title: trio(200), text: trio(2000),
  link: z.string().trim().max(300).regex(/^(\/[^\s]*)?$/, 'Lien : une page du site commençant par / (ou vide).').default(''),
  reference: z.string().trim().max(500).default(''), position: z.number().int().min(0).max(10000).default(0),
  validated: z.boolean().default(false), enabled: z.boolean().default(false),
}).refine((b) => b.title.fr || b.title.en || b.title.ar, { message: 'Donnez au moins un titre.', path: ['title'] });
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const adminRow = (r) => ({
  id: r.id, audience: r.audience, day: r.day, title: { fr: r.title_fr, en: r.title_en, ar: r.title_ar }, text: { fr: r.text_fr, en: r.text_en, ar: r.text_ar },
  link: r.link, reference: r.reference, position: r.position, enabled: r.enabled, validated: Boolean(r.reviewed_at),
});

export default async function ramadanRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/ramadan', async (req) => {
    const l = lang(req.query?.lang);
    const st = await ramadanStatus();
    const items = (await publishedItems()).map((r) => publicItem(r, l));
    const out = { status: st, everyDay: items.filter((i) => i.day === 0), days: Array.from({ length: 30 }, (_, k) => ({ day: k + 1, items: items.filter((i) => i.day === k + 1) })) };
    const viewer = await app.optionalUser(req);
    if (viewer && st.hyear) {
      const marks = (await pool.query('SELECT day, item_id FROM ramadan_marks WHERE user_id = $1 AND hyear = $2', [viewer.sub, st.hyear])).rows;
      const tw = (await pool.query('SELECT day, rakaat, place FROM ramadan_tarawih WHERE user_id = $1 AND hyear = $2', [viewer.sub, st.hyear])).rows;
      const pr = (await pool.query('SELECT remind_hour FROM ramadan_prefs WHERE user_id = $1', [viewer.sub])).rows[0];
      out.me = {
        marks: marks.reduce((m, r) => ({ ...m, [r.day]: [...(m[r.day] || []), r.item_id] }), {}),
        tarawih: Object.fromEntries(tw.map((r) => [r.day, { rakaat: r.rakaat, place: r.place }])),
        remindHour: pr?.remind_hour ?? null,
      };
    }
    return out;
  });

  // Cocher : seulement pendant Ramadan, pour un jour déjà commencé (rattrapage permis, pas d'avance).
  const dayOk = async (reply, day) => {
    const st = await ramadanStatus();
    if (!st.active) { reply.code(409).send({ error: 'Le circuit ne se coche que pendant Ramadan.' }); return null; }
    if (day > st.day) { reply.code(400).send({ error: 'Ce jour n’est pas encore arrivé.' }); return null; }
    return st;
  };

  app.put('/ramadan/mark', auth, async (req, reply) => {
    const b = z.object({ day: z.number().int().min(1).max(30), itemId: z.number().int().positive(), done: z.boolean() }).parse(req.body ?? {});
    const st = await dayOk(reply, b.day); if (!st) return undefined;
    if (!itemsOfDay(await publishedItems(), b.day).some((i) => i.id === b.itemId)) return reply.code(404).send({ error: 'Action introuvable pour ce jour.' });
    if (b.done) await pool.query('INSERT INTO ramadan_marks(user_id, hyear, day, item_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [req.user.sub, st.hyear, b.day, b.itemId]);
    else await pool.query('DELETE FROM ramadan_marks WHERE user_id = $1 AND hyear = $2 AND day = $3 AND item_id = $4', [req.user.sub, st.hyear, b.day, b.itemId]);
    return { ok: true };
  });

  app.put('/ramadan/tarawih', auth, async (req, reply) => {
    const b = z.object({ day: z.number().int().min(1).max(30), done: z.boolean(), rakaat: z.number().int().min(2).max(40).nullable().optional(), place: z.enum(['mosque', 'home']).nullable().optional() }).parse(req.body ?? {});
    const st = await dayOk(reply, b.day); if (!st) return undefined;
    if (!b.done) await pool.query('DELETE FROM ramadan_tarawih WHERE user_id = $1 AND hyear = $2 AND day = $3', [req.user.sub, st.hyear, b.day]);
    else await pool.query(
      `INSERT INTO ramadan_tarawih(user_id, hyear, day, rakaat, place) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, hyear, day) DO UPDATE SET rakaat = $4, place = $5, updated_at = now()`, [req.user.sub, st.hyear, b.day, b.rakaat ?? null, b.place ?? null]);
    return { ok: true };
  });

  app.put('/ramadan/prefs', auth, async (req) => {
    const { remindHour } = z.object({ remindHour: z.number().int().min(0).max(23).nullable() }).parse(req.body ?? {});
    await pool.query('INSERT INTO ramadan_prefs(user_id, remind_hour) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET remind_hour = $2, updated_at = now()', [req.user.sub, remindHour]);
    return { remindHour };
  });

  // ---- Enfants (45F2) : l'enfant dit « je l'ai fait », le parent valide ; jamais de comparaison entre enfants -------------------
  const kidAuth = { preHandler: app.authenticate, config: { kidOk: true } };
  const kidMarks = async (profileId, hyear) => (await pool.query(
    'SELECT day, item_id, status FROM ramadan_kid_marks WHERE profile_id = $1 AND hyear = $2', [profileId, hyear])).rows;

  app.get('/kids/ramadan', kidAuth, async (req, reply) => {
    const c = await app.kidContext(req);
    if (!c) return reply.code(401).send({ error: 'Session enfant expirée', code: 'kid_expired' });
    const st = await ramadanStatus();
    if (!st.active) return { status: st, items: [], validated: 0 };
    const l = lang(c.locale || req.query?.lang);
    const items = itemsOfDay(await publishedItems('kid'), st.day).map((r) => publicItem(r, l));
    const marks = await kidMarks(c.profile.id, st.hyear);
    const today = new Map(marks.filter((m) => m.day === st.day).map((m) => [m.item_id, m.status]));
    return { status: st, items: items.map((i) => ({ ...i, state: today.get(i.id) || 'todo' })), validated: marks.filter((m) => m.status === 'validated').length };
  });

  app.post('/kids/ramadan/claim', kidAuth, async (req, reply) => {
    const c = await app.kidContext(req);
    if (!c) return reply.code(401).send({ error: 'Session enfant expirée', code: 'kid_expired' });
    const b = z.object({ itemId: z.number().int().positive() }).parse(req.body ?? {});
    const st = await ramadanStatus();
    if (!st.active) return reply.code(409).send({ error: 'Le circuit ne se coche que pendant Ramadan.' });
    if (!itemsOfDay(await publishedItems('kid'), st.day).some((i) => i.id === b.itemId)) return reply.code(404).send({ error: 'Action introuvable pour aujourd’hui.' });
    await pool.query(
      `INSERT INTO ramadan_kid_marks(profile_id, hyear, day, item_id, status, claimed_at) VALUES ($1,$2,$3,$4,'claimed',now()) ON CONFLICT DO NOTHING`,
      [c.profile.id, st.hyear, st.day, b.itemId]);
    return { ok: true };
  });

  const ownKid = async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const p = (await pool.query('SELECT id, name FROM kid_profiles WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!p) { reply.code(404).send({ error: 'Profil introuvable' }); return null; }
    return p;
  };
  // Parent : actions dites « faites » par l'enfant (et celles de ses jours de Ramadan), validation.
  app.get('/me/kids/profiles/:id/ramadan', auth, async (req, reply) => {
    const p = await ownKid(req, reply); if (!p) return undefined;
    const st = await ramadanStatus();
    if (!st.active) return { status: st, days: [] };
    const l = lang(req.query?.lang);
    const items = await publishedItems('kid');
    const marks = await kidMarks(p.id, st.hyear);
    const by = new Map(marks.map((m) => [`${m.day}:${m.item_id}`, m.status]));
    const days = [];
    for (let d = st.day; d >= Math.max(1, st.day - 6); d--) {
      days.push({ day: d, items: itemsOfDay(items, d).map((r) => ({ ...publicItem(r, l), state: by.get(`${d}:${r.id}`) || 'todo' })) });
    }
    return { status: st, days };
  });

  app.post('/me/kids/profiles/:id/ramadan/validate', auth, async (req, reply) => {
    const p = await ownKid(req, reply); if (!p) return undefined;
    const b = z.object({ day: z.number().int().min(1).max(30), itemId: z.number().int().positive() }).parse(req.body ?? {});
    const st = await ramadanStatus();
    if (!st.active) return reply.code(409).send({ error: 'Le circuit ne se valide que pendant Ramadan.' });
    if (b.day > st.day) return reply.code(400).send({ error: 'Ce jour n’est pas encore arrivé.' });
    if (!itemsOfDay(await publishedItems('kid'), b.day).some((i) => i.id === b.itemId)) return reply.code(404).send({ error: 'Action introuvable pour ce jour.' });
    await pool.query(
      `INSERT INTO ramadan_kid_marks(profile_id, hyear, day, item_id, status, validated_at) VALUES ($1,$2,$3,$4,'validated',now())
       ON CONFLICT (profile_id, hyear, day, item_id) DO UPDATE SET status = 'validated', validated_at = now()`, [p.id, st.hyear, b.day, b.itemId]);
    return { ok: true };
  });

  // ---- Administration ----------------------------------------------------------------------------------------------------------
  app.get('/admin/ramadan/items', adminOnly, async () => ({
    status: await ramadanStatus(), items: (await pool.query('SELECT * FROM ramadan_items ORDER BY audience, day, position, id')).rows.map(adminRow),
  }));

  const save = async (req, reply, id) => {
    const b = itemSchema.parse(req.body ?? {});
    if (b.enabled && !b.validated) return reply.code(400).send({ error: 'Validez d’abord cette action (relue par une personne qualifiée) avant de l’afficher.' });
    const v = [b.day, b.title.fr, b.title.en, b.title.ar, b.text.fr, b.text.en, b.text.ar, b.link, b.reference, b.position, b.enabled, b.validated, req.user.sub, b.audience];
    const sql = id
      ? `UPDATE ramadan_items SET day=$1, title_fr=$2, title_en=$3, title_ar=$4, text_fr=$5, text_en=$6, text_ar=$7, link=$8, reference=$9, position=$10, enabled=$11,
                reviewed_at = CASE WHEN $12 THEN COALESCE(reviewed_at, now()) ELSE NULL END,
                reviewed_by = CASE WHEN $12 THEN COALESCE(reviewed_by, $13::uuid) ELSE NULL END, audience = $14, updated_at = now()
          WHERE id = $15 RETURNING *`
      : `INSERT INTO ramadan_items(day, title_fr, title_en, title_ar, text_fr, text_en, text_ar, link, reference, position, enabled, reviewed_at, reviewed_by, audience)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $12 THEN now() END, CASE WHEN $12 THEN $13::uuid END, $14) RETURNING *`;
    const { rows } = await pool.query(sql, id ? [...v, id] : v);
    if (!rows.length) return reply.code(404).send({ error: 'Action introuvable.' });
    req.auditSummary = `Ramadan${b.audience === 'kid' ? ' (enfants)' : ''} : action n° ${rows[0].id} (jour ${b.day || 'chaque jour'}) ${id ? 'modifiée' : 'créée'}${b.validated ? ', validée' : ''}${b.enabled ? ', affichée' : ''}`;
    return adminRow(rows[0]);
  };
  app.post('/admin/ramadan/items', adminOnly, (req, reply) => save(req, reply, null));
  app.put('/admin/ramadan/items/:id', adminOnly, (req, reply) => save(req, reply, idSchema.parse(req.params).id));

  app.delete('/admin/ramadan/items/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query("DELETE FROM ramadan_items WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Action introuvable.' });
    req.auditSummary = `Ramadan : action n° ${id} supprimée`;
    return { ok: true };
  });

  // Import en lot : chaque action arrive NON validée et NON affichée.
  app.post('/admin/ramadan/import', { ...adminOnly, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const { items } = z.object({ items: z.array(z.any()).min(1).max(2000) }).parse(req.body ?? {});
    let created = 0; const errors = [];
    for (const [i, raw] of items.entries()) {
      const p = itemSchema.safeParse({
        audience: raw?.audience === 'kid' ? 'kid' : 'adult', day: Number(raw?.day), title: { fr: raw?.title?.fr ?? raw?.titleFr ?? '', en: raw?.title?.en ?? raw?.titleEn ?? '', ar: raw?.title?.ar ?? raw?.titleAr ?? '' },
        text: { fr: raw?.text?.fr ?? raw?.textFr ?? '', en: raw?.text?.en ?? raw?.textEn ?? '', ar: raw?.text?.ar ?? raw?.textAr ?? '' },
        link: raw?.link ?? '', reference: raw?.reference ?? '', position: raw?.position === undefined ? i : Number(raw.position), validated: false, enabled: false,
      });
      if (!p.success) { errors.push(`n° ${i + 1} : ${p.error.issues.map((x) => x.message).join(', ')}`); continue; }
      const b = p.data;
      await pool.query('INSERT INTO ramadan_items(day, title_fr, title_en, title_ar, text_fr, text_en, text_ar, link, reference, position, audience) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [b.day, b.title.fr, b.title.en, b.title.ar, b.text.fr, b.text.en, b.text.ar, b.link, b.reference, b.position, b.audience]);
      created++;
    }
    if (!created) return reply.code(400).send({ error: 'Aucune action importée.', errors: errors.slice(0, 20) });
    req.auditSummary = `Ramadan : ${created} action(s) importée(s) (non validées)`;
    return { created, errors: errors.slice(0, 20) };
  });
}
