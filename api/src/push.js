// Étape 22b-4 — Notifications sur téléphone via Firebase Cloud Messaging (API HTTP v1), sans dépendance externe.
// Réglage : Admin → Paramètres → Notifications → « Fichier de clé Firebase » (le JSON du compte de service). Vide = aucune notification envoyée.
// L'application enregistre le jeton de l'appareil (POST /me/push-token) ; les boucles d'e-mails appellent pushToUser() en plus de l'e-mail.
import { createSign } from 'node:crypto';
import { pool } from './db.js';
import { getSetting } from './settings.js';
import { featureOn } from './features.js';
import { webPushToUser, anyWebSubscription } from './webPush.js';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const API_BASE = () => process.env.FCM_API_BASE || 'https://fcm.googleapis.com'; // surchargé uniquement par les tests
const state = { sig: '', token: null, exp: 0 };

// Lit le fichier de clé (JSON brut, ou le même JSON encodé en base64). Renvoie null s'il est absent ou invalide.
export function parseServiceAccount(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  try {
    if (!s.startsWith('{')) s = Buffer.from(s, 'base64').toString('utf8');
    const j = JSON.parse(s);
    if (!j.client_email || !j.private_key || !j.project_id) return null;
    return { email: j.client_email, key: String(j.private_key).replace(/\\n/g, '\n'), project: j.project_id, tokenUri: j.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch { return null; }
}

export async function pushConf() { return parseServiceAccount(await getSetting('fcm_service_account')); }
export async function pushConfigured() { return Boolean(await pushConf()); }
// Étape 40 : y a-t-il au moins un canal de notification (téléphone via Firebase OU navigateur via Web Push) ?
export async function anyPushChannel() {
  if (await pushConfigured()) return true;
  try { return (await featureOn('webpush')) && (await anyWebSubscription()); } catch { return false; }
}

const b64u = (b) => Buffer.from(b).toString('base64url');

// Jeton d'accès OAuth2 (valable 1 h, gardé en mémoire).
async function accessToken(conf) {
  const sig = conf.email + conf.project;
  if (state.sig === sig && state.token && Date.now() < state.exp - 60000) return state.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: conf.email, scope: SCOPE, aud: conf.tokenUri, iat: now, exp: now + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(conf.key, 'base64url');
  const res = await fetch(conf.tokenUri, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${signature}` }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google a refusé la clé Firebase (${res.status} ${j.error_description || j.error || ''})`.trim());
  Object.assign(state, { sig, token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
  return state.token;
}
export const resetPushCache = () => { state.sig = ''; state.token = null; state.exp = 0; };

// Envoie un message à UN appareil. Renvoie 'ok', 'gone' (jeton périmé : à supprimer) ou lève une erreur (réessayer plus tard).
export async function sendToDevice(conf, deviceToken, { title, body, path = '/', kind = 'info' }) {
  const res = await fetch(`${API_BASE()}/v1/projects/${conf.project}/messages:send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken(conf)}` },
    body: JSON.stringify({ message: { token: deviceToken, notification: { title, body }, data: { path: String(path), kind: String(kind) },
      android: { priority: 'HIGH', notification: { channel_id: 'news' } } } }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) return 'ok';
  const j = await res.json().catch(() => ({}));
  const status = j?.error?.status || '';
  if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED' || (res.status === 400 && status === 'INVALID_ARGUMENT')) return 'gone';
  if (res.status === 401) resetPushCache();
  throw new Error(`FCM ${res.status} ${status} ${j?.error?.message || ''}`.trim());
}

// --- Textes (fr / en / ar) : titre court, message court.
const LANG = (l) => (['fr', 'en', 'ar'].includes(String(l).slice(0, 2)) ? String(l).slice(0, 2) : 'fr');
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const TEXTS = {
  speaker_new: {
    fr: (v) => ({ title: v.count > 1 ? `${v.count} nouvelles conférences` : 'Nouvelle conférence', body: cut(v.titles.join(' · '), 140) + (v.speakers ? ` — ${cut(v.speakers, 60)}` : '') }),
    en: (v) => ({ title: v.count > 1 ? `${v.count} new talks` : 'New talk', body: cut(v.titles.join(' · '), 140) + (v.speakers ? ` — ${cut(v.speakers, 60)}` : '') }),
    ar: (v) => ({ title: v.count > 1 ? `${v.count} محاضرات جديدة` : 'محاضرة جديدة', body: cut(v.titles.join(' · '), 140) + (v.speakers ? ` — ${cut(v.speakers, 60)}` : '') }),
  },
  weekly_selection: {
    fr: (v) => ({ title: 'La sélection de la semaine', body: cut(v.titles.join(' · '), 160) }),
    en: (v) => ({ title: 'This week’s selection', body: cut(v.titles.join(' · '), 160) }),
    ar: (v) => ({ title: 'اختيارات الأسبوع', body: cut(v.titles.join(' · '), 160) }),
  },
  revision_daily: {
    fr: (v) => ({ title: 'À réviser aujourd’hui', body: v.count > 1 ? `${v.count} conférences à réviser` : '1 conférence à réviser' }),
    en: (v) => ({ title: 'To review today', body: v.count > 1 ? `${v.count} talks to review` : '1 talk to review' }),
    ar: (v) => ({ title: 'للمراجعة اليوم', body: v.count > 1 ? `${v.count} محاضرات للمراجعة` : 'محاضرة واحدة للمراجعة' }),
  },
};
export const pushText = (kind, locale, vars) => TEXTS[kind][LANG(locale)](vars);

// Envoie une notification à tous les téléphones d'un compte (si l'interrupteur « notifications sur le téléphone » est actif).
// Renvoie le nombre d'appareils atteints. Ne lève jamais : un échec d'envoi ne doit pas bloquer les boucles d'e-mails.
export async function pushToUser(userId, kind, vars, path, log) {
  let sent = 0;
  try {
    const on = (await pool.query('SELECT notify_push FROM users WHERE id = $1', [userId])).rows[0]?.notify_push;
    if (!on) return 0;
    const conf = await pushConf();
    if (conf) {
      const { rows } = await pool.query(
        `SELECT d.token, u.locale FROM device_tokens d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`, [userId]);
      for (const d of rows) {
        try {
          const msg = pushText(kind, d.locale, vars);
          const r = await sendToDevice(conf, d.token, { ...msg, path, kind });
          if (r === 'ok') sent += 1;
          else await pool.query('DELETE FROM device_tokens WHERE token = $1', [d.token]);
        } catch (err) { log?.warn?.(`Notification (${userId}) : ${err.message}`); }
      }
    }
    // Navigateurs (étape 40) : mêmes textes, même interrupteur « notifications » du compte.
    if (await featureOn('webpush')) sent += await webPushToUser(userId, (loc) => pushText(kind, loc, vars), path, kind, log);
    return sent;
  } catch (err) {
    log?.warn?.(`Notification (${userId}) : ${err.message}`);
    return sent;
  }
}

// Test depuis le back-office : vérifie la clé auprès de Google, puis envoie une notification aux appareils de l'administrateur.
export async function testPush(userId) {
  const conf = await pushConf();
  if (!conf) return { ok: false, message: "Collez d'abord le fichier de clé Firebase (JSON) et enregistrez." };
  resetPushCache();
  await accessToken(conf);
  const { rows } = await pool.query('SELECT token FROM device_tokens WHERE user_id = $1', [userId]);
  const total = (await pool.query('SELECT count(*)::int AS n FROM device_tokens')).rows[0].n;
  if (!rows.length) return { ok: true, message: `Clé valide (projet ${conf.project}). Aucun téléphone de votre compte n'est encore enregistré (${total} au total) : ouvrez l'application, connectez-vous et acceptez les notifications, puis relancez le test.` };
  let sent = 0;
  for (const d of rows) {
    const r = await sendToDevice(conf, d.token, { title: 'Mejliss TV', body: 'Test de notification : tout fonctionne.', path: '/', kind: 'test' });
    if (r === 'ok') sent += 1; else await pool.query('DELETE FROM device_tokens WHERE token = $1', [d.token]);
  }
  return { ok: sent > 0, message: sent ? `Clé valide (projet ${conf.project}). Notification envoyée à ${sent} appareil(s).` : "Clé valide, mais les téléphones enregistrés ne répondent plus (jetons périmés, supprimés). Rouvrez l'application." };
}
