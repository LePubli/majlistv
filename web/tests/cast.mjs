// 22b-10 : logique pure de la diffusion web (Chromecast). Lancement depuis la racine du dépôt : node web/tests/cast.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { castCapableBrowser, castableTalk, castMedia, resumeAfterCast, HLS_MIME, CAST_SDK_URL } from '../lib/cast.js';

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
};
assert.equal(castCapableBrowser(UA.chromeAndroid), true);
assert.equal(castCapableBrowser(UA.chromeDesktop), true);
assert.equal(castCapableBrowser(UA.edge), true);
for (const k of ['safariMac', 'safariIphone', 'chromeIos', 'firefox']) assert.equal(castCapableBrowser(UA[k]), false, k);
assert.equal(castCapableBrowser(''), false);

assert.equal(castableTalk({ source: 'upload', hlsPath: '/hls/x/master.m3u8?t=1' }), true);
assert.equal(castableTalk({ source: 'youtube', hlsPath: null }), false);
assert.equal(castableTalk({ source: 'archive', fileUrl: 'https://archive.org/x.mp4' }), false);
assert.equal(castableTalk(null), false);

const m = castMedia({ src: '/api/hls/abc/master.m3u8?t=jeton', title: 'Titre', poster: '/api/seo/poster/abc', startSeconds: 61.7, durationSeconds: 900, origin: 'https://majlisstv.le-publicitaire.fr' });
assert.equal(m.contentUrl, 'https://majlisstv.le-publicitaire.fr/api/hls/abc/master.m3u8?t=jeton');
assert.equal(m.contentType, HLS_MIME); assert.equal(HLS_MIME, 'application/x-mpegurl');
assert.equal(m.image, 'https://majlisstv.le-publicitaire.fr/api/seo/poster/abc');
assert.equal(m.startSeconds, 61); assert.equal(m.durationSeconds, 900);
assert.equal(castMedia({ src: '/api/hls/a.m3u8', origin: 'http://localhost:3001' }), null, 'http refusé : le récepteur exige https');
assert.equal(castMedia({ src: '/a.m3u8', startSeconds: NaN, origin: 'https://x.fr' }).startSeconds, 0);
assert.equal(castMedia({ src: '/a.m3u8', poster: 'http://x/p.jpg', origin: 'https://x.fr' }).image, '');

assert.equal(resumeAfterCast(120.5, 10, 900), 120.5);
assert.equal(resumeAfterCast(NaN, 42, 900), 42);
assert.equal(resumeAfterCast(5000, 0, 900), 899);
assert.equal(resumeAfterCast(-1, 7, 0), 7);

// Politique de sécurité : le SDK Google doit pouvoir se charger (script-src) sans ouvrir plus que nécessaire.
const mw = readFileSync('web/middleware.js', 'utf8');
assert.match(mw, /'script-src': \[[^\]]*'https:\/\/www\.gstatic\.com'/);
assert.match(mw, /'connect-src': \[[^\]]*'https:\/\/www\.gstatic\.com'/);
assert.match(CAST_SDK_URL, /^https:\/\/www\.gstatic\.com\//);
assert.doesNotMatch(mw.match(/'script-src': \[[^\]]*\]/)[0], /unsafe-inline/);

// Le relais vers l'API laisse passer l'en-tête CORS des playlists ; textes dans les 3 langues.
assert.match(readFileSync('web/app/api/[...path]/route.js', 'utf8'), /access-control-allow-origin/);
const i18n = readFileSync('web/lib/i18n.js', 'utf8');
for (const k of ['castLabel', 'castOn', 'castPlay', 'castPause', 'castStop']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, k);
console.log('cast.mjs : TOUT OK');
