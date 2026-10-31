// Saisons (étape 45).
//   GET  /seasons/current?lang=fr       public : la saison en cours { title, text, collection, talks… } ou { season: null }
//   GET  /admin/seasons                 administrateur : date hégirienne du jour, les 4 saisons, leurs dates et réglages
//   PUT  /admin/seasons/:id             administrateur : active, collection, jours d'avance, textes, notification
//   POST /admin/seasons/:id/test-push   administrateur : envoie la notification de la saison à son propre compte
import { z } from 'zod';
import { pool } from '../../db.js';
import { pushToUser } from '../../push.js';
import { SEASONS, SEASON_IDS, hijriOf, seasonDef } from '../../hijri.js';
import { LANGS, allRows, lang, nowDate, offsetDays, publicSeason, stateOf, textOf, titleOf } from './lib.js';

const idSchema = z.object({ id: z.enum(SEASON_IDS) });
const trio = z.object({ fr: z.string().max(300).default(''), en: z.string().max(300).default(''), ar: z.string().max(300).default('') });
const bodySchema = z.object({
  enabled: z.boolean(), collectionId: z.string().uuid().nullable(), leadDays: z.number().int().min(0).max(60).nullable(),
  title: trio, text: trio, notify: z.boolean(),
});
const hijriText = (now, offset) => new Intl.DateTimeFormat('fr-u-ca-islamic-umalqura', { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(new Date(now.getTime() + offset * 86400000));

export default async function seasonsRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/seasons/current', async (req, reply) => {
    const { lang: l } = z.object({ lang: z.string().max(10).optional() }).parse(req.query);
    reply.header('cache-control', 'public, max-age=60');
    return { season: await publicSeason(lang(l)) };
  });

  app.get('/admin/seasons', adminOnly, async () => {
    const now = nowDate(); const offset = await offsetDays();
    const rows = Object.fromEntries((await allRows()).map((r) => [r.id, r]));
    const collections = (await pool.query('SELECT id, title, published FROM collections ORDER BY updated_at DESC LIMIT 200')).rows;
    return {
      today: { hijri: hijriOf(now, offset), text: hijriText(now, offset), date: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(now) },
      offset, collections,
      seasons: SEASONS.map((def) => {
        const r = rows[def.id];
        return {
          id: def.id, name: def.name.fr, enabled: r.enabled, collectionId: r.collection_id, leadDays: r.lead_days, defaultLead: def.lead,
          title: Object.fromEntries(LANGS.map((l) => [l, r[`title_${l}`]])), text: Object.fromEntries(LANGS.map((l) => [l, r[`text_${l}`]])),
          defaults: { title: def.title, text: def.text }, notify: r.notify, lastNotifiedYear: r.last_notified_year, state: stateOf(r, now, offset),
        };
      }),
    };
  });

  app.put('/admin/seasons/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = bodySchema.parse(req.body ?? {});
    if (b.collectionId) {
      const c = await pool.query('SELECT 1 FROM collections WHERE id = $1', [b.collectionId]);
      if (!c.rowCount) return reply.code(400).send({ error: 'Collection introuvable.' });
    }
    await pool.query(
      `UPDATE season_pages SET enabled = $2, collection_id = $3, lead_days = $4, title_fr = $5, title_en = $6, title_ar = $7,
              text_fr = $8, text_en = $9, text_ar = $10, notify = $11, updated_at = now() WHERE id = $1`,
      [id, b.enabled, b.collectionId, b.leadDays, b.title.fr.trim(), b.title.en.trim(), b.title.ar.trim(), b.text.fr.trim(), b.text.en.trim(), b.text.ar.trim(), b.notify]);
    return { id };
  });

  app.post('/admin/seasons/:id/test-push', adminOnly, async (req) => {
    const { id } = idSchema.parse(req.params);
    const row = (await allRows()).find((r) => r.id === id);
    const def = seasonDef(id);
    const vars = { t: Object.fromEntries(LANGS.map((l) => [l, titleOf(row, def, l)])), b: Object.fromEntries(LANGS.map((l) => [l, textOf(row, def, l)])) };
    return { sent: await pushToUser(req.user.sub, 'season', vars, '/', req.log) };
  });
}
