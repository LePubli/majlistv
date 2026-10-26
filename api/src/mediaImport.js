// Étape « Import » : copier chez nous une vidéo qui vit ailleurs (YouTube, Vimeo, archive.org, tout autre site ou lien direct).
// Ce fichier regroupe ce que partagent la création d'une conférence (routes/talks.js), les routes d'import (routes/mediaImport.js)
// et Studio → Activité (routes/activity.js) : déclaration des droits, adresses acceptées, ouverture et annulation d'une demande.
// Le téléchargement est fait par le transcripteur (yt-dlp, archive.org), la conversion HLS par le worker : voir README, « Étape Import ».
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { parseArchiveUrl } from './archive.js';
import { deleteObject } from './storage.js';
import * as ext from './ext.js';

// Déclaration que la personne accepte (case à cocher). La version est gardée avec le texte dans le journal.
export const RIGHTS_VERSION = 'v1';
export const RIGHTS_TEXT = 'Je certifie détenir les droits sur cette vidéo, ou disposer d\'une licence ou d\'une autorisation m\'autorisant à la copier, '
  + 'à la diffuser sur Mejliss TV et à la modifier (montage, sous-titres, doublage). J\'assume la responsabilité de cet import.';
export const ACTIVE = ['pending', 'downloading', 'converting'];

// --- Adresses ------------------------------------------------------------------------------------------------------------------
// Contrôle de forme : le transcripteur refait le vrai contrôle (résolution DNS) avant tout téléchargement.
export function isPrivateHost(hostname) {
  let h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) h = mapped[1];
  const kind = net.isIP(h);
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (kind === 6) return h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  // Nom sans point (« api », « garage »…) ou suffixe local : réseau interne.
  return !h.includes('.') || /\.(localhost|local|internal|lan|home\.arpa|intranet)$/.test(h);
}

// Adresse saisie -> { url, origin, archive } ou { error }. origin : youtube | vimeo | dailymotion | archive | web.
export function classifyUrl(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > 1000) return { error: 'Adresse invalide', code: 'bad_url' };
  let u;
  try { u = new URL(text); } catch { return { error: 'Adresse invalide', code: 'bad_url' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Seules les adresses http et https sont acceptées', code: 'bad_url' };
  if (u.username || u.password) return { error: 'L\'adresse ne doit pas contenir d\'identifiant ni de mot de passe', code: 'bad_url' };
  if (isPrivateHost(u.hostname)) return { error: 'Cette adresse n\'est pas un site public', code: 'private_url' };
  const host = u.hostname.replace(/^(www|m|player)\./i, '').toLowerCase();
  const archive = parseArchiveUrl(u.toString());
  const origin = host === 'youtu.be' || host === 'youtube.com' ? 'youtube' : host === 'vimeo.com' ? 'vimeo' : host === 'dailymotion.com' || host === 'dai.ly' ? 'dailymotion' : archive ? 'archive' : 'web';
  return { url: u.toString(), origin, archive };
}

// Adresse à copier pour une conférence YouTube / Vimeo / archive.org déjà au catalogue.
export function talkSourceUrl(talk) {
  if (talk.source === 'youtube') return { url: `https://www.youtube.com/watch?v=${talk.video_ref}`, origin: 'youtube', archiveFile: null };
  if (talk.source === 'vimeo') return { url: `https://vimeo.com/${talk.video_ref}`, origin: 'vimeo', archiveFile: null };
  if (talk.source === 'dailymotion') return { url: `https://www.dailymotion.com/video/${talk.video_ref}`, origin: 'dailymotion', archiveFile: null };
  if (talk.source === 'archive') return { url: `https://archive.org/details/${talk.video_ref}`, origin: 'archive', archiveFile: talk.external_file || null };
  return null;
}

// --- Demandes ------------------------------------------------------------------------------------------------------------------
export const newObjectKey = () => `talks/${randomUUID()}`;

export async function userLabel(userId) {
  const r = (await pool.query('SELECT name, email FROM users WHERE id = $1', [userId])).rows[0];
  return r ? `${r.name} <${r.email}>` : String(userId);
}

// Le stockage est-il trop plein pour accepter une copie ? (module « Stockage et archivage » : alerte de place libre). null = on peut.
export async function storageProblem() {
  const sp = await ext.call('storage.space', null);
  if (sp?.alert && sp.freePct != null) return `Le stockage est presque plein (${sp.freePct} % libre) : libérez de la place avant d'importer.`;
  return null;
}

// Ouvre une demande (le client peut être une transaction). Lève l'erreur 23505 si une demande est déjà active pour la conférence.
export async function insertImport(db, { talkId, userId, url, origin, archiveFile = null, newTalk, prevSource = null, objectKey }) {
  const { rows } = await db.query(
    `INSERT INTO media_imports(talk_id, requested_by, requested_by_name, source_url, origin, archive_file, new_talk, prev_source, object_key,
                               rights_confirmed_at, rights_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10) RETURNING id`,
    [talkId, userId, await userLabel(userId), url, origin, archiveFile, newTalk, prevSource, objectKey, `${RIGHTS_VERSION} : ${RIGHTS_TEXT}`]);
  return rows[0].id;
}

// Une conférence créée pour l'import ne peut pas rester « importing » : elle passe en échec (relançable depuis sa fiche).
export const failNewTalk = (talkId, message) => pool.query(
  `UPDATE talks SET video_status = 'failed', video_error = $2 WHERE id = $1 AND video_status = 'importing'`, [talkId, String(message).slice(0, 500)]);

// Annule une demande. Renvoie { done, running } : running = la conversion est déjà lancée, elle va jusqu'au bout.
//   pending / converting en attente : arrêt immédiat (fichier déjà envoyé effacé) ; downloading : le transcripteur s'arrête au prochain point de contrôle.
export async function cancelImport(id) {
  const { rows } = await pool.query('SELECT id, talk_id, status, stage, new_talk, object_key FROM media_imports WHERE id = $1', [id]);
  const m = rows[0];
  if (!m || !ACTIVE.includes(m.status)) return { done: false };
  if (m.status === 'converting' && m.stage) return { done: false, running: true };
  if (m.status === 'downloading') {
    await pool.query('UPDATE media_imports SET cancel_requested = true, updated_at = now() WHERE id = $1', [id]);
    return { done: true, pending: true };
  }
  const res = await pool.query(
    `UPDATE media_imports SET status = 'canceled', stage = NULL, finished_at = now(), updated_at = now(), cancel_requested = false
      WHERE id = $1 AND (status = 'pending' OR (status = 'converting' AND stage IS NULL)) RETURNING id`, [id]);
  if (!res.rowCount) return { done: false, running: true };
  if (m.status === 'converting') await deleteObject(m.object_key).catch(() => {});
  if (m.new_talk) await failNewTalk(m.talk_id, 'Import annulé');
  return { done: true };
}
