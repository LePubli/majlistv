// Étape 45 : textes des saisons dans les 3 langues, composants reliés à l'accueil et à l'admin.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const KEYS = ['seasonAdmin', 'seasonTitle', 'seasonIntro', 'seasonEnabled', 'seasonCollection', 'seasonNoCollection', 'seasonLead', 'seasonTitleLbl', 'seasonTextLbl',
  'seasonNotify', 'seasonSave', 'seasonSaved', 'seasonTest', 'seasonTestSent', 'seasonTestNone', 'seasonSee', 'seasonIn', 'seasonLeft', 'seasonLast'];
for (const lang of ['fr', 'en', 'ar']) {
  const line = i18n.split('\n').find((l) => l.startsWith(`  ${lang}: {`));
  assert.ok(line, `langue ${lang}`);
  for (const k of KEYS) assert.ok(new RegExp(`(^|[ ,{])${k}:`).test(line), `${lang} : clé ${k}`);
  assert.ok(line.includes('{n}'), `${lang} : compteur de jours`);
}
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(read('../app/page.js'), /<SeasonBand \/>/, "bandeau de saison sur l'accueil");
assert.match(read('../app/admin/page.js'), /SeasonsAdmin/, 'écran Admin → Saisons');
assert.match(read('../app/admin/page.js'), /seasons: 'Saisons'/, "titre de l'écran Saisons (sinon le tableau de bord s'affiche)");
assert.match(read('../components/AdminShell.js'), /'seasons'/, 'menu Admin');
assert.match(read('../components/SeasonBand.js'), /\/seasons\/current\?lang=/, 'lecture de la saison en cours');
console.log('web seasons OK');
