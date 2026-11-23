'use client';
// Publicité : mesure des inscriptions venues d'une publicité. Un clic mène vers notre site avec ?ad=<identifiant> ;
// on le garde dans le navigateur (7 jours), puis on le rattache au compte juste après l'inscription.
// Aucune donnée personnelle : seul l'identifiant de la publicité est gardé. Visiteur qui refuse le suivi (Do Not Track, GPC) : rien n'est gardé.
import { trackingRefused } from './experiments';

const KEY = 'mtv_adref';
const TTL_MS = 7 * 24 * 3600 * 1000;
export const AD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Retient ?ad=<id> de l'adresse courante (appelé à chaque chargement de page). */
export function captureAdRef(search) {
  if (trackingRefused()) return;
  try {
    const id = new URLSearchParams(search).get('ad');
    if (id && AD_ID_RE.test(id)) localStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() }));
  } catch { /* stockage indisponible : pas de mesure */ }
}

/** Identifiant retenu s'il est encore valide, sinon null. */
export function readAdRef() {
  if (trackingRefused()) return null;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && AD_ID_RE.test(v.id) && Date.now() - v.at < TTL_MS ? v.id : null;
  } catch { return null; }
}

/** Juste après une inscription : rattache le compte à la publicité, puis oublie l'identifiant. Sans gravité en cas d'échec. */
export async function claimAdRef(call, token) {
  const ad = readAdRef();
  if (!ad) return;
  try { await call('/me/ad-attribution', { method: 'POST', body: JSON.stringify({ ad }) }, token); } catch { /* sans gravité */ }
  try { localStorage.removeItem(KEY); } catch { /* idem */ }
}
