// Étape 40 — règles pures du Web Push (sans base de données ni réseau), testées à part.
// Un abonnement n'est accepté que s'il pointe vers un vrai service de notification de navigateur (https, liste blanche) :
// sinon un membre pourrait faire envoyer des requêtes du serveur vers n'importe quelle adresse.
const HOSTS = [
  /^fcm\.googleapis\.com$/,                     // Chrome, Edge, Brave, Opera (Android et ordinateur)
  /^updates\.push\.services\.mozilla\.com$/,    // Firefox
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/,        // anciens Edge
  /^web\.push\.apple\.com$/,                    // Safari / iPhone (site installé)
  /^[a-z0-9-]+\.push\.apple\.com$/,
];

export function endpointAllowed(endpoint) {
  let u;
  try { u = new URL(String(endpoint)); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  return HOSTS.some((re) => re.test(u.hostname));
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// Vérifie un abonnement envoyé par le navigateur. Renvoie { ok, sub } ou { ok:false, error }.
export function parseSubscription(body) {
  const b = body && typeof body === 'object' ? body : {};
  const endpoint = typeof b.endpoint === 'string' ? b.endpoint.trim() : '';
  const p256dh = String(b.keys?.p256dh || '').trim();
  const auth = String(b.keys?.auth || '').trim();
  if (!endpoint || endpoint.length > 2048) return { ok: false, error: 'Adresse d\'abonnement invalide' };
  if (!endpointAllowed(endpoint)) return { ok: false, error: 'Service de notification non reconnu' };
  if (!B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return { ok: false, error: 'Clé de chiffrement invalide' };
  if (!B64URL.test(auth) || auth.length < 16 || auth.length > 32) return { ok: false, error: 'Secret d\'authentification invalide' };
  const loc = String(b.locale || '').slice(0, 2);
  return { ok: true, sub: { endpoint, p256dh, auth, locale: ['fr', 'en', 'ar'].includes(loc) ? loc : 'fr' } };
}

// Contenu envoyé au service worker (petit : le navigateur limite à ~4 Ko).
export function webPayload({ title, body, path = '/', kind = 'info' }) {
  const p = String(path || '/');
  return JSON.stringify({
    title: String(title || 'Mejliss TV').slice(0, 120),
    body: String(body || '').slice(0, 300),
    path: p.startsWith('/') && !p.startsWith('//') ? p.slice(0, 300) : '/',
    kind: String(kind).slice(0, 30),
  });
}

// Un échec définitif (abonnement supprimé ou expiré) : on l'efface. Les autres échecs sont réessayés à la prochaine notification.
export const isGone = (statusCode) => statusCode === 404 || statusCode === 410;
