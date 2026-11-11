// Audit 11/2026 (P1) — les trois langues complètes ne doivent pas partir dans le navigateur de chaque visiteur.
// 1) lib/locales.js (léger) porte les mêmes langues que lib/i18n.js ;
// 2) aucun composant « use client » n'importe lib/i18n de façon statique (import() à la demande permis : écrans d'admin).
// node web/tests/test_locales_web.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, copyFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'loc-'));
const load = async (f, as) => { copyFileSync(join(web, f), join(tmp, as)); return import(pathToFileURL(join(tmp, as)).href); };
const light = await load('lib/locales.js', 'locales.mjs');
const full = await load('lib/i18n.js', 'i18n.mjs');
assert.deepEqual(light.LOCALES, full.LOCALES, 'mêmes langues');
assert.deepEqual(light.DIR, full.DIR, 'même sens d’écriture');
assert.deepEqual(Object.keys(full.DICT).sort(), Object.keys(light.LOCALES).sort(), 'un dictionnaire par langue');
for (const v of ['fr', 'en', 'ar', 'xx', undefined, 'constructor']) assert.equal(light.getLocale(v), full.getLocale(v), `getLocale(${v})`);
assert.ok(readFileSync(join(web, 'lib/locales.js')).length < 2000, 'lib/locales.js reste léger');

const walk = (d) => readdirSync(d).flatMap((n) => {
  if (n === 'node_modules' || n === '.next' || n === 'tests') return [];
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : (/\.(js|jsx)$/.test(n) ? [p] : []);
});
const bad = [];
for (const f of walk(web)) {
  const s = readFileSync(f, 'utf8');
  if (!/^\s*['"]use client['"]/.test(s)) continue;
  if (/^import\s[^;]*from\s+['"][^'"]*lib\/i18n['"]/m.test(s)) bad.push(f.slice(web.length));
}
assert.deepEqual(bad, [], 'composants du navigateur qui importent les trois langues : utiliser lib/locales.js');
console.log('locales OK');
