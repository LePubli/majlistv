// Image d'origine d'une vidéo déjà importée : adresses (YouTube / Vimeo / archive.org), liste fermée de serveurs, rejets.
import assert from 'node:assert/strict';
import { posterUrls, fetchPoster, youtubeId, archiveId } from '../src/originalPoster.js';

assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(archiveId('https://archive.org/details/big_buck?x=1'), 'big_buck');
assert.deepEqual(posterUrls({ url: 'https://youtu.be/dQw4w9WgXcQ', origin: 'youtube', thumb: 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp' }),
  ['https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg']);
assert.deepEqual(posterUrls({ url: 'https://vimeo.com/1', origin: 'vimeo', vimeoThumb: 'https://i.vimeocdn.com/video/9_295x166.jpg' }),
  ['https://i.vimeocdn.com/video/9_1280.jpg', 'https://i.vimeocdn.com/video/9_295x166.jpg']);
assert.deepEqual(posterUrls({ url: 'https://archive.org/details/abc', origin: 'archive' }), ['https://archive.org/services/img/abc']);
// serveurs hors liste et adresses non https : jamais contactés
assert.deepEqual(posterUrls({ url: 'https://x.test/v', origin: 'web', thumb: 'https://evil.example/a.jpg' }), []);
assert.deepEqual(posterUrls({ url: 'https://x.test/v', origin: 'web', thumb: 'http://i.ytimg.com/a.jpg' }), []);
assert.deepEqual(posterUrls({ url: 'https://x.test/v', origin: 'web', thumb: 'https://i.ytimg.com.evil.example/a.jpg' }), []);

const big = Buffer.alloc(30000, 1);
const resp = (status, type, body, url) => ({ ok: status === 200, url, headers: { get: () => type }, arrayBuffer: async () => body });
let seen = [];
let r = await fetchPoster(['https://a.ytimg.com/1.jpg', 'https://a.ytimg.com/2.jpg', 'https://a.ytimg.com/3.png'], { fetchImpl: async (u) => {
  seen.push(u);
  if (u.endsWith('1.jpg')) return resp(404, 'text/html', Buffer.alloc(0), u);
  if (u.endsWith('2.jpg')) return resp(200, 'image/jpeg', Buffer.alloc(900), u); // image grise minuscule
  return resp(200, 'image/png', big, u);
} });
assert.equal(r.ext, 'png'); assert.equal(seen.length, 3);
// redirection vers un autre serveur, type interdit, erreur réseau : refus sans exception
assert.equal(await fetchPoster(['https://a.ytimg.com/1.jpg'], { fetchImpl: async () => resp(200, 'image/jpeg', big, 'https://evil.example/x.jpg') }), null);
assert.equal(await fetchPoster(['https://a.ytimg.com/1.jpg'], { fetchImpl: async (u) => resp(200, 'image/svg+xml', big, u) }), null);
assert.equal(await fetchPoster(['https://a.ytimg.com/1.jpg'], { fetchImpl: async () => { throw new Error('réseau'); } }), null);
console.log('original poster (API) OK');
