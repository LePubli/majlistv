// Aides « référencement » côté serveur : lecture des données publiques de l'API (/seo/…), adresses absolues, JSON-LD.
const API = () => process.env.API_URL || 'http://localhost:3000';

// GET /seo/… : null si introuvable ou API injoignable (la page se rend alors sans balises riches, jamais en erreur).
export async function seoGet(path) {
  try {
    const res = await fetch(`${API()}/seo/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function seoSite() {
  const s = await seoGet('site');
  return s || { baseUrl: (process.env.WEB_URL || 'http://localhost:3001').replace(/\/$/, ''), appName: process.env.APP_NAME || 'Mejliss TV', description: '' };
}

export const absolute = (base, path) => (path ? (/^https?:\/\//.test(path) ? path : `${base}${path}`) : null);
export const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };

// Durée au format ISO 8601 (PT1H2M3S), exigé par Google pour les vidéos.
export function isoDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return undefined;
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${r || (!h && !m) ? `${r}S` : ''}`;
}

// Balise <script type="application/ld+json"> : « < » échappé pour qu'aucun contenu ne puisse fermer la balise.
export const jsonLd = (data) => ({ __html: JSON.stringify(data).replace(/</g, '\\u003c') });
