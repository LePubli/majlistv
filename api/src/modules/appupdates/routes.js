// Étape 22b-5 — Versions de l'application diffusées par notre serveur.
//
//  Public (l'application) :
//   GET /app/latest?platform=android&versionCode=N   dernière version publiée, et faut-il mettre à jour ?
//   GET /app/download/:versionCode                    redirige vers le téléchargement de l'APK (« latest » = la dernière)
//   GET /app/updates/manifest                         protocole expo-updates : dernière mise à jour du contenu de l'application
//   GET /app/updates/assets/:sha256                   fichier d'une mise à jour (adresse stable, cache illimité)
//  Publication (GitHub Actions, jeton « Bearer » = réglage « Jeton de publication ») :
//   POST /app/publish/apk/init     { version, versionCode, size, sha256, notes }  → liens signés par morceau
//   POST /app/publish/apk/commit   { versionCode, uploadId, parts }               → vérifie, publie, ménage les anciennes versions
//   POST /app/publish/update/init  { runtimeVersion, assets: [{ sha256, contentType, size }] } → liens signés des fichiers manquants
//   POST /app/publish/update/commit { runtimeVersion, launchAsset, assets, expoClient } → rend la mise à jour disponible
//   POST /app/publish/update/rollback { runtimeVersion }                            → les applications reviennent au contenu de leur APK
//   GET  /app/publish/releases     liste (APK et mises à jour) pour contrôle
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../../db.js';
import { config } from '../../config.js';
import { getSetting, getNumber } from '../../settings.js';
import { storage, presignGet, presignPut, headObject, deleteKeys } from '../../storage.js';
import { MD5_RE, SHA_RE, VERSION_RE, accepts, apkKey, assetKey, bearer, buildManifest, multipartBody, partCount, tokenOk } from './lib.js';

const PART_SIZE = 32 * 1024 * 1024; // sous la limite de 64 Mo de Nginx (comme les envois de vidéos)
const MAX_APK = 400 * 1024 * 1024;
const MAX_ASSET = 48 * 1024 * 1024;
const KEEP_RELEASES = 5;
const KEEP_UPDATES = 10;
const bucket = config.s3.bucket;
const APK_TYPE = 'application/vnd.android.package-archive';

const notesSchema = z.object({ fr: z.string().max(1500).optional(), en: z.string().max(1500).optional(), ar: z.string().max(1500).optional() }).strict();
const platformSchema = z.literal('android').default('android');

export default async function appUpdatesRoutes(app) {
  const apiUrl = async () => (await getSetting('mod_appupdates_api_url')) || 'https://api-majlisstv.le-publicitaire.fr';
  const off = (reply) => reply.code(503).send({ error: 'Stockage non configuré' });

  // Publication : réservée au jeton du réglage (jamais à un compte du site).
  const publisher = async (req, reply) => {
    const expected = await getSetting('mod_appupdates_publish_token');
    if (!expected) return reply.code(503).send({ error: "Publication non configurée : renseignez le jeton dans Admin → Paramètres → Mises à jour de l'application" });
    if (!tokenOk(bearer(req.headers.authorization), expected)) return reply.code(401).send({ error: 'Jeton de publication invalide' });
    if (!storage) return off(reply);
    return undefined;
  };
  const pub = { preHandler: publisher, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  // ------------------------------------------------------------------ APK : côté application
  app.get('/app/latest', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const q = z.object({ platform: platformSchema, versionCode: z.coerce.number().int().min(0).max(2_000_000_000).default(0) }).parse(req.query ?? {});
    const minCode = Math.max(0, await getNumber('mod_appupdates_min_version_code'));
    const { rows } = await pool.query(
      `SELECT version_code, version, size, sha256, notes, published_at FROM app_releases WHERE platform = $1 AND published_at IS NOT NULL ORDER BY version_code DESC LIMIT 1`, [q.platform]);
    const r = rows[0];
    const base = await apiUrl();
    return {
      latest: r ? { version: r.version, versionCode: r.version_code, size: Number(r.size), sha256: r.sha256, notes: r.notes, publishedAt: r.published_at,
        downloadUrl: `${base.replace(/\/+$/, '')}/app/download/${r.version_code}` } : null,
      updateAvailable: Boolean(r && r.version_code > q.versionCode),
      // Obligatoire : l'application installée est plus ancienne que la version minimale (jamais plus que la dernière publiée).
      required: Boolean(r && q.versionCode > 0 && q.versionCode < Math.min(minCode, r.version_code)),
    };
  });

  app.get('/app/download/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!storage) return off(reply);
    const { code } = z.object({ code: z.union([z.literal('latest'), z.string().regex(/^\d{1,10}$/)]) }).parse(req.params);
    const { rows } = code === 'latest'
      ? await pool.query(`SELECT version, apk_key FROM app_releases WHERE published_at IS NOT NULL ORDER BY version_code DESC LIMIT 1`)
      : await pool.query(`SELECT version, apk_key FROM app_releases WHERE version_code = $1 AND published_at IS NOT NULL`, [Number(code)]);
    if (!rows[0]) return reply.code(404).send({ error: 'Version introuvable' });
    reply.header('cache-control', 'no-store');
    return reply.redirect(await presignGet(rows[0].apk_key, { download: `mejliss-tv-${rows[0].version}.apk` }), 302);
  });

  // ------------------------------------------------------------------ APK : publication
  app.post('/app/publish/apk/init', pub, async (req, reply) => {
    const b = z.object({
      version: z.string().regex(VERSION_RE), versionCode: z.number().int().min(1).max(2_000_000_000), size: z.number().int().min(1).max(MAX_APK),
      sha256: z.string().regex(SHA_RE), notes: notesSchema.default({}),
    }).strict().parse(req.body ?? {});
    const top = (await pool.query('SELECT max(version_code) AS m FROM app_releases WHERE published_at IS NOT NULL')).rows[0].m;
    if (top != null && b.versionCode <= top) return reply.code(409).send({ error: `Le numéro de build ${b.versionCode} n'est pas supérieur au dernier publié (${top})` });
    const key = apkKey(b.versionCode);
    const { UploadId } = await storage.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: APK_TYPE }));
    await pool.query(
      `INSERT INTO app_releases(version_code, version, size, sha256, notes, apk_key) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (version_code) DO UPDATE SET version = EXCLUDED.version, size = EXCLUDED.size, sha256 = EXCLUDED.sha256, notes = EXCLUDED.notes, apk_key = EXCLUDED.apk_key
       WHERE app_releases.published_at IS NULL`, [b.versionCode, b.version, b.size, b.sha256, b.notes, key]);
    const n = partCount(b.size, PART_SIZE);
    const parts = [];
    for (let i = 1; i <= n; i += 1) {
      parts.push({ partNumber: i, url: await getSignedUrl(storage, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber: i }), { expiresIn: 3600 }) });
    }
    return { uploadId: UploadId, partSize: PART_SIZE, parts };
  });

  app.post('/app/publish/apk/commit', pub, async (req, reply) => {
    const b = z.object({
      versionCode: z.number().int().min(1), uploadId: z.string().min(1).max(500),
      parts: z.array(z.object({ PartNumber: z.number().int().min(1).max(10000), ETag: z.string().min(1) })).min(1).max(100),
    }).strict().parse(req.body ?? {});
    const rel = (await pool.query('SELECT * FROM app_releases WHERE version_code = $1 AND published_at IS NULL', [b.versionCode])).rows[0];
    if (!rel) return reply.code(404).send({ error: 'Aucun envoi en cours pour ce numéro de build' });
    await storage.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: rel.apk_key, UploadId: b.uploadId, MultipartUpload: { Parts: b.parts } }));
    // Contrôle d'intégrité : taille et empreinte du fichier réellement stocké.
    const head = await headObject(rel.apk_key);
    const obj = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: rel.apk_key }));
    const h = createHash('sha256');
    for await (const chunk of obj.Body) h.update(chunk);
    if (Number(head.ContentLength) !== Number(rel.size) || h.digest('hex') !== rel.sha256) {
      await deleteKeys([rel.apk_key]).catch(() => {});
      await pool.query('DELETE FROM app_releases WHERE version_code = $1', [b.versionCode]);
      return reply.code(422).send({ error: "Le fichier reçu ne correspond pas à la taille ou à l'empreinte annoncées : envoi annulé" });
    }
    await pool.query('UPDATE app_releases SET published_at = now() WHERE version_code = $1', [b.versionCode]);
    // Ménage : on garde les dernières versions seulement.
    const old = (await pool.query(`SELECT version_code, apk_key FROM app_releases WHERE published_at IS NOT NULL ORDER BY version_code DESC OFFSET $1`, [KEEP_RELEASES])).rows;
    if (old.length) {
      await deleteKeys(old.map((o) => o.apk_key)).catch(() => {});
      await pool.query('DELETE FROM app_releases WHERE version_code = ANY($1)', [old.map((o) => o.version_code)]);
    }
    return { ok: true, versionCode: b.versionCode, version: rel.version };
  });

  // ------------------------------------------------------------------ Mises à jour du contenu : publication
  app.post('/app/publish/update/init', pub, async (req) => {
    const b = z.object({
      runtimeVersion: z.string().regex(VERSION_RE), platform: platformSchema,
      assets: z.array(z.object({ sha256: z.string().regex(SHA_RE), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).max(80), size: z.number().int().min(0).max(MAX_ASSET) }).strict()).min(1).max(600),
    }).strict().parse(req.body ?? {});
    const seen = new Set();
    const uploads = [];
    for (const a of b.assets) {
      if (seen.has(a.sha256)) continue;
      seen.add(a.sha256);
      const exists = await headObject(assetKey(a.sha256)).then(() => true).catch(() => false);
      if (!exists) uploads.push({ sha256: a.sha256, contentType: a.contentType, url: await presignPut(assetKey(a.sha256), a.contentType) });
    }
    return { uploads };
  });

  app.post('/app/publish/update/commit', pub, async (req, reply) => {
    const b = z.object({
      runtimeVersion: z.string().regex(VERSION_RE), platform: platformSchema,
      launchAsset: z.object({ sha256: z.string().regex(SHA_RE) }).strict(),
      assets: z.array(z.object({ sha256: z.string().regex(SHA_RE), key: z.string().regex(MD5_RE), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).max(80),
        fileExtension: z.string().regex(/^\.[A-Za-z0-9]{1,10}$/).optional() }).strict()).max(600),
      expoClient: z.record(z.any()).default({}), notes: z.string().max(500).default(''),
    }).strict().parse(req.body ?? {});
    if (JSON.stringify(b.expoClient).length > 100_000) return reply.code(413).send({ error: 'expoClient trop volumineux' });
    for (const sha of new Set([b.launchAsset.sha256, ...b.assets.map((a) => a.sha256)])) {
      const ok = await headObject(assetKey(sha)).then(() => true).catch(() => false);
      if (!ok) return reply.code(422).send({ error: `Fichier manquant sur le stockage : ${sha}` });
    }
    const id = randomUUID();
    await pool.query(`INSERT INTO app_updates(id, platform, runtime_version, kind, bundle, notes) VALUES ($1, $2, $3, 'update', $4, $5)`,
      [id, b.platform, b.runtimeVersion, { launchAsset: b.launchAsset, assets: b.assets, expoClient: b.expoClient }, b.notes]);
    await pool.query(
      `DELETE FROM app_updates WHERE id IN (SELECT id FROM app_updates WHERE platform = $1 AND runtime_version = $2 ORDER BY created_at DESC OFFSET $3)`, [b.platform, b.runtimeVersion, KEEP_UPDATES]);
    return { ok: true, id };
  });

  app.post('/app/publish/update/rollback', pub, async (req) => {
    const b = z.object({ runtimeVersion: z.string().regex(VERSION_RE), platform: platformSchema }).strict().parse(req.body ?? {});
    const id = randomUUID();
    await pool.query(`INSERT INTO app_updates(id, platform, runtime_version, kind, notes) VALUES ($1, $2, $3, 'rollback', 'retour au contenu intégré')`, [id, b.platform, b.runtimeVersion]);
    return { ok: true, id };
  });

  app.get('/app/publish/releases', pub, async () => ({
    releases: (await pool.query('SELECT version_code, version, size, sha256, published_at FROM app_releases ORDER BY version_code DESC LIMIT 20')).rows,
    updates: (await pool.query('SELECT id, runtime_version, kind, notes, created_at FROM app_updates ORDER BY created_at DESC LIMIT 20')).rows,
  }));

  // ------------------------------------------------------------------ Mises à jour du contenu : côté application (protocole expo-updates v1)
  const protocolHeaders = (reply) => reply.header('expo-protocol-version', '1').header('expo-sfv-version', '0').header('cache-control', 'private, max-age=0');

  app.get('/app/updates/manifest', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const h = req.headers;
    protocolHeaders(reply);
    if (String(h['expo-protocol-version'] || '1') !== '1' && String(h['expo-protocol-version']) !== '0') return reply.code(400).send({ error: 'Protocole non pris en charge' });
    if (String(h['expo-platform'] || '') !== 'android') return reply.code(404).send({ error: 'Plateforme non prise en charge' });
    const runtime = String(h['expo-runtime-version'] || '');
    if (!VERSION_RE.test(runtime)) return reply.code(400).send({ error: 'expo-runtime-version manquant ou invalide' });
    const acc = accepts(h.accept);
    const { rows } = await pool.query(
      `SELECT * FROM app_updates WHERE platform = 'android' AND runtime_version = $1 ORDER BY created_at DESC LIMIT 1`, [runtime]);
    const row = rows[0];
    if (!row) return reply.code(204).send(); // rien de plus récent que le contenu de l'APK
    if (row.kind === 'rollback') {
      if (!acc.multipart) return reply.code(406).send({ error: 'multipart/mixed requis' });
      const boundary = `mjl${randomUUID().replace(/-/g, '')}`;
      return reply.type(`multipart/mixed; boundary=${boundary}`).send(multipartBody([{ name: 'directive', type: 'application/json', json: { type: 'rollBackToEmbedded', parameters: { commitTime: new Date(row.created_at).toISOString() } } }], boundary));
    }
    const manifest = buildManifest(row, await apiUrl());
    if (acc.multipart) {
      const boundary = `mjl${randomUUID().replace(/-/g, '')}`;
      return reply.type(`multipart/mixed; boundary=${boundary}`).send(multipartBody([
        { name: 'manifest', type: 'application/json', json: manifest }, { name: 'extensions', type: 'application/json', json: { assetRequestHeaders: {} } }], boundary));
    }
    if (acc.json) return reply.type('application/expo+json').send(JSON.stringify(manifest));
    return reply.code(406).send({ error: 'Format non accepté' });
  });

  app.get('/app/updates/assets/:sha', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!storage) return off(reply);
    const { sha } = z.object({ sha: z.string().regex(SHA_RE) }).parse(req.params);
    let obj;
    try { obj = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: assetKey(sha) })); } catch { return reply.code(404).send({ error: 'Fichier introuvable' }); }
    reply.header('cache-control', 'public, max-age=31536000, immutable');
    if (obj.ContentLength != null) reply.header('content-length', String(obj.ContentLength));
    return reply.type(obj.ContentType || 'application/octet-stream').send(obj.Body);
  });
}
