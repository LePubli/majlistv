// Lecteur / écrivain de .zip des thèmes (lot T)
import assert from 'node:assert/strict';
import { readZip, writeZip, safeEntryName } from '../src/zip.js';

const files = [{ name: 'theme.json', data: '{"a":1}' }, { name: 'assets/logo.png', data: Buffer.from([1, 2, 3, 4]) }, { name: 'pages/accueil.json', data: 'x'.repeat(5000) }];
const z = writeZip(files);
const back = readZip(z);
assert.deepEqual(back.map((f) => f.name), ['assets/logo.png', 'pages/accueil.json', 'theme.json'], 'noms (triés)');
assert.equal(back.find((f) => f.name === 'theme.json').data.toString(), '{"a":1}');
assert.equal(back.find((f) => f.name === 'pages/accueil.json').data.length, 5000);
assert.deepEqual(writeZip(files), z, 'écriture reproductible');
for (const bad of ['../x', '/etc/passwd', 'a/../b', 'a\\b', 'C:/x', '', 'a/./b']) assert.equal(safeEntryName(bad), false, bad);
assert.equal(safeEntryName('assets/fonts/a-b_c.woff2'), true);
assert.throws(() => readZip(Buffer.from('pas un zip du tout, vraiment pas un zip')), /zip/);
assert.throws(() => readZip(writeZip([{ name: 'a.txt', data: 'x' }]), { files: 300, fileBytes: 0, totalBytes: 10 }), /trop lourd/);
assert.throws(() => readZip(writeZip([{ name: 'a.txt', data: 'x' }, { name: 'b.txt', data: 'x' }]), { files: 1, fileBytes: 10, totalBytes: 10 }), /Trop de fichiers/);
// chemin dangereux fabriqué à la main
const evil = writeZip([{ name: 'ok.txt', data: 'x' }]);
const patched = Buffer.from(evil.toString('latin1').split('ok.txt').join('../a.t'), 'latin1');
assert.throws(() => readZip(patched), /refusé/);
console.log('OK zip');
