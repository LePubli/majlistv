// Statistiques d'audience anonymes (étape 18) : collecte des compteurs du jour et entretien (purge).
// Aucune donnée personnelle n'est écrite : ni adresse IP, ni cookie, ni identifiant durable. Une « empreinte du jour »
// (HMAC de l'adresse + navigateur + jour, avec une clé du serveur) sert seulement à ne compter une personne qu'une fois
// par jour ; elle est supprimée au bout de 2 jours et ne peut pas être inversée sans la clé.
import crypto from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';
import { TZ } from './revision.js';

export const RETENTION_DAYS = 800;   // les compteurs sont gardés environ 26 mois
const SEEN_DAYS = 2;

// Jour courant à Paris (AAAA-MM-JJ).
export const todayStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|axios|node-fetch/i;
export const isBot = (ua) => !ua || BOT.test(ua);

// Empreinte du jour : { jour, type, éléments } -> texte court. Dépend d'une clé secrète : sans elle, impossible de remonter à l'adresse.
export const fingerprint = (day, kind, ...parts) =>
  crypto.createHmac('sha256', `stats:${config.jwtSecret}`).update([day, kind, ...parts].join('|')).digest('base64url').slice(0, 22);

// true si cette empreinte est nouvelle aujourd'hui (donc la personne est comptée), false si elle a déjà été vue.
export async function firstToday(day, kind, h) {
  const r = await pool.query('INSERT INTO stat_seen(day, kind, h) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [day, kind, h]);
  return r.rowCount === 1;
}

const SEARCH = /(^|\.)(google|bing|duckduckgo|ecosia|qwant|yahoo|yandex|baidu|brave)\./i;
const SOCIAL = /(^|\.)(facebook|instagram|twitter|x|t|linkedin|tiktok|youtube|youtu|whatsapp|telegram|snapchat|pinterest|reddit|threads)\.(com|co|me|be|net|org)$/i;

// Provenance : 'direct' | 'search' | 'social' | 'other' | 'internal' (navigation dans le site : ignorée) + nom de domaine externe.
export function classifySource(ref, host) {
  if (!ref) return { source: 'direct', domain: null };
  let h;
  try { h = new URL(ref).hostname.toLowerCase().replace(/^www\./, ''); } catch { return { source: 'direct', domain: null }; }
  if (!h) return { source: 'direct', domain: null };
  if (host && (h === host || h === String(host).replace(/^www\./, ''))) return { source: 'internal', domain: null };
  if (SEARCH.test(h)) return { source: 'search', domain: h.slice(0, 60) };
  if (SOCIAL.test(h)) return { source: 'social', domain: h.slice(0, 60) };
  return { source: 'other', domain: h.slice(0, 60) };
}

export function deviceOf(ua) {
  const u = String(ua || '');
  if (/ipad|tablet|kindle|silk/i.test(u) || (/android/i.test(u) && !/mobile/i.test(u))) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(u)) return 'mobile';
  return 'desktop';
}

export function langOf(header) {
  const l = String(header || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  return ['fr', 'en', 'ar'].includes(l) ? l : 'other';
}

export const countryOf = (headers) => {
  const c = String(headers['cf-ipcountry'] || headers['x-country-code'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null;
};

// --- Écritures (additions atomiques) ---
export const addDim = (day, audience, dim, value, views, visitors) => pool.query(
  `INSERT INTO stat_dim_daily(day, audience, dim, value, views, visitors) VALUES ($1, $2, $3, $4, $5, $6)
   ON CONFLICT (day, audience, dim, value) DO UPDATE SET views = stat_dim_daily.views + EXCLUDED.views, visitors = stat_dim_daily.visitors + EXCLUDED.visitors`,
  [day, audience, dim, value, views, visitors]);

const COLS = ['views', 'viewers', 'plays', 'seconds', 'q25', 'q50', 'q75', 'completes'];
// inc : { views: 1, plays: 1, ... } (seules les colonnes connues sont acceptées)
export async function addTalk(day, talkId, audience, inc) {
  const v = COLS.map((c) => Math.max(0, Math.trunc(Number(inc[c]) || 0)));
  await pool.query(
    `INSERT INTO stat_talk_daily(day, talk_id, audience, ${COLS.join(', ')}) VALUES ($1, $2, $3, ${COLS.map((_, i) => `$${i + 4}`).join(', ')})
     ON CONFLICT (day, talk_id, audience) DO UPDATE SET ${COLS.map((c) => `${c} = stat_talk_daily.${c} + EXCLUDED.${c}`).join(', ')}`,
    [day, talkId, audience, ...v]);
}
export const addTalkDim = (day, talkId, dim, value, views) => pool.query(
  `INSERT INTO stat_talk_dim_daily(day, talk_id, dim, value, views) VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (day, talk_id, dim, value) DO UPDATE SET views = stat_talk_dim_daily.views + EXCLUDED.views`,
  [day, talkId, dim, value, views]);

// Entretien : supprime les empreintes de plus de 2 jours et les compteurs de plus de ~26 mois. Toutes les heures.
export async function purgeStats() {
  await pool.query(`DELETE FROM stat_seen WHERE day < ($1::date - ${SEEN_DAYS})`, [todayStr()]);
  for (const t of ['stat_dim_daily', 'stat_talk_daily', 'stat_talk_dim_daily']) {
    await pool.query(`DELETE FROM ${t} WHERE day < ($1::date - ${RETENTION_DAYS})`, [todayStr()]);
  }
}
export function startStatsMaintenance(log) {
  const run = () => purgeStats().catch((e) => log?.error?.(e, 'Entretien des statistiques'));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
