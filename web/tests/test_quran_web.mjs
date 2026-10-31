// Étape 45B : textes du Coran dans les 3 langues, pages et écran d'administration reliés.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const KEYS = ['qrNav', 'qrTitle', 'qrIntro', 'qrSoon', 'qrSearch', 'qrFilter', 'qrNoResult', 'qrVerses', 'qrNotFound', 'qrSura', 'qrOptions', 'qrTranslation', 'qrPhonetic', 'qrTafsir', 'qrNone',
  'qrSize', 'qrVerse', 'qrShowTafsir', 'qrHideTafsir', 'qrPrev', 'qrNext', 'qrSources', 'qrSource', 'qrAdNav', 'qrAdTitle', 'qrAdIntro', 'qrAdOpen', 'qrAdLicence', 'qrAdNew', 'qrAdSaved', 'qrAdNone'];
for (const lang of ['fr', 'en', 'ar']) {
  const line = i18n.split('\n').find((l) => l.startsWith(`  ${lang}: {`));
  assert.ok(line, `langue ${lang}`);
  for (const k of KEYS) assert.ok(new RegExp(`(^|[ ,{])${k}:`).test(line), `${lang} : clé ${k}`);
}
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(read('../app/admin/page.js'), /QuranAdmin/, 'écran Admin → Coran');
assert.match(read('../app/admin/page.js'), /quran: 'Coran'/, "titre de l'écran Coran (sinon le tableau de bord s'affiche)");
assert.match(read('../components/AdminShell.js'), /'quran'/, 'menu Admin');
assert.match(read('../components/MemberShell.js'), /href: '\/coran'/, 'entrée « Coran » du menu latéral');
assert.match(read('../lib/navcfg.js'), /\['quran', 'Coran'\]/, 'entrée du menu configurable');
assert.match(read('../app/coran/page.js'), /\/quran\/search/, 'recherche');
assert.match(read('../app/coran/[n]/page.js'), /\/quran\/tafsir\//, 'tafsir');
assert.match(read('../app/coran/[n]/page.js'), /dir="rtl"/, 'texte arabe de droite à gauche');
console.log('web quran OK');
