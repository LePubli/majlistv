// Étape 39 — Suivi des erreurs : calculs purs (testés avec Node, aucune base requise).
import { createHash } from 'node:crypto';

/** Masque tout ce qui pourrait identifier quelqu'un ou ouvrir un accès : e-mails, jetons, longues chaînes secrètes, adresses IP, paramètres d'adresse. */
export function scrub(text) {
  return String(text ?? '')
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, '[jeton]')
    .replace(/Bearer\s+[\w.~+/=-]{8,}/gi, 'Bearer [jeton]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]')
    .replace(/\?[^\s"'<>)]*/g, '?[…]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[secret]');
}

export const clip = (text, n) => { const s = String(text ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Adresse sans paramètres, avec les identifiants remplacés (« /talks/:id/quiz ») : deux conférences différentes = la même erreur. */
export function normRoute(route) {
  let r = String(route ?? '').split('?')[0].split('#')[0];
  try { if (/^https?:\/\//i.test(r)) r = new URL(r).pathname; } catch { /* adresse invalide : gardée telle quelle */ }
  return clip(r.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, '/:id'), 200);
}

/** Empreinte : même source + même message (chiffres et identifiants gommés) + même route = même erreur. */
export function fingerprint(source, message, route) {
  const m = scrub(message).replace(UUID, '<id>').replace(/\d+/g, '<n>').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 200);
  return createHash('sha1').update(`${source}|${m}|${normRoute(route)}`).digest('hex').slice(0, 16);
}

/** Bruit du navigateur sans intérêt (extensions, réseau coupé, scripts tiers) : jamais enregistré. */
export function isNoise(message, stack = '') {
  const m = String(message ?? '');
  if (!m.trim()) return true;
  if (/ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|Load failed$|Failed to fetch$|NetworkError when attempting|The operation was aborted|AbortError|cancelled$/i.test(m)) return true;
  if (/(chrome|moz|safari)-extension:\/\/|webkit-masked-url|extension\//i.test(String(stack))) return true;
  return false;
}

/** Faut-il prévenir ? prev = ligne existante (state) ou null. Une fois par erreur nouvelle, et quand une erreur « résolue » revient. Les erreurs ignorées ne préviennent jamais. */
export function alertKind(prev) {
  if (!prev) return 'new';
  if (prev.state === 'resolved') return 'regression';
  return null;
}

/** Limiteur à fenêtre fixe : au plus `max` événements par fenêtre (protège la base et la boîte mail d'une avalanche). */
export function makeLimiter(max, windowMs) {
  let start = 0, n = 0;
  return { allow(now = Date.now()) { if (now - start >= windowMs) { start = now; n = 0; } if (n >= max) return false; n++; return true; } };
}

/** Textes de l'e-mail d'alerte. */
export function alertText(kind, g) {
  const where = g.source === 'api' ? 'sur le serveur' : 'sur le site (navigateur)';
  const what = clip(g.message, 90);
  return {
    title: kind === 'regression' ? `Erreur revenue ${where} : ${what}` : `Nouvelle erreur ${where} : ${what}`,
    summary: `${kind === 'regression' ? 'Une erreur marquée « résolue » est revenue. ' : ''}${g.route ? `Page ou route : ${g.route}. ` : ''}${g.count > 1 ? `${g.count} occurrences.` : 'Première occurrence.'}`.trim(),
    advice: 'Ouvrez Admin → Erreurs pour voir la trace complète, puis donnez-la à Claude (« corrige cette erreur ») ou marquez-la résolue / ignorée.',
  };
}
