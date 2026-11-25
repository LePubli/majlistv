import assert from 'node:assert/strict';
import { redactUrl, reqSerializer } from '../src/logRedact.js';
assert.equal(redactUrl('/hls/abc/master.m3u8?t=eyJhbGciOi.secret.sig'), '/hls/abc/master.m3u8?t=[masqué]');
assert.equal(redactUrl('/x?a=1&token=SECRET&b=2'), '/x?a=1&token=[masqué]&b=2');
assert.equal(redactUrl('/talks?q=foo&limit=5'), '/talks?q=foo&limit=5');
assert.equal(redactUrl('/s?X-Amz-Signature=abcd&x=1'), '/s?X-Amz-Signature=[masqué]&x=1');
assert.equal(redactUrl(undefined), '');
assert.ok(!JSON.stringify(reqSerializer({ method: 'GET', url: '/hls/a?t=SECRET', ip: '1.2.3.4' })).includes('SECRET'));
console.log('journal : jetons masqués OK');
