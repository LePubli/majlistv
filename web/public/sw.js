/* Étape 22a — service worker du site installable (PWA) de Mejliss TV.
 *
 * Ce qu'il fait, et seulement ça :
 *   - pages (navigation) : toujours depuis le réseau ; sans réseau, une page « Vous êtes hors connexion » (en FR / EN / AR) ;
 *   - fichiers du site qui ne changent jamais (/_next/static/…, empreinte dans le nom) : gardés pour s'ouvrir plus vite ;
 *   - icônes, logo et polices : gardés, rafraîchis en arrière-plan.
 * Ce qu'il ne fait JAMAIS : garder une page (elles peuvent contenir des données personnelles), une réponse de l'API (/api/…),
 * une vidéo, un son, ni rien d'un autre site (stockage S3, YouTube…). Les requêtes autres que GET passent sans y toucher.
 * Le visionnage hors connexion (téléchargement) est prévu dans l'application (étape 22b), pas ici.
 */
const VERSION = 'v1';
const STATIC = `mejliss-static-${VERSION}`;
const ASSETS = `mejliss-assets-${VERSION}`;
const META = 'mejliss-meta';
const ASSET_RE = /^\/(icon-[\w-]+\.png|apple-touch-icon\.png|favicon\.(png|svg)|brand\/[\w.-]+\.(png|jpg|svg|webp))$/;

const TEXT = {
  fr: { title: 'Vous êtes hors connexion', body: "Mejliss TV a besoin d'Internet pour afficher cette page. Vérifiez le wifi ou les données mobiles, puis réessayez.", retry: 'Réessayer' },
  en: { title: 'You are offline', body: 'Mejliss TV needs the Internet to show this page. Check your wifi or mobile data, then try again.', retry: 'Try again' },
  ar: { title: 'أنت غير متصل بالإنترنت', body: 'يحتاج Mejliss TV إلى الإنترنت لعرض هذه الصفحة. تحقّق من الواي فاي أو بيانات الجوال ثم أعد المحاولة.', retry: 'إعادة المحاولة' },
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(ASSETS).then((c) => c.addAll(['/icon-192.png', '/brand/emblem.png']).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, ASSETS, META]);
    for (const k of await caches.keys()) if (k.startsWith('mejliss-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// La page indique sa langue (fr / en / ar) : gardée pour la page hors connexion.
self.addEventListener('message', (event) => {
  const lang = event.data && event.data.type === 'locale' ? String(event.data.locale) : '';
  if (TEXT[lang]) event.waitUntil(caches.open(META).then((c) => c.put('/__locale', new Response(lang))));
});

async function locale() {
  try {
    const r = await (await caches.open(META)).match('/__locale');
    const l = r ? await r.text() : '';
    if (TEXT[l]) return l;
  } catch { /* pas de langue gardée */ }
  const nav = String(self.navigator.language || 'fr').slice(0, 2);
  return TEXT[nav] ? nav : 'fr';
}

async function offlinePage(url) {
  const l = await locale();
  const t = TEXT[l];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html lang="${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0B0906"><title>${esc(t.title)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:#0B0906;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",sans-serif;display:flex;align-items:center;justify-content:center;padding:16px}
main{max-width:420px;width:100%;text-align:center;background:#17120B;border:1px solid #2A2116;border-radius:20px;padding:32px 24px}
img{width:72px;height:auto;margin-bottom:16px}h1{font-size:1.4rem;margin:0 0 12px}p{color:#EDE6DA;line-height:1.6;margin:0 0 24px}
a{display:inline-block;background:#E6A739;color:#120D06;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 28px}
a:focus-visible{outline:3px solid #F7C863;outline-offset:3px}
</style></head><body><main role="alert"><img src="/brand/emblem.png" alt=""><h1>${esc(t.title)}</h1><p>${esc(t.body)}</p>
<a href="${esc(url)}">${esc(t.retry)}</a></main></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // stockage S3, YouTube, Vimeo… : jamais
  if (url.pathname.startsWith('/api/')) return;     // données : toujours le réseau, jamais gardées

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => offlinePage(url.pathname + url.search)));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()).catch(() => {}); return res; });
      if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    })());
  }
});
