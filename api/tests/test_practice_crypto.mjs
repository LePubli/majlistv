// Chiffrement des engagements (PRACTICE_KEY) : node api/tests/test_practice_crypto.mjs
import assert from 'node:assert/strict';
const load = async (key) => { if (key === undefined) delete process.env.PRACTICE_KEY; else process.env.PRACTICE_KEY = key; return import('../src/practiceCrypto.js?k=' + Math.random()); };
const ok = (m) => console.log('OK   ' + m);

let c = await load('une-cle-de-test-assez-longue-123');
assert.equal(c.practiceKeyReady(), true);
const s = c.sealText("Donner l'aumône ce soir — صدقة 🌙");
assert.notEqual(s, "Donner l'aumône ce soir — صدقة 🌙");
assert.equal(c.openText(s), "Donner l'aumône ce soir — صدقة 🌙"); ok('aller-retour, accents, arabe et emoji');
assert.notEqual(c.sealText('a'), c.sealText('a')); ok('deux chiffrements du même texte diffèrent');
assert.equal(c.sealText(''), '') && assert.equal(c.openText(''), ''); ok('texte vide = vide (pas de chiffrement inutile)');
const buf = Buffer.from(s, 'base64'); buf[buf.length - 1] ^= 1;
assert.equal(c.openText(buf.toString('base64')), ''); ok('donnée altérée : illisible, sans erreur (rien ne plante)');
assert.equal(c.openText('pas-du-base64-valide!!'), ''); ok('contenu invalide : chaîne vide');

c = await load('une-AUTRE-cle-de-test-assez-longue');
assert.equal(c.openText(s), ''); ok('mauvaise clé : illisible');

c = await load(undefined);
assert.equal(c.practiceKeyReady(), false);
assert.throws(() => c.sealText('x'), /PRACTICE_KEY/); ok('sans PRACTICE_KEY : refuse de chiffrer');
assert.equal(c.sealText(''), ''); ok('sans PRACTICE_KEY : texte vide accepté (champs facultatifs)');
c = await load('court');
assert.equal(c.practiceKeyReady(), false); ok('clé trop courte (< 16 caractères) : considérée absente');

// Indépendance vis-à-vis de SETTINGS_KEY
process.env.SETTINGS_KEY = 'une-cle-de-test-assez-longue-123';
const { encrypt, decrypt } = await import('../src/crypto.js?k=' + Math.random());
c = await load('une-cle-de-test-assez-longue-123');
assert.equal(c.openText(encrypt('secret')), ''); assert.throws(() => decrypt(c.sealText('x')));
ok('clé dédiée : une donnée chiffrée avec SETTINGS_KEY n\'est pas lisible avec PRACTICE_KEY (et inversement)');
console.log('tout est bon');
