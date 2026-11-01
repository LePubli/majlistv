// Étape 45D — compteur d'athkar : onglet d'Apprendre, admin, textes dans les trois langues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const i18n = read('lib/i18n.js');
const lp = read('app/(module-learning)/learning/page.js');
assert.match(lp, /feat\('athkar'\) \? \[\{ id: 'athkar', label: t\('atTab'\) \}\]/, 'onglet « Athkar » dans Apprendre');
assert.match(lp, /<TabPanel id="athkar"[\s\S]{0,80}<Athkar \/>/, 'contenu de l’onglet');
const c = read('components/Athkar.js');
assert.match(c, /\/athkar\/\$\{id\}\/tap/, 'touchers envoyés au serveur'); assert.match(c, /setTimeout\(flush, 700\)/, 'touchers rapprochés groupés');
assert.match(c, /\/athkar\/prefs/, 'objectif et rappel'); assert.match(c, /it\.reference/, 'référence affichée');
assert.match(read('components/AthkarAdmin.js'), /disabled=\{!form\.validated\}/, 'affichage impossible sans validation');
assert.match(read('app/admin/page.js'), /tab === 'athkar' && <AthkarAdmin/, 'onglet Admin → Athkar');
assert.match(read('lib/navcfg.js'), /\['athkar', 'Athkar'\]/, 'entrée du menu Apprendre');
for (const k of ['atTab', 'atToday', 'atStreak', 'atGoal', 'atRemind', 'atEmpty', 'atCat_morning', 'atCat_after_prayer', 'atRef', 'atReset', 'atNote']) assert.equal((i18n.match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web athkar OK');
