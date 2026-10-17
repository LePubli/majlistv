// Module « Stockage et archivage » — espace Garage, test de connexion, file d'archivage et de restauration (étape S2).
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { pool } from '../../db.js';
import { config } from '../../config.js';
import { storage, headObject, deleteObject, putObject } from '../../storage.js';
import * as ext from '../../ext.js';
import { run, remoteEnv, garageEnv, join, statSize, PROVIDERS } from './rclone.js';

// Réglages du module, lus avec leur nom complet (mod_storage_…).
export const KEYS = ['provider', 'sftp_host', 'sftp_port', 'sftp_user', 'sftp_secret', 's3_endpoint', 's3_region', 's3_bucket', 's3_access_key', 's3_secret_key',
  'webdav_url', 'webdav_user', 'webdav_pass', 'folder', 'encrypt_pass', 'work_audio_days', 'keep_original_days', 'alert_free_pct', 'garage_capacity_gb'];
export const SECRET_KEYS = ['sftp_secret', 's3_secret_key', 'webdav_pass', 'encrypt_pass'];
export const full = (k) => `mod_storage_${k}`;

export async function readSettings(ctx) {
  const s = {};
  for (const k of KEYS) s[k] = await ctx.setting(full(k));
  s.provider = PROVIDERS.includes(s.provider) ? s.provider : 'planethoster';
  for (const k of ['sftp_port', 'work_audio_days', 'keep_original_days', 'alert_free_pct', 'garage_capacity_gb']) s[k] = Number(s[k]);
  return s;
}

// --- État du module (dernier test, dernier passage automatique) ---
export async function getState(k) { return (await pool.query('SELECT v, updated_at FROM storage_state WHERE k = $1', [k])).rows[0] || null; }
export async function setState(k, v) {
  await pool.query(`INSERT INTO storage_state(k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`, [k, JSON.stringify(v)]);
}

// --- Espace utilisé sur Garage : somme des objets du bucket (recalculée au plus toutes les 5 minutes) ---
let usageCache = { at: 0, value: null, running: null };
export async function garageUsage({ fresh = false } = {}) {
  if (!storage) return null;
  if (!fresh && usageCache.value && Date.now() - usageCache.at < 300_000) return usageCache.value;
  if (usageCache.running) return usageCache.running;
  usageCache.running = (async () => {
    let bytes = 0; let objects = 0; let token;
    do {
      const page = await storage.send(new ListObjectsV2Command({ Bucket: config.s3.bucket, ContinuationToken: token }));
      for (const o of page.Contents || []) { bytes += Number(o.Size || 0); objects += 1; }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    usageCache = { at: Date.now(), value: { bytes, objects, measuredAt: new Date().toISOString() }, running: null };
    return usageCache.value;
  })().catch((e) => { usageCache.running = null; throw e; });
  return usageCache.running;
}
export const forgetUsage = () => { usageCache.at = 0; };

// Résumé de l'espace : utilisé, capacité réglée, part libre, alerte.
export async function space(s) {
  let used = null; let error = null;
  try { used = await garageUsage(); } catch (e) { error = e.message; }
  const capacity = Math.max(1, s.garage_capacity_gb) * 1024 ** 3;
  const pct = used ? Math.round((used.bytes / capacity) * 1000) / 10 : null;
  const freePct = pct == null ? null : Math.max(0, Math.round((100 - pct) * 10) / 10);
  return { usedBytes: used?.bytes ?? null, objects: used?.objects ?? null, measuredAt: used?.measuredAt ?? null, capacityBytes: capacity, usedPct: pct, freePct,
    alertPct: s.alert_free_pct, alert: freePct != null && s.alert_free_pct > 0 && freePct < s.alert_free_pct, error };
}

// --- Test de la connexion : dossier créé, petit fichier écrit, relu, effacé ; place disponible si le fournisseur la donne ---
export async function testConnection(s) {
  const t0 = Date.now();
  let r;
  try { r = await remoteEnv(s); } catch (e) { return { ok: false, code: e.code || 'config', message: e.message, ms: 0 }; }
  const { env, base, remote, secrets } = r;
  const probe = join(remote, `.mejliss-test-${Date.now()}.txt`);
  const body = `Mejliss TV — test de connexion ${new Date().toISOString()}\n`;
  const steps = [
    ['mkdir', ['mkdir', base]],
    ['write', ['rcat', probe], body],
    ['read', ['cat', probe]],
    ['delete', ['deletefile', probe]],
  ];
  for (const [name, args, input] of steps) {
    const x = await run(args, { env, input, timeoutMs: 90_000, secrets });
    if (x.code !== 0) return { ok: false, code: `step_${name}`, step: name, message: x.stderr || `échec (${x.code})`, ms: Date.now() - t0 };
    if (name === 'read' && x.stdout !== body) return { ok: false, code: 'step_read', step: 'read', message: 'Le fichier relu ne correspond pas au fichier envoyé', ms: Date.now() - t0 };
  }
  let about = null;
  const a = await run(['about', '--json', base.split(':')[0] + ':'], { env, timeoutMs: 60_000, secrets });
  if (a.code === 0) { try { const j = JSON.parse(a.stdout); about = { totalBytes: j.total ?? null, usedBytes: j.used ?? null, freeBytes: j.free ?? null }; } catch { /* facultatif */ } }
  return { ok: true, message: 'Connexion réussie : écriture, lecture et effacement vérifiés', ms: Date.now() - t0, about, encrypted: r.encrypted };
}

// --- File d'archivage et de restauration (une opération à la fois, dans l'API) ---
const ITEM_COLS = `a.id, a.source_key AS "key", a.kind, a.label, a.talk_id AS "talkId", t.title AS "talkTitle", a.bytes::float8 AS bytes, a.provider, a.encrypted, a.status,
  a.failed_op AS "failedOp", a.error, a.created_at AS "createdAt", a.archived_at AS "archivedAt", a.restored_at AS "restoredAt", a.updated_at AS "updatedAt"`;
export const ITEMS_FROM = 'archive_items a LEFT JOIN talks t ON t.id = a.talk_id';
export async function getItem(id) { return (await pool.query(`SELECT ${ITEM_COLS} FROM ${ITEMS_FROM} WHERE a.id = $1`, [id])).rows[0] || null; }
export async function listItems({ status = 'live', limit = 200 } = {}) {
  const where = status === 'live' ? "a.status NOT IN ('restored')" : status === 'history' ? "a.status = 'restored'" : 'true';
  return (await pool.query(`SELECT ${ITEM_COLS} FROM ${ITEMS_FROM} WHERE ${where} ORDER BY a.updated_at DESC LIMIT $1`, [limit])).rows;
}
export async function totals() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n, COALESCE(sum(bytes), 0)::bigint AS bytes,
            count(*) FILTER (WHERE kind LIKE 'dub_%')::int AS audio, count(*) FILTER (WHERE kind IN ('original', 'render'))::int AS video
     FROM archive_items WHERE status IN ('archived', 'restore_queued', 'restoring')`);
  const r = rows[0];
  return { count: r.n, bytes: Number(r.bytes), audio: r.audio, video: r.video, other: r.n - r.audio - r.video };
}
// Archive « vivante » d'un fichier de Garage (point d'extension archive.lookup).
export async function lookup(key) {
  const r = (await pool.query(`SELECT ${ITEM_COLS} FROM ${ITEMS_FROM} WHERE a.source_key = $1 AND a.status NOT IN ('restored', 'failed') ORDER BY a.created_at DESC LIMIT 1`, [key])).rows[0];
  return r || null;
}

// Met un fichier de Garage dans la file d'archivage. Renvoie l'archive (existante si le fichier est déjà archivé ou en cours).
export async function enqueueArchive({ key, kind = 'other', label = '', talkId = null, userId = null, deleteSource = true }) {
  const live = await lookup(key);
  if (live) return { item: live, existing: true };
  const { rows } = await pool.query(
    `INSERT INTO archive_items(source_key, kind, label, talk_id, created_by, delete_source) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING RETURNING id`, [key, kind, label.slice(0, 300), talkId, userId, deleteSource]);
  if (!rows[0]) return { item: await lookup(key), existing: true };
  return { item: await getItem(rows[0].id), existing: false };
}

export async function enqueueRestore(id) {
  const { rows } = await pool.query(
    `UPDATE archive_items SET status = 'restore_queued', error = NULL, failed_op = NULL, updated_at = now()
     WHERE id = $1 AND (status = 'archived' OR (status = 'failed' AND failed_op = 'restore')) RETURNING id`, [id]);
  return rows[0] ? getItem(id) : null;
}

// Après un arrêt brutal de l'API, les opérations « en cours » repartent.
export async function recover() {
  await pool.query(`UPDATE archive_items SET status = 'queued', updated_at = now() WHERE status = 'archiving'`);
  await pool.query(`UPDATE archive_items SET status = 'restore_queued', updated_at = now() WHERE status = 'restoring'`);
}

// Étape S3 : pause et priorité réglées dans Studio → Activité (fonctions SQL de la migration 055 de l'API).
let controlsReady = null;
async function hasControls() {
  if (controlsReady === null) controlsReady = Boolean((await pool.query("SELECT to_regprocedure('activity_paused(text,text)') AS f")).rows[0].f);
  return controlsReady;
}
async function claim() {
  const ctl = await hasControls();
  const PAUSED = ctl ? "activity_paused('archive', id::text)" : 'false';
  const PRIORITY = ctl ? "activity_priority('archive', id::text)" : '0';
  const { rows } = await pool.query(
    `UPDATE archive_items SET status = CASE status WHEN 'queued' THEN 'archiving' ELSE 'restoring' END, attempts = attempts + 1, updated_at = now()
     WHERE id = (SELECT id FROM archive_items WHERE status IN ('queued', 'restore_queued') AND NOT ${PAUSED}
                 ORDER BY ${PRIORITY} DESC, updated_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`);
  return rows[0] || null;
}
async function fail(item, op, message) {
  // Archivage raté : rien n'a été effacé de Garage (on n'efface qu'après vérification). Restauration ratée : l'archive reste disponible.
  await pool.query(`UPDATE archive_items SET status = 'failed', failed_op = $2, error = $3, updated_at = now() WHERE id = $1`,
    [item.id, op, String(message).slice(0, 600)]);
}

async function doArchive(item, s, log) {
  let head;
  try { head = await headObject(item.source_key); } catch { return fail(item, 'archive', 'Fichier introuvable dans Garage'); }
  const size = Number(head.ContentLength);
  let r; let g;
  try { r = await remoteEnv(s); g = garageEnv(); } catch (e) { return fail(item, 'archive', e.message); }
  const env = { ...g.env, ...r.env }; const secrets = [...g.secrets, ...r.secrets];
  const dest = join(r.remote, item.source_key);
  const x = await run(['copyto', g.path(item.source_key), dest], { env, secrets });
  if (x.code !== 0) return fail(item, 'archive', `Envoi : ${x.stderr || x.code}`);
  // Vérification : le fichier existe chez le fournisseur avec la même taille (rclone contrôle aussi l'empreinte quand les deux côtés la donnent).
  const st = await statSize(env, dest, secrets);
  if (st.size !== size) return fail(item, 'archive', `Vérification : taille ${st.size ?? 'absente'} au lieu de ${size}${st.error ? ` (${st.error})` : ''}`);
  if (item.delete_source) {
    try { await deleteObject(item.source_key); } catch (e) { log?.warn?.(`Archivage : fichier gardé dans Garage (${e.message})`); }
    forgetUsage();
  }
  await pool.query(
    `UPDATE archive_items SET status = 'archived', bytes = $2, provider = $3, remote_path = $4, encrypted = $5, error = NULL, failed_op = NULL,
       archived_at = now(), updated_at = now() WHERE id = $1`, [item.id, size, s.provider, item.source_key, r.encrypted]);
  await ext.emit('archive.archived', { id: item.id, key: item.source_key, kind: item.kind, talkId: item.talk_id }).catch(() => {});
  return true;
}

async function doRestore(item, s, log) {
  let r; let g;
  try { r = await remoteEnv(s); g = garageEnv(); } catch (e) { return fail(item, 'restore', e.message); }
  if (Boolean(item.encrypted) !== r.encrypted) {
    return fail(item, 'restore', item.encrypted ? 'Cette archive est chiffrée : la phrase de chiffrement doit être réglée' : 'Cette archive n\'est pas chiffrée : retirez la phrase de chiffrement le temps de la restaurer');
  }
  const env = { ...g.env, ...r.env }; const secrets = [...g.secrets, ...r.secrets];
  const src = join(r.remote, item.remote_path || item.source_key);
  const x = await run(['copyto', src, g.path(item.source_key)], { env, secrets });
  if (x.code !== 0) return fail(item, 'restore', `Récupération : ${x.stderr || x.code}`);
  let size = null;
  try { size = Number((await headObject(item.source_key)).ContentLength); } catch { /* vérifié ci-dessous */ }
  if (item.bytes != null && size !== Number(item.bytes)) return fail(item, 'restore', `Vérification : taille ${size ?? 'absente'} au lieu de ${item.bytes}`);
  // Le fichier est de retour sur Garage et vérifié : la copie chez le fournisseur est effacée.
  const d = await run(['deletefile', src], { env, secrets, timeoutMs: 300_000 });
  if (d.code !== 0) log?.warn?.(`Restauration : copie d'archive non effacée (${d.stderr})`);
  forgetUsage();
  await pool.query(`UPDATE archive_items SET status = 'restored', error = NULL, failed_op = NULL, restored_at = now(), updated_at = now() WHERE id = $1`, [item.id]);
  await ext.emit('archive.restored', { id: item.id, key: item.source_key, kind: item.kind, talkId: item.talk_id }).catch(() => {});
  return true;
}

// Traite la file jusqu'à ce qu'elle soit vide. `busy` empêche deux passages simultanés.
let busy = false;
export async function processQueue(ctx, log) {
  if (busy) return 0;
  busy = true; let n = 0;
  try {
    for (;;) {
      const item = await claim();
      if (!item) break;
      const s = await readSettings(ctx);
      if (item.status === 'archiving') await doArchive(item, s, log); else await doRestore(item, s, log);
      n += 1;
    }
  } finally { busy = false; }
  return n;
}

// --- Fichier d'essai : écrit dans Garage puis archivé (recette de l'étape S2) ---
export async function testFile(userId) {
  if (!storage) throw Object.assign(new Error('Stockage Garage non configuré'), { code: 'storage_off' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `storage-test/essai-${stamp}.txt`;
  const body = Buffer.from(`Mejliss TV — fichier d'essai de l'archivage\nCréé le ${new Date().toISOString()}\n${'Archivé puis restauré pour vérifier le fournisseur.\n'.repeat(20)}`);
  await putObject(key, body, 'text/plain; charset=utf-8');
  return enqueueArchive({ key, kind: 'test', label: `Fichier d'essai ${stamp.slice(0, 10)}`, userId });
}

// --- Archivage automatique : chaque module annonce ses fichiers de travail (événement archive.collect) ---
export async function autoArchive(ctx, log, { force = false } = {}) {
  const s = await readSettings(ctx);
  if (s.provider === 'none' || !(s.work_audio_days > 0)) return { queued: 0, skipped: 'off' };
  const last = await getState('auto_last_run');
  if (!force && last && Date.now() - new Date(last.updated_at).getTime() < 20 * 3600_000) return { queued: 0, skipped: 'recent' };
  const out = [];
  await ext.emit('archive.collect', out, { kind: 'work_audio', olderThanDays: s.work_audio_days });
  let queued = 0;
  // Un fichier restauré récemment (moins de N jours) n'est pas renvoyé tout de suite aux archives.
  const recent = new Set((await pool.query(
    `SELECT source_key FROM archive_items WHERE status = 'restored' AND restored_at > now() - make_interval(days => $1)`, [s.work_audio_days])).rows.map((r) => r.source_key));
  for (const c of out) {
    if (!c?.key || recent.has(c.key)) continue;
    try { await headObject(c.key); } catch { continue; } // fichier déjà absent de Garage : rien à archiver
    const r = await enqueueArchive({ key: c.key, kind: c.kind || 'other', label: c.label || '', talkId: c.talkId || null });
    if (!r.existing) queued += 1;
  }
  await setState('auto_last_run', { at: new Date().toISOString(), candidates: out.length, queued });
  if (queued) log?.info?.(`Archivage automatique : ${queued} fichier(s) mis en file`);
  return { queued, candidates: out.length };
}

// --- Étape S3 : Studio → Activité et tableau de bord ---
export async function collectTasks(out, { organizerId }) {
  if (organizerId) return; // l'archivage ne concerne que l'administrateur
  const { rows } = await pool.query(
    `SELECT a.id, a.source_key, a.label, a.status, a.failed_op, a.error, a.created_at, a.talk_id, t.title
       FROM archive_items a LEFT JOIN talks t ON t.id = a.talk_id
      WHERE a.status IN ('queued', 'archiving', 'restore_queued', 'restoring') OR (a.status = 'failed' AND a.updated_at > now() - interval '30 days')
      ORDER BY a.updated_at`);
  for (const r of rows) {
    const restore = ['restore_queued', 'restoring'].includes(r.status) || r.failed_op === 'restore';
    out.push({ queue: 'archive', ref: r.id, talkId: r.talk_id, title: r.label || r.source_key, kind: restore ? 'restore' : 'archive',
      status: ['archiving', 'restoring'].includes(r.status) ? 'running' : r.status === 'failed' ? 'failed' : 'waiting',
      progress: null, error: r.error, createdAt: r.created_at, link: '/studio/settings/storage' });
  }
}
export async function overviewPart(ctx, out, { isAdmin }) {
  if (!isAdmin) return;
  const s = await readSettings(ctx);
  out.storage = { space: await space(s), archives: await totals(), provider: s.provider };
}
