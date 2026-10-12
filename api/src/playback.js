// Jeton de lecture court (HMAC) : autorise la lecture des playlists HLS d'une conférence précise.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const sign = (talkId, exp, kind = 'play') =>
  createHmac('sha256', config.jwtSecret).update(`${kind}:${talkId}:${exp}`).digest('base64url');

export function makePlaybackToken(talkId, ttlSeconds = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${exp}.${sign(talkId, exp)}`;
}

// Jeton d'aperçu : mêmes règles mais signature différente ; ne donne accès qu'au début de la vidéo.
export function makePreviewToken(talkId, ttlSeconds = 2 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `p${exp}.${sign(talkId, exp, 'preview')}`;
}

function verify(talkId, token, kind) {
  if (typeof token !== 'string') return false;
  const [rawExp, mac] = token.split('.');
  const exp = kind === 'preview' ? (rawExp || '').replace(/^p/, '') : rawExp;
  if (!exp || !mac || !Number.isFinite(Number(exp)) || Number(exp) < Date.now() / 1000) return false;
  if ((kind === 'preview') !== (rawExp || '').startsWith('p')) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(talkId, exp, kind));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Lecture complète (abonné, gratuit, propriétaire).
export const checkPlaybackToken = (talkId, token) => verify(talkId, token, 'play');

// 'full' | 'preview' | null
export function playbackLevel(talkId, token) {
  if (verify(talkId, token, 'play')) return 'full';
  if (verify(talkId, token, 'preview')) return 'preview';
  return null;
}
