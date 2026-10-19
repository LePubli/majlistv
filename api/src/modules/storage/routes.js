// Module « Stockage et archivage » — routes du Studio (administrateurs), étape S2.
import { z } from 'zod';
import * as ext from '../../ext.js';
import { describeSettings, saveSettings } from '../../settings.js';
import { storage } from '../../storage.js';
import {
  KEYS, SECRET_KEYS, full, readSettings, getState, setState, space, garageUsage, testConnection, listItems, totals, getItem,
  enqueueRestore, testFile, autoArchive, processQueue,
} from './lib.js';
import { pool } from '../../db.js';
import { PROVIDERS } from './rclone.js';

const idSchema = z.object({ id: z.string().uuid() });
const PROVIDER_NAMES = { planethoster: 'PlanetHoster (SFTP)', s3: 'Stockage S3', webdav: 'WebDAV', none: 'Aucun' };

async function pendingOriginals(s) {
  const out = [];
  await ext.emit('archive.collect', out, { kind: 'original', olderThanDays: 0 }).catch(() => {});
  const list = out.filter((x) => x.kind === 'original');
  return { available: ext.has('archive.restore'), count: list.length, bytes: list.reduce((a, x) => a + (Number(x.bytes) || 0), 0), days: s.keep_original_days };
}

export default async function routes(app, ctx) {
  const admin = { preHandler: app.requireRole('admin') };
  const kick = () => setImmediate(() => processQueue(ctx, app.log).catch((e) => app.log.warn(`Archivage : ${e.message}`)));

  // Écran complet : réglages (sans les secrets), espace Garage, archives, dernier test.
  async function view() {
    const s = await readSettings(ctx);
    const desc = await describeSettings({ all: true });
    const secret = {};
    for (const k of SECRET_KEYS) {
      const f = desc.fields.find((x) => x.key === full(k));
      secret[k] = { isSet: Boolean(f?.isSet) };
    }
    // Pour le champ SFTP, seul le type (mot de passe ou clé) est indiqué, jamais la valeur.
    if (secret.sftp_secret.isSet) secret.sftp_secret.kind = /PRIVATE KEY-----/.test(s.sftp_secret) ? 'key' : 'password';
    const settings = {};
    for (const k of KEYS) if (!SECRET_KEYS.includes(k)) settings[k] = s[k];
    const lastTest = await getState('last_test');
    const autoLast = await getState('auto_last_run');
    return {
      settings, secret, encryptionReady: Boolean(desc.encryption), providers: PROVIDERS.map((id) => ({ id, name: PROVIDER_NAMES[id] })),
      space: await space(s), archives: await totals(),
      // Étape E4b : originaux des vidéos remplacées, gardés dans Garage avant archivage (annoncés par l'éditeur de montage).
      pendingOriginals: await pendingOriginals(s),
      lastTest: lastTest ? { ...lastTest.v, at: lastTest.updated_at } : null,
      autoLast: autoLast ? { ...autoLast.v, at: autoLast.updated_at } : null,
      items: await listItems({ status: 'live' }), history: await listItems({ status: 'history', limit: 20 }),
      storageReady: Boolean(storage),
    };
  }

  app.get('/studio/storage', admin, async () => view());

  // Petit encart « Stockage » du menu du Studio (étape S3) : espace Garage seulement.
  app.get('/studio/storage/space', admin, async () => space(await readSettings(ctx)));

  // Espace Garage recalculé tout de suite (sinon au plus toutes les 5 minutes).
  app.post('/studio/storage/usage', admin, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage Garage non configuré', code: 'storage_off' });
    await garageUsage({ fresh: true });
    return space(await readSettings(ctx));
  });

  // Enregistrement des réglages. Un secret vide = inchangé ; null = effacé. Un autre champ vide = valeur par défaut.
  const body = z.object(Object.fromEntries(KEYS.map((k) => [k, z.string().max(SECRET_KEYS.includes(k) ? 20000 : 500).nullable().optional()]))).strict();
  app.put('/studio/storage/settings', admin, async (req, reply) => {
    const b = body.parse(req.body ?? {});
    const values = {};
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      if (SECRET_KEYS.includes(k) && v === '') continue;
      values[full(k)] = v;
    }
    try { await saveSettings(values, req.user.sub); } catch (err) { return reply.code(400).send({ error: err.message }); }
    const changed = Object.keys(b).filter((k) => b[k] !== undefined && !(SECRET_KEYS.includes(k) && b[k] === ''));
    req.auditSummary = `Stockage et archivage : réglages (${changed.join(', ') || 'aucun'})`;
    return view();
  });

  // « Tester la connexion » : dossier, écriture, lecture, effacement d'un petit fichier chez le fournisseur.
  app.post('/studio/storage/test', admin, async (req) => {
    const s = await readSettings(ctx);
    const r = await testConnection(s);
    await setState('last_test', { ...r, provider: s.provider });
    req.auditSummary = `Stockage et archivage : test de connexion ${r.ok ? 'réussi' : 'en échec'} (${s.provider})`;
    return { ...r, provider: s.provider, at: new Date().toISOString() };
  });

  // Fichier d'essai : écrit dans Garage puis archivé ; on le restaure ensuite depuis la liste.
  app.post('/studio/storage/test-file', admin, async (req, reply) => {
    const s = await readSettings(ctx);
    if (s.provider === 'none') return reply.code(409).send({ error: 'Choisissez d\'abord un fournisseur d\'archivage', code: 'no_provider' });
    try {
      const { item } = await testFile(req.user.sub);
      kick();
      req.auditSummary = 'Stockage et archivage : fichier d\'essai archivé';
      return reply.code(201).send({ item });
    } catch (e) { return reply.code(e.code === 'storage_off' ? 503 : 400).send({ error: e.message, code: e.code }); }
  });

  app.get('/studio/storage/archives/:id', admin, async (req, reply) => {
    const it = await getItem(idSchema.parse(req.params).id);
    return it ? { item: it } : reply.code(404).send({ error: 'Archive introuvable' });
  });

  // Restaurer : le fichier revient à sa place dans Garage, vérifié, puis la copie d'archive est effacée.
  app.post('/studio/storage/archives/:id/restore', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const it = await getItem(id);
    if (!it) return reply.code(404).send({ error: 'Archive introuvable' });
    const r = await enqueueRestore(id);
    if (!r) return reply.code(409).send({ error: it.status === 'restored' ? 'Ce fichier est déjà restauré' : 'Ce fichier n\'est pas (encore) dans les archives', code: 'not_archived', status: it.status });
    kick();
    req.auditSummary = `Stockage et archivage : restauration de « ${it.label || it.key} »`;
    return { item: r };
  });

  // Relancer un archivage en échec (rien n'avait été effacé de Garage).
  app.post('/studio/storage/archives/:id/retry', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(
      `UPDATE archive_items SET status = CASE failed_op WHEN 'delete' THEN 'delete_queued' ELSE 'queued' END, error = NULL, failed_op = NULL, updated_at = now()
        WHERE id = $1 AND status = 'failed' AND failed_op IN ('archive', 'delete') RETURNING id`, [id]);
    if (!rows[0]) return reply.code(409).send({ error: 'Seul un archivage en échec peut être relancé', code: 'not_failed' });
    kick();
    req.auditSummary = 'Stockage et archivage : archivage relancé';
    return { item: await getItem(id) };
  });

  // Passer les règles automatiques tout de suite (sinon une fois par jour).
  app.post('/studio/storage/auto-run', admin, async (req, reply) => {
    const s = await readSettings(ctx);
    if (s.provider === 'none') return reply.code(409).send({ error: 'Choisissez d\'abord un fournisseur d\'archivage', code: 'no_provider' });
    const r = await autoArchive(ctx, app.log, { force: true });
    kick();
    req.auditSummary = `Stockage et archivage : règles automatiques (${r.queued} fichier(s))`;
    return r;
  });
}
