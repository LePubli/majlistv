// Import de shorts depuis YouTube (étape A, 26/11) : écran Studio, textes dans les 3 langues, lecture YouTube sans copie. node web/tests/test_shorts_import.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
const imp = read('modules/shorts/ImportShorts.js');
// Chaque texte utilisé par l'écran existe en fr, en et ar.
const keys = [...new Set([...imp.matchAll(/\bt\('(\w+)'\)/g)].map((m) => m[1]))];
assert.ok(keys.length > 40, 'l\'écran utilise bien des textes traduits');
for (const k of keys) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);
// Aucune clé en double dans une même langue (la dernière écraserait la première en silence).
const dict = i18n.split(/^  (?=(?:fr|en|ar): \{)/m);
for (const part of dict.slice(1)) { const names = [...part.matchAll(/^    (\w+): /gm)].map((m) => m[1]); const dup = names.filter((x, i) => names.indexOf(x) !== i); assert.deepEqual([...new Set(dup)].filter((x) => x.startsWith('shi')), [], 'pas de clé shi* en double'); }
// Parcours : adresse -> liste -> choix -> droits -> import.
assert.match(imp, /call\('\/studio\/shorts\/import', \{ method: 'POST'/, 'analyse lancée côté serveur');
assert.match(imp, /\/studio\/shorts\/import\/\$\{id\}/, 'état de la liste interrogé');
assert.match(imp, /\/start`/, 'import démarré');
assert.match(imp, /rights/, 'droits envoyés');
assert.match(imp, /canStart = ready && sel\.length > 0 && rights/, 'bouton bloqué tant que la case des droits n\'est pas cochée');
assert.match(imp, /mode === 'copy' \? t\('shiRightsCopy'\) : t\('shiRightsPlay'\)/, 'texte des droits adapté au mode');
assert.match(imp, /name="mode"[^>]*checked=\{mode === 'copy'\}/, 'mode copie');
assert.match(imp, /checked=\{mode === 'youtube'\}/, 'mode lecture depuis YouTube');
assert.match(imp, /copy-retry/, 'reprise d\'une copie échouée');
assert.match(imp, /setInterval\(loadMine, 5000\)/, 'copies en cours rafraîchies toutes seules');
assert.match(imp, /dir="auto"/, 'titres en arabe lus dans le bon sens');
assert.match(imp, /insetInlineStart|insetInlineEnd/, 'positions logiques (RTL)');
assert.doesNotMatch(imp, /\b(left|right):\s*\d/, 'pas de left/right physiques (RTL)');
assert.ok(fs.existsSync(join(web, 'app/studio/(module-shorts)/shorts/import/page.js')), 'page /studio/shorts/import');
const studio = read('modules/shorts/StudioShorts.js');
assert.equal((studio.match(/\/studio\/shorts\/import/g) || []).length, 2, 'lien vers l\'import dans les deux présentations du Studio');
// Lecture YouTube : lecteur sans cookies, jamais de copie de la vidéo.
const yt = read('components/YtShort.js');
assert.match(yt, /youtube-nocookie\.com\/embed\//, 'lecteur youtube-nocookie');
console.log('OK : test_shorts_import');
