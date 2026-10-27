// Désinscription en un clic : jeton signé (HMAC) par personne et par catégorie, sans date d'expiration (un lien ancien doit marcher).
// Le jeton ne contient que l'identifiant de la personne et la catégorie ; il ne permet RIEN d'autre que de se désabonner.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

// Catégorie → colonne de users. Liste fixe : jamais de nom de colonne venant de l'extérieur.
export const CATEGORIES = { speakers: 'notify_speakers', weekly: 'notify_weekly', lifecycle: 'notify_lifecycle' };
// Modèles d'e-mail concernés (reçoivent le lien et les en-têtes List-Unsubscribe).
export const KIND_CATEGORY = { speaker_new: 'speakers', weekly_selection: 'weekly', resume_talk: 'lifecycle', welcome_nudge: 'lifecycle', winback: 'lifecycle' };

const sign = (userId, cat) => createHmac('sha256', config.jwtSecret).update(`unsub:${userId}:${cat}`).digest('base64url').slice(0, 32);

export const unsubToken = (userId, cat) => `${userId}.${cat}.${sign(userId, cat)}`;

// Renvoie { userId, cat } si le jeton est authentique, sinon null.
export function parseUnsubToken(token) {
  const m = /^([0-9a-f-]{36})\.([a-z]+)\.([A-Za-z0-9_-]{32})$/.exec(String(token || ''));
  if (!m || !CATEGORIES[m[2]]) return null;
  const good = Buffer.from(sign(m[1], m[2]));
  const given = Buffer.from(m[3]);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  return { userId: m[1], cat: m[2] };
}
