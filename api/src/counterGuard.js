// Compteurs publics (publicités, tests A/B) : sans connexion, n'importe qui peut les envoyer en boucle (relecture 25/11).
// On limite, par visiteur (adresse + navigateur) et par jour, le nombre d'évènements comptés d'un même type sur une même
// publicité ; au-delà, la requête répond « ok » sans rien compter (le visiteur honnête ne voit aucune erreur).
// Mémoire du processus : un redémarrage remet les compteurs à zéro, ce qui suffit pour freiner l'abus.
import { createHash } from 'node:crypto';

const seen = new Map(); // clé → { n, day }
const day = (now) => Math.floor(now / 86400000);
const MAX_KEYS = 200000;

export const visitorKey = (req) => createHash('sha256').update(`${req.ip}|${req.headers?.['user-agent'] || ''}`).digest('base64url').slice(0, 16);

// true = compter ; false = ignorer (quota du jour atteint).
export function allowCount(key, max, now = Date.now()) {
  const d = day(now);
  const e = seen.get(key);
  if (!e || e.day !== d) {
    if (seen.size > MAX_KEYS) for (const [k, v] of seen) if (v.day !== d) seen.delete(k);
    seen.set(key, { n: 1, day: d });
    return true;
  }
  if (e.n >= max) return false;
  e.n += 1;
  return true;
}
export const resetCounterGuard = () => seen.clear(); // tests

// Quotas par visiteur, par publicité et par jour.
export const AD_LIMITS = { impressions: 30, clicks: 5, skips: 30, watch: 30 };
