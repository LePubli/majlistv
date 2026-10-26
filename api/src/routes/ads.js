// Étape 24c — Publicité plein écran au lancement de l'application.
//   GET   /ads/next?after=<id>      public : publicités à montrer (rotation), vide pour un enfant, un abonné payant (selon le réglage) ou sans publicité en cours
//   POST  /ads/:id/impression       public : compte un affichage
//   POST  /ads/:id/click            public : compte un clic sur le bouton
//   POST  /ads/:id/skip             public : compte un « Passer »
//   GET   /admin/ads                administrateur : liste, situation, compteurs
//   POST  /admin/ads/upload-url     administrateur : lien d'envoi direct du visuel (photo ou vidéo)
//   POST  /admin/ads                administrateur : créer
//   PATCH /admin/ads/:id            administrateur : modifier (texte, lien, dates, active, nouveau visuel)
//   DELETE /admin/ads/:id           administrateur : supprimer (visuel compris)
// Fonction « Publicité » (Admin → Fonctions) : coupée, toutes ces routes répondent 404 et l'application n'affiche rien.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { storage, presignGet, presignPut, headObject, deleteObject } from '../storage.js';
import { hasActiveSubscription } from '../access.js';
import { getSetting, getNumber } from '../settings.js';
import { mediaInfo, keyInfo, safeLink, adStatus, pickAds, clickRate, MEDIA_KEY_RE } from '../ads.js';

const idSchema = z.object({ id: z.string().uuid() });
const date = z.union([z.string().datetime({ offset: true }), z.null()]);
const fields = {
  advertiser: z.string().trim().min(1, "Nom de l'annonceur obligatoire").max(80),
  title: z.string().trim().min(1, 'Titre obligatoire').max(120),
  sentence: z.string().trim().max(240),
  ctaLabel: z.string().trim().min(1).max(30),
  linkUrl: z.string().trim().max(500),
  mediaKey: z.string().regex(MEDIA_KEY_RE, 'Fichier inattendu'),
  active: z.boolean(),
  startsAt: date,
  endsAt: date,
};
const createSchema = z.object({
  advertiser: fields.advertiser, title: fields.title, sentence: fields.sentence.default(''), ctaLabel: fields.ctaLabel.default('En savoir plus'),
  linkUrl: fields.linkUrl, mediaKey: fields.mediaKey, active: fields.active.default(true), startsAt: fields.startsAt.default(null), endsAt: fields.endsAt.default(null),
});
const patchSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).refine((b) => Object.keys(b).length > 0, 'Aucun changement');
const nextQuery = z.object({ after: z.string().uuid().optional() });
const uploadSchema = z.object({ contentType: z.string().max(60), size: z.number().int().positive() });

const COLS = `a.id, a.advertiser, a.title, a.sentence, a.cta_label, a.link_url, a.media_kind, a.media_key, a.media_type, a.active, a.starts_at, a.ends_at, a.created_at`;
const publicView = async (a) => ({
  id: a.id, advertiser: a.advertiser, title: a.title, sentence: a.sentence, cta: a.cta_label, linkUrl: a.link_url,
  mediaKind: a.media_kind, mediaUrl: await presignGet(a.media_key),
});

export default async function adsRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  const off = (reply) => reply.code(503).send({ error: 'Stockage non configuré' });
  const checkDates = (startsAt, endsAt) => !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt);

  // ---------- Public ----------
  app.get('/ads/next', async (req) => {
    const none = { ads: [], skipSeconds: 5, imageSeconds: 6 };
    if (!storage) return none;
    const { after } = nextQuery.parse(req.query);
    if (await app.kidContext(req)) return none; // jamais de publicité dans l'espace enfant
    const user = await app.optionalUser(req);
    if (user && (await getSetting('ads_paid_subscribers')) !== 'afficher' && (await hasActiveSubscription(user.id ?? user.sub))) return none;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM ads a WHERE a.active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now()) ORDER BY a.created_at, a.id`);
    const picked = pickAds(rows, after, await getNumber('ads_per_launch'));
    return { ads: await Promise.all(picked.map(publicView)), skipSeconds: await getNumber('ads_skip_seconds'), imageSeconds: await getNumber('ads_image_seconds') };
  });

  const count = (column) => async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (await app.kidContext(req)) return { ok: true };
    const r = await pool.query(
      `INSERT INTO ad_stats(ad_id, day, ${column}) SELECT id, current_date, 1 FROM ads WHERE id = $1
       ON CONFLICT (ad_id, day) DO UPDATE SET ${column} = ad_stats.${column} + 1`, [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    return { ok: true };
  };
  app.post('/ads/:id/impression', count('impressions'));
  app.post('/ads/:id/click', count('clicks'));
  app.post('/ads/:id/skip', count('skips'));

  // ---------- Administration ----------
  app.get('/admin/ads', adminOnly, async () => {
    const { rows } = await pool.query(
      `SELECT ${COLS},
              coalesce(sum(s.impressions), 0)::int AS impressions, coalesce(sum(s.clicks), 0)::int AS clicks, coalesce(sum(s.skips), 0)::int AS skips,
              coalesce(sum(s.impressions) FILTER (WHERE s.day >= current_date - 6), 0)::int AS impressions7,
              coalesce(sum(s.clicks) FILTER (WHERE s.day >= current_date - 6), 0)::int AS clicks7
         FROM ads a LEFT JOIN ad_stats s ON s.ad_id = a.id GROUP BY a.id ORDER BY a.created_at, a.id`);
    const now = new Date();
    const ads = [];
    for (const a of rows) {
      ads.push({
        id: a.id, advertiser: a.advertiser, title: a.title, sentence: a.sentence, ctaLabel: a.cta_label, linkUrl: a.link_url,
        mediaKind: a.media_kind, mediaUrl: storage ? await presignGet(a.media_key) : null, active: a.active,
        startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at, status: adStatus(a, now),
        impressions: a.impressions, clicks: a.clicks, skips: a.skips, ctr: clickRate(a.impressions, a.clicks), impressions7: a.impressions7, clicks7: a.clicks7,
      });
    }
    return { ads, storage: Boolean(storage), limits: { imageMb: mediaInfo('image/png').maxMb, videoMb: mediaInfo('video/mp4').maxMb } };
  });

  app.post('/admin/ads/upload-url', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const b = uploadSchema.parse(req.body ?? {});
    const info = mediaInfo(b.contentType);
    if (!info) return reply.code(400).send({ error: 'Format non accepté (photo png, jpeg, webp ou vidéo mp4, webm)', code: 'bad_type' });
    if (b.size > info.maxMb * 1048576) return reply.code(400).send({ error: `Fichier trop lourd (${info.maxMb} Mo maximum pour ${info.kind === 'image' ? 'une photo' : 'une vidéo'})`, code: 'too_big' });
    const key = `ads/${randomUUID()}.${info.ext}`;
    return { key, url: await presignPut(key, info.type), kind: info.kind };
  });

  // Vérifie que le visuel envoyé existe et respecte la taille ; sinon il est supprimé.
  async function checkMedia(key, reply) {
    const info = keyInfo(key);
    let size;
    try { size = Number((await headObject(key)).ContentLength); } catch { return reply.code(400).send({ error: "Le fichier n'a pas été reçu : recommencez l'envoi", code: 'missing' }); }
    if (size > info.maxMb * 1048576) { await deleteObject(key).catch(() => {}); return reply.code(400).send({ error: `Fichier trop lourd (${info.maxMb} Mo maximum)`, code: 'too_big' }); }
    return info;
  }

  app.post('/admin/ads', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const b = createSchema.parse(req.body ?? {});
    const link = safeLink(b.linkUrl);
    if (!link) return reply.code(400).send({ error: 'Le lien doit commencer par https:// (ou http://)', code: 'bad_link' });
    if (!checkDates(b.startsAt, b.endsAt)) return reply.code(400).send({ error: 'La date de fin doit suivre la date de début', code: 'bad_dates' });
    const info = await checkMedia(b.mediaKey, reply);
    if (reply.sent) return reply;
    const { rows } = await pool.query(
      `INSERT INTO ads(advertiser, title, sentence, cta_label, link_url, media_kind, media_key, media_type, active, starts_at, ends_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [b.advertiser, b.title, b.sentence, b.ctaLabel, link, info.kind, b.mediaKey, info.type, b.active, b.startsAt, b.endsAt, req.user.sub]);
    return reply.code(201).send({ id: rows[0].id });
  });

  app.patch('/admin/ads/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM ads WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Publicité introuvable' });
    const set = []; const args = [id];
    const put = (col, v) => { args.push(v); set.push(`${col} = $${args.length}`); };
    if (b.linkUrl !== undefined) { const l = safeLink(b.linkUrl); if (!l) return reply.code(400).send({ error: 'Le lien doit commencer par https:// (ou http://)', code: 'bad_link' }); put('link_url', l); }
    const startsAt = b.startsAt !== undefined ? b.startsAt : cur.starts_at; const endsAt = b.endsAt !== undefined ? b.endsAt : cur.ends_at;
    if (!checkDates(startsAt, endsAt)) return reply.code(400).send({ error: 'La date de fin doit suivre la date de début', code: 'bad_dates' });
    if (b.startsAt !== undefined) put('starts_at', b.startsAt);
    if (b.endsAt !== undefined) put('ends_at', b.endsAt);
    let oldKey = null;
    if (b.mediaKey !== undefined && b.mediaKey !== cur.media_key) {
      if (!storage) return off(reply);
      const info = await checkMedia(b.mediaKey, reply);
      if (reply.sent) return reply;
      put('media_key', b.mediaKey); put('media_kind', info.kind); put('media_type', info.type); oldKey = cur.media_key;
    }
    for (const [k, col] of [['advertiser', 'advertiser'], ['title', 'title'], ['sentence', 'sentence'], ['ctaLabel', 'cta_label'], ['active', 'active']]) if (b[k] !== undefined) put(col, b[k]);
    if (set.length) await pool.query(`UPDATE ads SET ${set.join(', ')} WHERE id = $1`, args);
    if (oldKey && storage) await deleteObject(oldKey).catch(() => {});
    return { ok: true };
  });

  app.delete('/admin/ads/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM ads WHERE id = $1 RETURNING media_key', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    if (storage) await deleteObject(r.rows[0].media_key).catch(() => {});
    return { deleted: true };
  });
}
