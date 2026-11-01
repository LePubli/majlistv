// Étape 45B : textes du Coran dans les 3 langues, pages et écran d'administration reliés.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const KEYS = ['qrNav', 'qrTitle', 'qrIntro', 'qrSoon', 'qrSearch', 'qrFilter', 'qrNoResult', 'qrVerses', 'qrNotFound', 'qrSura', 'qrOptions', 'qrTranslation', 'qrPhonetic', 'qrTafsir', 'qrNone',
  'qrSize', 'qrVerse', 'qrShowTafsir', 'qrHideTafsir', 'qrPrev', 'qrNext', 'qrSources', 'qrSource', 'qrAdNav', 'qrAdTitle', 'qrAdIntro', 'qrAdOpen', 'qrAdLicence', 'qrAdNew', 'qrAdSaved', 'qrAdNone', 'qrNotes', 'qrAdPresetTitle', 'qrAdPresetText', 'qrAdPresetBtn', 'qrAdPresetBusy', 'qrAdPresetConfirm', 'qrAdPresetDone'];
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
assert.match(read('../components/QuranAdmin.js'), /raw\.githubusercontent\.com\/risan\/quran-json\/[0-9a-f]{40}\//, 'Coran complet : adresses figées sur une version précise');
assert.match(read('../app/coran/[n]/page.js'), /qr-notes/, 'notes de bas de page');
console.log('web quran OK');
assert.match(read('../lib/navcfg.js'), /space: \[\['learning', 'Mon parcours'\], \['quranlearn', 'Coran'\]/, 'raccourci Coran dans l\'espace Apprendre');
assert.match(read('../components/MemberShell.js'), /quranlearn: \{ key: 'quranlearn', href: '\/coran'/, 'raccourci vers le même lecteur gratuit');
console.log('web quran shortcut OK');
// 45B2 : récitation, mot à mot, tajwid
const page = read('../app/coran/[n]/page.js');
assert.match(page, /qr-play/, 'bouton ▶ par verset'); assert.match(page, /\/quran\/reciters/, 'récitateurs chargés'); assert.match(page, /urlTemplate\.replace/, 'adresse du verset construite');
assert.match(page, /words', '1'/, 'mot à mot demandé à la demande'); assert.match(page, /tajweed', '1'/, 'tajwid demandé à la demande'); assert.match(page, /toks\.length === words\.length/, 'mot à mot seulement si le nombre de mots correspond');
assert.match(read('../middleware.js'), /CSP_MEDIA_ORIGINS/, 'origines audio autorisées par la CSP');
assert.match(read('../components/QuranAdmin.js'), /QuranReciters/, 'récitateurs dans Admin → Coran');
for (const k of ['qrReciter', 'qrWbw', 'qrTajweed', 'qrListen', 'qrAudioErr', 'qrRcTitle']) assert.equal((read('../lib/i18n.js').match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web quran 45B2 OK');
