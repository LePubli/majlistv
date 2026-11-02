// Étape B3 — états vides utiles (pourquoi + action) et messages de fin de parcours.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const es = read('components/EmptyState.js');
assert.match(es, /role="status"/, 'état vide annoncé'); assert.match(es, /a\.href\s*\? <Link/, 'action en lien'); assert.match(es, /onClick=\{a\.onClick\}/, 'action en bouton');
const uses = { 'components/Athkar.js': /EmptyState title=\{t\('atEmpty'\)\}/, 'components/MemoryCards.js': /EmptyState compact title=\{t\('mcNone'\)\}/,
  'components/PracticeList.js': /EmptyState title=\{t\('esCommitTitle'\)\}/, 'app/library/page.js': /EmptyState compact text=\{t\('nothingToContinue'\)\}/,
  'app/ramadan/page.js': /EmptyState title=\{t\('rzSoon'\)\}/, 'app/(module-learning)/learning/page.js': /EmptyState compact text=\{t\('revNoneYet'\)\}/ };
for (const [f, re] of Object.entries(uses)) assert.match(read(f), re, `état vide utile : ${f}`);
const lp = read('app/(module-learning)/learning/page.js');
assert.match(lp, /go\('att'\)\}>\{t\('esAttest'\)\}/, 'parcours terminé : attestation'); assert.match(lp, /t\('esNextPath'\)/, 'parcours terminé : parcours suivant');
const qp = read('components/QuranPlan.js');
assert.match(qp, /plan\.finished && \(\n\s*<div className="kh-end"/, 'lecture complète : message de fin'); assert.match(qp, /navigator\.share/, 'partage'); assert.match(qp, /clipboard\.writeText/, 'copie si pas de partage');
assert.match(qp, /!plan\.finished && plan\.day > 30/, '30 jours passés sans tout lire : message et suite');
assert.match(read('components/RamadanBilan.js'), /ended && <p className="rb-ended"/, 'fin de Ramadan : message sur le bilan');
assert.match(read('app/ramadan/page.js'), /<RamadanBilan ended=\{!st\.active\} \/>/, 'bilan : Ramadan terminé');
assert.match(read('components/TodayBlock.js'), /case 'ramadanBilan'/, 'Aujourd’hui : ligne du bilan');
const i18n = read('lib/i18n.js');
for (const k of ['atEmptyTx', 'esReadQuran', 'esFindTalk', 'esCommitTitle', 'esSeeSeries', 'esAttest', 'esNextPath', 'rzSoonTx', 'rbEnded', 'khEndTx', 'khShare', 'khShared', 'khShareTx', 'khOverTx', 'khOverHelp', 'khContinue', 'tdRamadanBilan'])
  assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web empty OK');
