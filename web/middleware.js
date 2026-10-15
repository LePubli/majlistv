// Content-Security-Policy du site public (liste blanche de ce que le navigateur a le droit de charger).
//
// Pourquoi un « middleware » : la politique contient un code aléatoire (nonce) différent à chaque page vue.
// Seuls les scripts portant ce code s'exécutent : un script injecté par une faille (XSS) n'en a pas, il est bloqué.
// Next.js ajoute lui-même le nonce à ses propres scripts quand il lit l'en-tête ci-dessous.
//
// Réglages (variables d'environnement du service majlistv-web, toutes facultatives) :
//   CSP_MODE             enforce (défaut) | report-only (le navigateur signale sans bloquer) | off (aucune CSP)
//   CSP_STORAGE_ORIGINS  adresse(s) du stockage vidéo/images (Garage), ex. https://s3.le-publicitaire.fr — séparées par des virgules.
//                        À défaut, on prend S3_PUBLIC_URL puis S3_ENDPOINT s'ils existent ; sinon tout https: est accepté
//                        pour les images, médias et envois (moins strict, mais le site continue de fonctionner).
//   CSP_EXTRA_FRAME      origines supplémentaires autorisées en cadre (iframe), séparées par des virgules.
import { NextResponse } from 'next/server';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

// Réduit une adresse complète à son origine (https://hote:port), seule forme acceptée par la CSP.
function origin(u) {
  try { return new URL(u).origin; } catch { return null; }
}

export function buildCsp(nonce, { https, dev }) {
  const storage = [...new Set([...list(process.env.CSP_STORAGE_ORIGINS), process.env.S3_PUBLIC_URL, process.env.S3_ENDPOINT]
    .map((u) => (u ? origin(u) : null)).filter(Boolean))];
  // Sans adresse de stockage connue : schéma https: (ou http: en test local) plutôt que de casser les vidéos et images.
  const stor = storage.length ? storage : [https ? 'https:' : 'https: http:'];
  // 'self' : l'aperçu d'Admin → Apparence affiche une page du site dans un cadre (étape I1).
  const frames = ["'self'", 'https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com', ...list(process.env.CSP_EXTRA_FRAME)];
  const d = {
    'default-src': ["'self'"],
    // strict-dynamic : les scripts chargés par un script de confiance (API YouTube / Vimeo) sont autorisés ;
    // les adresses listées ne servent qu'aux très vieux navigateurs qui ignorent strict-dynamic.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", 'https://www.youtube.com', 'https://player.vimeo.com', ...(dev ? ["'unsafe-eval'"] : [])],
    // Les attributs style="…" de React ne peuvent pas porter de nonce : 'unsafe-inline' reste nécessaire pour les styles
    // (risque faible comparé aux scripts).
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://i.ytimg.com', ...stor],
    'media-src': ["'self'", 'blob:', ...stor],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...stor],
    'frame-src': frames,
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  };
  const parts = Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (https) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

export function middleware(req) {
  const mode = (process.env.CSP_MODE || 'enforce').toLowerCase();
  if (mode === 'off') return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const csp = buildCsp(nonce, { https: proto === 'https', dev: process.env.NODE_ENV !== 'production' });
  const header = mode === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';

  // L'en-tête est aussi transmis à Next.js (requête) pour qu'il pose le nonce sur ses scripts.
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set(header, csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set(header, csp);
  return res;
}

export const config = {
  // Pages uniquement : ni fichiers statiques, ni le proxy /api (l'API pose ses propres en-têtes).
  matcher: [{ source: '/((?!api/|_next/static|_next/image|favicon|icon-|apple-touch-icon|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml|webmanifest)$).*)' }],
};
