// Étape 45D — compteur d'athkar : onglet d'Apprendre, admin, textes dans les trois langues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const i18n = read('lib/i18n.js');
const lp = read('app/(module-learning)/learning/page.js');
assert.match(fs.readFileSync(new URL('../app/adhkar/page.js', import.meta.url), 'utf8'), /<Athkar \/>/, 'adhkar : page /adhkar (rubrique Pratique)');
const c = read('components/Athkar.js');
assert.match(c, /\/athkar\/\$\{id\}\/tap/, 'touchers envoyés au serveur'); assert.match(c, /setTimeout\(flush, 700\)/, 'touchers rapprochés groupés');
assert.match(c, /\/athkar\/prefs/, 'objectif et rappel'); assert.match(c, /it\.reference/, 'référence affichée');
assert.match(read('components/AthkarAdmin.js'), /disabled=\{!form\.validated\}/, 'affichage impossible sans validation');
assert.match(read('app/admin/page.js'), /tab === 'athkar' && <AthkarAdmin/, 'onglet Admin → Athkar');
assert.match(read('lib/navcfg.js'), /\['athkar', 'Adhkar'\]/, 'entrée du menu Apprendre');
for (const k of ['atTab', 'atToday', 'atStreak', 'atGoal', 'atRemind', 'atEmpty', 'atCat_morning', 'atCat_after_prayer', 'atRef', 'atReset', 'atNote']) assert.equal((i18n.match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web athkar OK');
// Actions en lot + restauration (02/11)
{
  const a = read('components/AthkarAdmin.js'), r = read('components/RamadanAdmin.js'), b = read('components/BulkTools.js');
  assert.match(a, /BulkBar/, 'Athkar admin : barre d’actions en lot'); assert.match(a, /\/admin\/athkar\/bulk/, 'Athkar admin : route en lot');
  assert.match(a, /\/admin\/athkar\/restore-provided/, 'bouton Restaurer les dhikr fournis');
  assert.match(r, /BulkBar/, 'Ramadan admin : barre d’actions en lot'); assert.match(r, /\/admin\/ramadan\/items\/bulk/, 'Ramadan admin : route en lot');
  assert.match(b, /confirm\(/, 'suppression en lot confirmée');
  console.log('web lot OK');
}
