// Vendredi (étape 45C).
//   GET  /friday?lang=fr        public : la carte du vendredi { active, kahf, ghusl, salawat, collection, talks } ou { active: false }
//   GET  /admin/friday          administrateur : réglages, textes par défaut, collections
//   PUT  /admin/friday          administrateur : activer, éléments affichés, textes, collection, notification
//   POST /admin/friday/test-push administrateur : envoie la notification du vendredi à son propre compte
import { z } from 'zod';
import { pool } from '../../db.js';
import { pushToUser } from '../../push.js';
import { DEFAULTS, LANGS, getRow, lang, notifVars, parisDay, publicFriday } from './lib.js';

const trio = z.object({ fr: z.string().max(300).default(''), en: z.string().max(300).default(''), ar: z.string().max(300).default('') });
const bodySchema = z.object({
  enabled: z.boolean(), showKahf: z.boolean(), showGhusl: z.boolean(), showSalawat: z.boolean(),
  ghusl: trio, salawat: trio, notif: trio, collectionId: z.guid().nullable(), notify: z.boolean(), notifyHour: z.number().int().min(0).max(23),
});

export default async function fridayRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/friday', async (req, reply) => {
    const { lang: l } = z.object({ lang: z.string().max(10).optional() }).parse(req.query);
    reply.header('cache-control', 'public, max-age=60');
    return publicFriday(lang(l));
  });

  app.get('/admin/friday', adminOnly, async () => {
    const r = await getRow();
    const collections = (await pool.query('SELECT id, title, published FROM collections ORDER BY updated_at DESC LIMIT 200')).rows;
    const pick = (k) => Object.fromEntries(LANGS.map((l) => [l, r[`${k}_${l}`]]));
    return {
      today: parisDay(), enabled: r.enabled, showKahf: r.show_kahf, showGhusl: r.show_ghusl, showSalawat: r.show_salawat,
      ghusl: pick('ghusl'), salawat: pick('salawat'), notif: pick('notif'), defaults: DEFAULTS,
      collectionId: r.collection_id, collections, notify: r.notify, notifyHour: r.notify_hour, lastNotifiedOn: r.last_notified_on,
    };
  });

  app.put('/admin/friday', adminOnly, async (req, reply) => {
    const b = bodySchema.parse(req.body ?? {});
    if (b.collectionId && !(await pool.query('SELECT 1 FROM collections WHERE id = $1', [b.collectionId])).rowCount) return reply.code(400).send({ error: 'Collection introuvable.' });
    await pool.query(
      `UPDATE friday_page SET enabled=$1, show_kahf=$2, show_ghusl=$3, show_salawat=$4, ghusl_fr=$5, ghusl_en=$6, ghusl_ar=$7,
              salawat_fr=$8, salawat_en=$9, salawat_ar=$10, notif_fr=$11, notif_en=$12, notif_ar=$13, collection_id=$14, notify=$15, notify_hour=$16, updated_at=now() WHERE id = 1`,
      [b.enabled, b.showKahf, b.showGhusl, b.showSalawat, b.ghusl.fr.trim(), b.ghusl.en.trim(), b.ghusl.ar.trim(), b.salawat.fr.trim(), b.salawat.en.trim(), b.salawat.ar.trim(),
        b.notif.fr.trim(), b.notif.en.trim(), b.notif.ar.trim(), b.collectionId, b.notify, b.notifyHour]);
    req.auditSummary = `Vendredi : réglages enregistrés (${b.enabled ? 'activé' : 'désactivé'}, notification ${b.notify ? `à ${b.notifyHour} h` : 'coupée'})`;
    return { ok: true };
  });

  app.post('/admin/friday/test-push', adminOnly, async (req) => ({ sent: await pushToUser(req.user.sub, 'friday', notifVars(await getRow()), '/', req.log) }));
}
