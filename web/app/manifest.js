// Étape 22a — manifeste du site installable (PWA), servi à /manifest.webmanifest.
// Nom du site : Admin → Paramètres ; couleurs : thème publié (Admin → Apparence). Icônes : public/icon-*.png.
import { siteTheme, themeBg } from '../lib/theme';

export const dynamic = 'force-dynamic';

async function appName() {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/config`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    const c = await res.json();
    if (c.appName) return c.appName;
  } catch { /* API injoignable : nom de secours */ }
  return process.env.APP_NAME || 'Mejliss TV';
}

export default async function manifest() {
  const [name, theme] = await Promise.all([appName(), siteTheme()]);
  const bg = themeBg(theme);
  return {
    id: '/',
    name,
    short_name: name.length > 12 ? name.split(/\s+/)[0] : name,
    description: 'Des conférences qui éclairent.',
    lang: 'fr',
    dir: 'auto',
    start_url: '/?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: bg,
    theme_color: bg,
    categories: ['education', 'entertainment'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Catalogue', url: '/catalogue', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Ma bibliothèque', url: '/library', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
