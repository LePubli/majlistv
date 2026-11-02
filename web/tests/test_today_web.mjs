// Étape B1 — bloc « Aujourd'hui » : composant, place sur l'accueil et dans Apprendre, textes dans les trois langues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const c = read('components/TodayBlock.js');
assert.match(c, /\/me\/today\?lang=/, 'données : GET /me/today'); assert.match(c, /if \(!d \|\| !d\.items\.length\) return null/, 'rien si aucune ligne');
assert.match(c, /if \(!ready \|\| !user\)/, 'rien pour un visiteur');
for (const k of ['quranJuz', 'quranStart', 'athkar', 'ramadan', 'cards', 'revision']) assert.match(c, new RegExp(`case '${k}'`), `libellé ${k}`);
const home = read('app/page.js');
assert.match(home, /\{browsing && <TodayBlock \/>\}/, 'accueil d’origine'); assert.match(home, /<TodayBlock \/><SeasonBand \/><FridayBand \/><HomeBlocks/, 'accueil en blocs');
assert.match(read('app/(module-learning)/learning/page.js'), /<TabPanel id="dash" current=\{tab\}>\n\s*<TodayBlock compact \/>/, 'tableau de bord d’Apprendre');
const i18n = read('lib/i18n.js');
for (const k of ['tdTitle', 'tdLeft', 'tdAllDone', 'tdQuranJuz', 'tdQuranStart', 'tdAthkar_morning', 'tdAthkar_evening', 'tdRamadan', 'tdCards', 'tdCardsDone', 'tdRevision', 'tdDone', 'tdTodo', 'tdAria']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
const css = read('app/globals.css'); assert.match(css, /\[dir="rtl"\] \.today-go/, 'flèche retournée en arabe');
console.log('web today OK');
