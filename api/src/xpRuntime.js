// Amélioration 7.2 — Tests A/B : état partagé entre les routes /xp, /admin/experiments et le paiement (tests en cours, exposition, test de prix).
import { pool } from './db.js';
import { VISITOR_RE, assign, hashVisitor } from './experiments.js';

export const BOT = /bot|crawl|spider|headless|lighthouse|preview|curl|python-requests/i;
export const visitorOf = (v) => (typeof v === 'string' && VISITOR_RE.test(v) ? v : null);

// Tests en cours (mis en cache 10 s : /xp/active est appelé à chaque visite).
let cache = { at: 0, list: [] };
export const dropCache = () => { cache = { at: 0, list: [] }; };
export async function running() {
  if (Date.now() - cache.at < 10000) return cache.list;
  const exps = (await pool.query("SELECT id, zone FROM experiments WHERE status = 'running'")).rows;
  const vars = exps.length ? (await pool.query('SELECT experiment_id, key, weight, config FROM experiment_variants WHERE experiment_id = ANY($1::uuid[]) ORDER BY key', [exps.map((e) => e.id)])).rows : [];
  cache = { at: Date.now(), list: exps.map((e) => ({ ...e, variants: vars.filter((v) => v.experiment_id === e.id) })) };
  return cache.list;
}

/**
 * Test de prix en cours pour ce visiteur : { id, key, prices:{month?,year?} } (key = variante tirée au sort), ou null
 * (aucun test, visiteur inconnu ou robot, ou pays à tarification régionale : ces pays gardent leur prix, sans test).
 */
export async function priceAssignment(visitorRaw, userAgent, hasRegion) {
  const visitor = visitorOf(visitorRaw);
  if (!visitor || hasRegion || BOT.test(userAgent || '')) return null;
  const e = (await running()).find((x) => x.zone === 'price');
  if (!e) return null;
  const key = assign(visitor, e.id, e.variants);
  return { id: e.id, key, visitor, hash: hashVisitor(visitor), prices: e.variants.find((v) => v.key === key)?.config?.prices || {} };
}

/** Enregistre que ce visiteur a VU le prix de sa variante (une seule fois). */
export const recordPriceExposure = (a) => pool.query(
  'INSERT INTO experiment_exposures(experiment_id, visitor_hash, variant) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [a.id, a.hash, a.key]);

/** Ce visiteur a-t-il vu le prix de sa variante ? (le paiement n'applique un prix de test qu'à un visiteur à qui il a été montré) */
export async function priceShown(a) {
  return (await pool.query('SELECT 1 FROM experiment_exposures WHERE experiment_id = $1 AND visitor_hash = $2 AND variant = $3', [a.id, a.hash, a.key])).rowCount > 0;
}

/** Métadonnées d'abonnement Stripe → { exp, vh } si elles viennent d'un test de prix (valeurs vérifiées), sinon null. */
export function xpMeta(meta) {
  const exp = meta?.xp_exp; const vh = meta?.xp_vh;
  return typeof exp === 'string' && /^[0-9a-f-]{36}$/.test(exp) && typeof vh === 'string' && /^[0-9a-f]{64}$/.test(vh) ? { exp, vh } : null;
}
