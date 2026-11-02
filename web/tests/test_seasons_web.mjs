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
// 45H : nouvelles saisons et thème de saison
{
  const fs2 = await import('node:fs');
  const r = (p) => fs2.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  if (!/<SeasonTheme \/>/.test(r('app/layout.js'))) throw new Error('thème de saison branché dans la mise en page');
  if (!/dataset\.season = s\.id/.test(r('components/SeasonTheme.js'))) throw new Error('thème appliqué seulement si coché');
  if (!/body\[data-season\]::after/.test(r('app/globals.css'))) throw new Error('styles du thème');
  if (!/theme: f\.theme/.test(r('components/SeasonsAdmin.js'))) throw new Error('case « thème de saison » dans l’admin');
  if (!/eid_fitr: '🎉'/.test(r('components/SeasonBand.js'))) throw new Error('icônes des nouvelles saisons');
  if ((r('lib/i18n.js').match(/seasonTheme:/g) || []).length !== 3) throw new Error('seasonTheme en fr/en/ar');
  console.log('web seasons 45H OK');
}
