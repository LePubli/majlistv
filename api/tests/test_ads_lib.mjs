// 24c : règles pures de la publicité au lancement. Lancer : node api/tests/test_ads_lib.mjs
import assert from 'node:assert/strict';
import { mediaInfo, keyInfo, safeLink, adStatus, pickAds, clickRate } from '../src/ads.js';

// Types de fichiers
assert.equal(mediaInfo('image/jpeg').kind, 'image');
assert.equal(mediaInfo('VIDEO/MP4').kind, 'video');
assert.equal(mediaInfo('video/webm').ext, 'webm');
assert.equal(mediaInfo('application/pdf'), null);
assert.equal(mediaInfo('image/svg+xml'), null); // SVG refusé (peut contenir du script)
assert.equal(mediaInfo(undefined), null);
assert.equal(keyInfo('ads/0b3f1f9e-1111-4222-8333-444455556666.mp4').kind, 'video');
assert.equal(keyInfo('ads/0b3f1f9e-1111-4222-8333-444455556666.jpg').kind, 'image');
assert.equal(keyInfo('talks/0b3f1f9e-1111-4222-8333-444455556666.mp4'), null);
assert.equal(keyInfo('ads/../secret.mp4'), null);

// Liens : http(s) seulement
assert.equal(safeLink('https://exemple.fr/offre?x=1'), 'https://exemple.fr/offre?x=1');
assert.equal(safeLink('  http://exemple.fr '), 'http://exemple.fr/');
for (const bad of ['javascript:alert(1)', 'intent://x#Intent;end', 'ftp://exemple.fr', 'exemple.fr', '', null]) assert.equal(safeLink(bad), null, String(bad));

// Situation selon active et dates
const now = new Date('2026-10-26T12:00:00Z');
assert.equal(adStatus({ active: false }, now), 'paused');
assert.equal(adStatus({ active: true }, now), 'live');
assert.equal(adStatus({ active: true, starts_at: '2026-10-27T00:00:00Z' }, now), 'scheduled');
assert.equal(adStatus({ active: true, ends_at: '2026-10-26T12:00:00Z' }, now), 'ended');
assert.equal(adStatus({ active: true, starts_at: '2026-10-26T08:00:00Z', ends_at: '2026-10-26T18:00:00Z' }, now), 'live');

// Rotation
const L = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (x) => x.map((a) => a.id).join('');
assert.equal(ids(pickAds(L, undefined, 1)), 'a');
assert.equal(ids(pickAds(L, 'a', 1)), 'b');
assert.equal(ids(pickAds(L, 'c', 1)), 'a');         // reprend au début
assert.equal(ids(pickAds(L, 'zzz', 1)), 'a');       // dernière supprimée : début
assert.equal(ids(pickAds(L, 'b', 2)), 'ca');        // plusieurs à la suite, avec retour au début
assert.equal(ids(pickAds(L, 'a', 9)), 'bca');       // jamais plus que le nombre de publicités (pas de doublon)
assert.equal(ids(pickAds([], 'a', 2)), '');
assert.equal(ids(pickAds([{ id: 'x' }], 'x', 3)), 'x');
assert.equal(ids(pickAds(L, undefined, 0)), 'a');

assert.equal(clickRate(200, 5), 2.5);
assert.equal(clickRate(0, 0), 0);
console.log('OK  ads lib');
