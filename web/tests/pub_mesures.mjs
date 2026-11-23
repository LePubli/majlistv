// Publicité (mesures) : le site retient ?ad=<id>, respecte « ne pas suivre » et rattache l'inscription. Lancer : node web/tests/pub_mesures.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../lib/adref.js', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../components/AuthForm.js', import.meta.url), 'utf8');
const prov = readFileSync(new URL('../components/Providers.js', import.meta.url), 'utf8');
assert.match(src, /if \(trackingRefused\(\)\) return;/, 'capture : suivi refusé = rien gardé');
assert.match(src, /if \(trackingRefused\(\)\) return null;/, 'lecture : suivi refusé = rien');
assert.match(src, /TTL_MS = 7 \* 24/, 'durée de vie 7 jours');
assert.match(src, /\/me\/ad-attribution/);
assert.match(auth, /claimAdRef\(call, r\.data\.token\)/, 'inscription : rattachement');
assert.match(prov, /captureAdRef\(window\.location\.search\)/, 'capture à chaque page');
// L'expression d'identifiant n'accepte que des UUID (rien d'autre n'est gardé ni envoyé)
const re = new RegExp(/AD_ID_RE = (\/.*\/i)/.exec(src)[1].slice(1, -2), 'i');
assert.ok(re.test('0b3f1f9e-1111-4222-8333-444455556666')); assert.ok(!re.test('<script>')); assert.ok(!re.test('1; drop table'));
console.log('pub_mesures : OK');
