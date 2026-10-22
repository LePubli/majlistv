// 22b-5 : fonctions pures du module « appupdates ».
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hexToB64Url, tokenOk, bearer, SHA_RE, MD5_RE, VERSION_RE, assetKey, apkKey, buildManifest, multipartBody, accepts, partCount } from '../src/modules/appupdates/lib.js';

const sha = createHash('sha256').update('x').digest('hex');
const b64 = hexToB64Url(sha);
assert.equal(b64, createHash('sha256').update('x').digest('base64url'));
assert.ok(!b64.includes('=') && !b64.includes('+') && !b64.includes('/'));
assert.ok(tokenOk('secret', 'secret') && !tokenOk('secret', 'secreT') && !tokenOk('', 'x') && !tokenOk('x', '') && !tokenOk(undefined, 'x'));
assert.equal(bearer('Bearer abc'), 'abc'); assert.equal(bearer('abc'), ''); assert.equal(bearer(undefined), '');
assert.ok(SHA_RE.test(sha) && !SHA_RE.test('../x') && !SHA_RE.test(sha.toUpperCase()));
assert.ok(MD5_RE.test('d41d8cd98f00b204e9800998ecf8427e') && !MD5_RE.test('zz'));
assert.ok(VERSION_RE.test('0.5.0') && !VERSION_RE.test('../1') && !VERSION_RE.test(''));
assert.equal(assetKey(sha), `app/assets/${sha}`); assert.equal(apkKey(12), 'app/apk/12.apk');
assert.equal(partCount(1, 32), 1); assert.equal(partCount(64, 32), 2); assert.equal(partCount(65, 32), 3); assert.equal(partCount(0, 32), 1);
assert.deepEqual(accepts(''), { multipart: true, json: true });
assert.equal(accepts('multipart/mixed').multipart, true); assert.equal(accepts('application/expo+json').multipart, false);
assert.equal(accepts('application/expo+json').json, true); assert.equal(accepts('text/html').json, false); assert.equal(accepts('*/*').multipart, true);

const row = { id: 'u1', created_at: new Date('2026-10-22T10:00:00Z'), runtime_version: '0.5.0',
  bundle: { launchAsset: { sha256: sha }, assets: [{ sha256: sha, key: 'd41d8cd98f00b204e9800998ecf8427e', contentType: 'image/png', fileExtension: '.png' }], expoClient: { name: 'M' } } };
const m = buildManifest(row, 'https://api.example.fr/');
assert.equal(m.id, 'u1'); assert.equal(m.runtimeVersion, '0.5.0'); assert.equal(m.createdAt, '2026-10-22T10:00:00.000Z');
assert.equal(m.launchAsset.url, `https://api.example.fr/app/updates/assets/${sha}`);
assert.equal(m.launchAsset.contentType, 'application/javascript'); assert.equal(m.launchAsset.key, sha);
assert.equal(m.assets[0].hash, b64); assert.equal(m.assets[0].fileExtension, '.png'); assert.equal(m.extra.expoClient.name, 'M');

const body = multipartBody([{ name: 'manifest', json: { a: 1 } }, { name: 'extensions', json: {} }], 'BND');
assert.ok(body.startsWith('--BND\r\n') && body.endsWith('--BND--\r\n'));
assert.equal((body.match(/--BND\r\n/g) || []).length, 2);
console.log('test_appupdates_lib OK');
