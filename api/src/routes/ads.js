// Étape 24c — Publicité plein écran au lancement de l'application.
//   GET   /ads/next?after=<id>&lang=fr   public : publicités à montrer (rotation), vide pour un enfant, un abonné payant (selon le réglage) ou sans publicité en cours
//   POST  /ads/:id/impression       public : compte un affichage (corps facultatif { lang } → répartition par langue)
//   POST  /ads/:id/click            public : compte un clic sur le bouton
//   POST  /ads/:id/skip             public : compte un « Passer »
//   POST  /ads/:id/watch            public : durée regardée { seconds, completed }
//   POST  /me/ad-attribution        compte connecté : rattache une inscription récente à la publicité { ad }
// Ciblage : ?tz=<fuseau horaire>&platform=android|ios|tv|web ; les corps des évènements acceptent aussi tz et platform.
//   GET   /admin/campaigns                administrateur : liste, situation, compteurs
//   POST  /admin/campaigns/upload-url     administrateur : lien d'envoi direct du visuel (photo ou vidéo)
//   POST  /admin/campaigns                administrateur : créer
//   PATCH /admin/campaigns/:id            administrateur : modifier (texte, lien, dates, active, nouveau visuel)
//   DELETE /admin/campaigns/:id           administrateur : supprimer (visuel compris)
//   POST   /admin/campaigns/:id/report-link    administrateur : créer ou renouveler le lien de suivi secret (l'ancien cesse de marcher)
//   DELETE /admin/campaigns/:id/report-link    administrateur : désactiver le lien de suivi
//   GET  /ad-report/:token          public (sans compte, jeton secret) : rapport de l'annonceur en JSON
//   GET  /ad-report/:token/pdf      public (jeton secret) : rapport en PDF
// Fonction « Publicité » (Admin → Fonctions) : coupée, toutes ces routes répondent 404 et l'application n'affiche rien.
import { allowCount, visitorKey, AD_LIMITS } from '../counterGuard.js'; // relecture 25/11 : quotas par visiteur
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isoDateTime } from '../zpatch.js';
import { pool } from '../db.js';
import { storage, presignGet, presignPut, headObject, deleteObject } from '../storage.js';
import { hasActiveSubscription } from '../access.js';
import { getSetting, getNumber } from '../settings.js';
import { newReportToken, TOKEN_RE, buildReport, reportPdf } from '../adReport.js';
import { mediaInfo, keyInfo, safeLink, adStatus, pickAds, clickRate, MEDIA_KEY_RE, AD_LANGS, normLang, matchesLang, langBreakdown, AD_COUNTRY_CODES, AD_COUNTRIES, AD_DEVICES, tzToCountry, normDevice, matchesCountry, matchesDevice, avgSeconds, completionRate, trackedLink } from '../ads.js';

const idSchema = z.object({ id: z.guid() });
const date = z.union([isoDateTime({ offset: true }), z.null()]);
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
  languages: z.array(z.enum(AD_LANGS)).max(3),
  countries: z.array(z.enum(AD_COUNTRY_CODES)).max(AD_COUNTRY_CODES.length),
  devices: z.array(z.enum(AD_DEVICES)).max(AD_DEVICES.length),
};
const createSchema = z.object({
  advertiser: fields.advertiser, title: fields.title, sentence: fields.sentence.default(''), ctaLabel: fields.ctaLabel.default('En savoir plus'),
  linkUrl: fields.linkUrl, mediaKey: fields.mediaKey, active: fields.active.default(true), startsAt: fields.startsAt.default(null), endsAt: fields.endsAt.default(null), languages: fields.languages.default([]), countries: fields.countries.default([]), devices: fields.devices.default([]),
});
const patchSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).refine((b) => Object.keys(b).length > 0, 'Aucun changement');
const nextQuery = z.object({ after: z.guid().optional(), lang: z.string().max(12).optional(), tz: z.string().max(64).optional(), platform: z.string().max(12).optional() });
const watchBody = z.object({ seconds: z.number().min(0).max(300), completed: z.boolean().default(false) });
const uploadSchema = z.object({ contentType: z.string().max(60), size: z.number().int().positive() });

const COLS = `a.id, a.advertiser, a.title, a.sentence, a.cta_label, a.link_url, a.media_kind, a.media_key, a.media_type, a.active, a.starts_at, a.ends_at, a.created_at, a.languages, a.countries, a.devices, a.report_token`;
const publicView = async (a, webUrl) => ({
  id: a.id, advertiser: a.advertiser, title: a.title, sentence: a.sentence, cta: a.cta_label, linkUrl: trackedLink(a.link_url, a.id, webUrl),
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
    const { after, lang: rawLang, tz, platform } = nextQuery.parse(req.query);
    const lang = normLang(rawLang); const country = tzToCountry(tz); const device = normDevice(platform);
    if (await app.kidContext(req)) return none; // jamais de publicité dans l'espace enfant
    const user = await app.optionalUser(req);
    if (user && (await getSetting('ads_paid_subscribers')) !== 'afficher' && (await hasActiveSubscription(user.id ?? user.sub))) return none;
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM ads a WHERE a.active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now()) ORDER BY a.created_at, a.id`);
    const webUrl = await getSetting('web_url');
    const picked = pickAds(rows.filter((a) => matchesLang(a.languages, lang) && matchesCountry(a.countries, country) && matchesDevice(a.devices, device)), after, await getNumber('ads_per_launch'));
    return { ads: await Promise.all(picked.map((a) => publicView(a, webUrl))), skipSeconds: await getNumber('ads_skip_seconds'), imageSeconds: await getNumber('ads_image_seconds') };
  });

  // Compte un évènement : total du jour (comme avant) + répartition par langue (la langue vient du corps de la requête ; absente = inconnue).
  const count = (column) => async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (await app.kidContext(req)) return { ok: true };
    if (!allowCount(`${column}:${id}:${visitorKey(req)}`, AD_LIMITS[column] ?? 30)) return { ok: true }; // quota du jour : rien n'est compté
    const lang = normLang(req.body?.lang ?? req.query?.lang);
    const r = await pool.query(
      `INSERT INTO ad_stats(ad_id, day, ${column}) SELECT id, current_date, 1 FROM ads WHERE id = $1
       ON CONFLICT (ad_id, day) DO UPDATE SET ${column} = ad_stats.${column} + 1`, [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    await pool.query(
      `INSERT INTO ad_stats_lang(ad_id, day, lang, ${column}) VALUES ($1, current_date, $2, 1)
       ON CONFLICT (ad_id, day, lang) DO UPDATE SET ${column} = ad_stats_lang.${column} + 1`, [id, lang]);
    // Répartition par pays (fuseau horaire du téléphone) et par appareil ; valeur inconnue = ''.
    const dims = [['country', tzToCountry(req.body?.tz ?? req.query?.tz)], ['device', normDevice(req.body?.platform ?? req.query?.platform)]];
    for (const [kind, value] of dims) {
      await pool.query(
        `INSERT INTO ad_stats_dim(ad_id, day, kind, value, ${column}) VALUES ($1, current_date, $2, $3, 1)
         ON CONFLICT (ad_id, day, kind, value) DO UPDATE SET ${column} = ad_stats_dim.${column} + 1`, [id, kind, value]);
    }
    return { ok: true };
  };
  app.post('/ads/:id/impression', count('impressions'));
  app.post('/ads/:id/click', count('clicks'));
  app.post('/ads/:id/skip', count('skips'));
  // Durée réellement regardée (secondes, 0–300) ; completed = la publicité est allée jusqu'au bout sans « Passer ».
  app.post('/ads/:id/watch', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (await app.kidContext(req)) return { ok: true };
    const b = watchBody.parse(req.body ?? {});
    if (!allowCount(`watch:${id}:${visitorKey(req)}`, AD_LIMITS.watch)) return { ok: true };
    const r = await pool.query(
      `INSERT INTO ad_stats(ad_id, day, watch_ms, watch_n, completed) SELECT id, current_date, $2, 1, $3 FROM ads WHERE id = $1
       ON CONFLICT (ad_id, day) DO UPDATE SET watch_ms = ad_stats.watch_ms + $2, watch_n = ad_stats.watch_n + 1, completed = ad_stats.completed + $3`,
      [id, Math.round(b.seconds * 1000), b.completed ? 1 : 0]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    return { ok: true };
  });
  // Inscription venue d'une publicité (le site garde ?ad=<id> après un clic) : rattache le compte qui vient d'être créé (moins de 48 h).
  app.post('/me/ad-attribution', { preHandler: app.authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { ad } = z.object({ ad: z.guid() }).parse(req.body ?? {});
    const fresh = (await pool.query("SELECT 1 FROM users WHERE id = $1 AND created_at > now() - interval '48 hours'", [req.user.sub])).rowCount;
    if (!fresh) return reply.code(409).send({ error: "Seul un compte qui vient d'être créé peut être rattaché", code: 'too_late' });
    const exists = (await pool.query('SELECT 1 FROM ads WHERE id = $1', [ad])).rowCount;
    if (!exists) return reply.code(404).send({ error: 'Publicité introuvable' });
    const r = await pool.query('INSERT INTO ad_attributions(user_id, ad_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [req.user.sub, ad]);
    if (r.rowCount) await pool.query(
      `INSERT INTO ad_conversions(ad_id, day, kind, n) VALUES ($1, current_date, 'signup', 1) ON CONFLICT (ad_id, day, kind) DO UPDATE SET n = ad_conversions.n + 1`, [ad]);
    return { ok: true };
  });

  // ---------- Administration ----------
  app.get('/admin/campaigns', adminOnly, async () => {
    const { rows } = await pool.query(
      `SELECT ${COLS},
              coalesce(sum(s.impressions), 0)::int AS impressions, coalesce(sum(s.clicks), 0)::int AS clicks, coalesce(sum(s.skips), 0)::int AS skips,
              coalesce(sum(s.watch_ms), 0)::bigint AS watch_ms, coalesce(sum(s.watch_n), 0)::int AS watch_n, coalesce(sum(s.completed), 0)::int AS completed,
              coalesce(sum(s.impressions) FILTER (WHERE s.day >= current_date - 6), 0)::int AS impressions7,
              coalesce(sum(s.clicks) FILTER (WHERE s.day >= current_date - 6), 0)::int AS clicks7
         FROM ads a LEFT JOIN ad_stats s ON s.ad_id = a.id GROUP BY a.id ORDER BY a.created_at, a.id`);
    const langRows = (await pool.query('SELECT ad_id, lang, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks, sum(skips)::int AS skips FROM ad_stats_lang GROUP BY ad_id, lang')).rows;
    // Courbe des 30 derniers jours (toutes campagnes), jours sans affichage complétés par des zéros (jours de la base).
    const daily = (await pool.query(
      `SELECT to_char(g.d, 'YYYY-MM-DD') AS day, coalesce(sum(s.impressions), 0)::int AS impressions, coalesce(sum(s.clicks), 0)::int AS clicks
         FROM generate_series(current_date - 29, current_date, interval '1 day') AS g(d) LEFT JOIN ad_stats s ON s.day = g.d::date
        GROUP BY g.d ORDER BY g.d`)).rows;
    const dimRows = (await pool.query('SELECT ad_id, kind, value, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks, sum(skips)::int AS skips FROM ad_stats_dim GROUP BY ad_id, kind, value')).rows;
    const convRows = (await pool.query('SELECT ad_id, kind, sum(n)::int AS n FROM ad_conversions GROUP BY ad_id, kind')).rows;
    const now = new Date();
    const ads = [];
    for (const a of rows) {
      ads.push({
        id: a.id, advertiser: a.advertiser, title: a.title, sentence: a.sentence, ctaLabel: a.cta_label, linkUrl: a.link_url,
        mediaKind: a.media_kind, mediaUrl: storage ? await presignGet(a.media_key) : null, active: a.active,
        startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at, status: adStatus(a, now),
        impressions: a.impressions, clicks: a.clicks, skips: a.skips, ctr: clickRate(a.impressions, a.clicks), impressions7: a.impressions7, clicks7: a.clicks7,
        reportToken: a.report_token, languages: a.languages, countries: a.countries, devices: a.devices,
        avgWatchSeconds: avgSeconds(Number(a.watch_ms), a.watch_n), completionRate: completionRate(a.completed, a.watch_n), watched: a.watch_n,
        byCountry: dimRows.filter((x) => x.ad_id === a.id && x.kind === 'country').map(({ value, impressions, clicks, skips }) => ({ value, impressions, clicks, skips })),
        byDevice: dimRows.filter((x) => x.ad_id === a.id && x.kind === 'device').map(({ value, impressions, clicks, skips }) => ({ value, impressions, clicks, skips })),
        signups: convRows.find((x) => x.ad_id === a.id && x.kind === 'signup')?.n || 0, subscriptions: convRows.find((x) => x.ad_id === a.id && x.kind === 'subscription')?.n || 0, byLang: langBreakdown({ impressions: a.impressions, clicks: a.clicks, skips: a.skips }, langRows.filter((x) => x.ad_id === a.id)),
      });
    }
    return { ads, daily, countries: AD_COUNTRIES, storage: Boolean(storage), limits: { imageMb: mediaInfo('image/png').maxMb, videoMb: mediaInfo('video/mp4').maxMb } };
  });

  app.post('/admin/campaigns/upload-url', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const b = uploadSchema.parse(req.body ?? {});
    const info = mediaInfo(b.contentType);
    if (!info) return reply.code(400).send({ error: 'Format non accepté (photo png, jpeg, webp ou vidéo mp4, webm)', code: 'bad_type' });
    if (b.size > info.maxMb * 1048576) return reply.code(400).send({ error: `Fichier trop lourd (${info.maxMb} Mo maximum pour ${info.kind === 'image' ? 'une photo' : 'une vidéo'})`, code: 'too_big' });
    const key = `campaigns/${randomUUID()}.${info.ext}`; // pas de « ads » dans l'adresse : les bloqueurs de publicités du navigateur la bloqueraient
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

  app.post('/admin/campaigns', adminOnly, async (req, reply) => {
    if (!storage) return off(reply);
    const b = createSchema.parse(req.body ?? {});
    const link = safeLink(b.linkUrl);
    if (!link) return reply.code(400).send({ error: 'Le lien doit commencer par https:// (ou http://)', code: 'bad_link' });
    if (!checkDates(b.startsAt, b.endsAt)) return reply.code(400).send({ error: 'La date de fin doit suivre la date de début', code: 'bad_dates' });
    const info = await checkMedia(b.mediaKey, reply);
    if (reply.sent) return reply;
    const { rows } = await pool.query(
      `INSERT INTO ads(advertiser, title, sentence, cta_label, link_url, media_kind, media_key, media_type, active, starts_at, ends_at, created_by, languages, countries, devices)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [b.advertiser, b.title, b.sentence, b.ctaLabel, link, info.kind, b.mediaKey, info.type, b.active, b.startsAt, b.endsAt, req.user.sub, [...new Set(b.languages)], [...new Set(b.countries)], [...new Set(b.devices)]]);
    return reply.code(201).send({ id: rows[0].id });
  });

  app.patch('/admin/campaigns/:id', adminOnly, async (req, reply) => {
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
    if (b.languages !== undefined) put('languages', [...new Set(b.languages)]);
    if (b.countries !== undefined) put('countries', [...new Set(b.countries)]);
    if (b.devices !== undefined) put('devices', [...new Set(b.devices)]);
    if (set.length) await pool.query(`UPDATE ads SET ${set.join(', ')} WHERE id = $1`, args);
    if (oldKey && storage) await deleteObject(oldKey).catch(() => {});
    return { ok: true };
  });

  app.delete('/admin/campaigns/:id', adminOnly, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM ads WHERE id = $1 RETURNING media_key', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    if (storage) await deleteObject(r.rows[0].media_key).catch(() => {});
    return { deleted: true };
  });

  // ---------- Rapport annonceur (lien secret, sans compte) ----------
  const reportLink = { preHandler: app.requireRole('admin') };
  app.post('/admin/campaigns/:id/report-link', reportLink, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('UPDATE ads SET report_token = $2 WHERE id = $1 RETURNING report_token', [id, newReportToken()]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    return { token: r.rows[0].report_token };
  });
  app.delete('/admin/campaigns/:id/report-link', reportLink, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('UPDATE ads SET report_token = NULL WHERE id = $1', [id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Publicité introuvable' });
    return { ok: true };
  });

  // Données du rapport pour un jeton ; null si le jeton est inconnu ou désactivé.
  async function loadReport(token) {
    if (!TOKEN_RE.test(token)) return null;
    const ad = (await pool.query(
      `SELECT a.advertiser, a.title, a.active, a.starts_at, a.ends_at, a.created_at, a.languages, a.id,
              coalesce(sum(s.impressions), 0)::int AS impressions, coalesce(sum(s.clicks), 0)::int AS clicks, coalesce(sum(s.skips), 0)::int AS skips
         FROM ads a LEFT JOIN ad_stats s ON s.ad_id = a.id WHERE a.report_token = $1 GROUP BY a.id`, [token])).rows[0];
    if (!ad) return null;
    const today = (await pool.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS d")).rows[0].d;
    const daily = (await pool.query(
      "SELECT to_char(day, 'YYYY-MM-DD') AS day, impressions, clicks FROM ad_stats WHERE ad_id = $1 AND day > current_date - 90", [ad.id])).rows;
    const langRows = (await pool.query('SELECT lang, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks, sum(skips)::int AS skips FROM ad_stats_lang WHERE ad_id = $1 GROUP BY lang', [ad.id])).rows;
    return buildReport(ad, daily, langBreakdown({ impressions: ad.impressions, clicks: ad.clicks, skips: ad.skips }, langRows.map((x) => ({ ...x, ad_id: ad.id }))), today, adStatus(ad, new Date()));
  }
  app.get('/ad-report/:token', async (req, reply) => {
    const r = await loadReport(String(req.params.token));
    if (!r) return reply.code(404).send({ error: 'Lien de suivi inconnu ou désactivé' });
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex');
    return r;
  });
  app.get('/ad-report/:token/pdf', async (req, reply) => {
    const r = await loadReport(String(req.params.token));
    if (!r) return reply.code(404).send({ error: 'Lien de suivi inconnu ou désactivé' });
    const name = `rapport-${r.title.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'campagne'}.pdf`;
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${name}"`).header('cache-control', 'no-store').header('x-robots-tag', 'noindex').send(await reportPdf(r));
  });
}
