// Image de présentation d'origine : adresses essayées, rejet des images trop petites / mauvais types, repli sur l'adresse relevée.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { posterUrls, fetchOriginalPoster } from '../src/originalPoster.js';

assert.deepEqual(posterUrls({ source: 'youtube', ref: 'abc', thumb: 'https://x/y.jpg' }),
  ['https://i.ytimg.com/vi/abc/maxresdefault.jpg', 'https://x/y.jpg', 'https://i.ytimg.com/vi/abc/hqdefault.jpg']);
assert.deepEqual(posterUrls({ source: 'vimeo', ref: '1', thumb: 'javascript:alert(1)' }), []);
assert.deepEqual(posterUrls({ source: 'vimeo', ref: '1', thumb: 'https://i.vimeocdn.com/a.jpg' }), ['https://i.vimeocdn.com/a.jpg']);

const big = Buffer.alloc(20000, 7);
const resp = (status, type, body) => ({ ok: status === 200, headers: { get: () => type }, arrayBuffer: async () => body });
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-'));
// maxres absent (404) → on prend l'adresse relevée
let calls = [];
let name = await fetchOriginalPoster({ source: 'youtube', ref: 'abc', thumb: 'https://x/y.png' }, dir, { fetchImpl: async (u) => { calls.push(u); return u.includes('maxres') ? resp(404, 'text/html', Buffer.alloc(0)) : resp(200, 'image/png', big); } });
assert.equal(name, 'original.png'); assert.equal(calls.length, 2);
assert.equal((await fs.stat(path.join(dir, name))).size, 20000);
// image minuscule (miniature grise de YouTube) refusée, puis hqdefault valable
calls = [];
name = await fetchOriginalPoster({ source: 'youtube', ref: 'abc', thumb: null }, dir, { fetchImpl: async (u) => (u.includes('maxres') ? resp(200, 'image/jpeg', Buffer.alloc(1200)) : resp(200, 'image/jpeg; charset=x', big)) });
assert.equal(name, 'original.jpg');
// types interdits et erreurs réseau : null, sans exception
assert.equal(await fetchOriginalPoster({ source: 'vimeo', ref: '1', thumb: 'https://x/a.svg' }, dir, { fetchImpl: async () => resp(200, 'image/svg+xml', big) }), null);
assert.equal(await fetchOriginalPoster({ source: 'vimeo', ref: '1', thumb: 'https://x/a.jpg' }, dir, { fetchImpl: async () => { throw new Error('réseau'); } }), null);
await fs.rm(dir, { recursive: true });
console.log('original poster OK');
