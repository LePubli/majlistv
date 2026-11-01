// Étape 45F — circuit de Ramadan : page, admin, bouton du bandeau de saison, textes dans les trois langues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pg = read('app/ramadan/page.js'); const i18n = read('lib/i18n.js');
assert.match(pg, /\/ramadan\/mark/, 'cases'); assert.match(pg, /\/ramadan\/tarawih/, 'tarawih'); assert.match(pg, /\/ramadan\/prefs/, 'rappel');
assert.match(pg, /\/login\?next=\/ramadan/, 'visiteur : connexion puis retour');
assert.match(pg, /n <= st\.day/, 'pas de case pour un jour à venir');
assert.match(read('components/RamadanAdmin.js'), /disabled=\{!form\.validated\}/, 'affichage impossible sans validation');
assert.match(read('components/SeasonBand.js'), /s\.id === 'ramadan' && feat\('ramadan'\)/, 'bouton « Ramadan » dans le bandeau de saison');
assert.match(read('app/admin/page.js'), /tab === 'ramadan' && <RamadanAdmin/, 'onglet Admin → Ramadan');
assert.match(read('lib/navcfg.js'), /\['ramadan', 'Ramadan'\]/, 'entrée du menu');
for (const k of ['rzNav', 'rzTitle', 'rzIntro', 'rzDayOf', 'rzStartsIn', 'rzTarawih', 'rzRakaat', 'rzMosque', 'rzHome', 'rzNote', 'rzSoon']) assert.equal((i18n.match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web ramadan OK');
