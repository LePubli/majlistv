// Page d'une collection, thème Premium (24/11) : en-tête immersif, grille numérotée, autres collections. node web/tests/test_pm_collection.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const i18n = read('lib/i18n.js');
for (const k of ['pmColVideos', 'pmColVideo', 'pmColSpeakers', 'pmColPlayAll', 'pmColShare', 'pmColCopied', 'pmColIn', 'pmColMore']) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);
const page = read('app/(module-collections)/collections/[id]/page.js');
assert.match(page, /skin === 'premium'/, 'page immersive réservée au thème Premium');
assert.match(page, /<PmColHero c=\{c\} bg=\{bg\} \/>/);
assert.match(page, /<PmColGrid c=\{c\} onHover=\{setBg\} \/>/);
assert.match(page, /<PmColMore currentId=\{c\.id\} \/>/);
assert.match(page, /f_collection_head: secHead, f_collection_talks: secTalks/, 'sections de l\'éditeur conservées');
const comp = read('components/premium/PmCollection.js');
for (const m of ['pm-col-bg', 'pm-col-play', 'pm-col-share', "c.kind === 'cycle' || c.kind === 'speaker'", 'pm-col-n', 'pm-col-rail', "call('/collections'", 'navigator.share']) assert.ok(comp.includes(m), m);
assert.match(comp, /pmColVideos' : 'pmColVideo'/, 'singulier géré');
const css = read('app/skin-premium.css');
for (const m of ['.pm-col-hero', '.pm-col-shade', '.pm-col-grid', '.pm-col-tile', 'prefers-reduced-motion']) assert.ok(css.includes(m), m);
console.log('test_pm_collection : OK');
