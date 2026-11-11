// Étape 45B : textes du Coran dans les 3 langues, pages et écran d'administration reliés.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const KEYS = ['qrNav', 'qrTitle', 'qrIntro', 'qrSoon', 'qrSearch', 'qrFilter', 'qrNoResult', 'qrVerses', 'qrNotFound', 'qrSura', 'qrOptions', 'qrTranslation', 'qrPhonetic', 'qrTafsir', 'qrNone',
  'qrSize', 'qrVerse', 'qrShowTafsir', 'qrHideTafsir', 'qrPrev', 'qrNext', 'qrSources', 'qrSource', 'qrAdNav', 'qrAdTitle', 'qrAdIntro', 'qrAdOpen', 'qrAdLicence', 'qrAdNew', 'qrAdSaved', 'qrAdNone', 'qrNotes', 'qrAdPresetTitle', 'qrAdPresetText', 'qrAdPresetBtn', 'qrAdPresetBusy', 'qrAdPresetConfirm', 'qrAdPresetDone'];
for (const lang of ['fr', 'en', 'ar']) {
  // Bloc d'une langue : de « lang: { » à la fin de son objet (un texte par ligne).
  const from = i18n.indexOf(`\n  ${lang}: {`); const line = from < 0 ? '' : i18n.slice(from, i18n.indexOf('\n  },', from));
  assert.ok(line, `langue ${lang}`);
  for (const k of KEYS) assert.ok(new RegExp(`(^|[ ,{])${k}:`, 'm').test(line), `${lang} : clé ${k}`);
}
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(read('../app/admin/page.js'), /QuranAdmin/, 'écran Admin → Coran');
assert.match(read('../app/admin/page.js'), /quran: 'Coran'/, "titre de l'écran Coran (sinon le tableau de bord s'affiche)");
assert.match(read('../components/AdminShell.js'), /'quran'/, 'menu Admin');
assert.match(read('../components/MemberShell.js'), /href: '\/coran'/, 'entrée « Coran » du menu latéral');
assert.match(read('../lib/navcfg.js'), /\['quran', 'Coran'\]/, 'entrée du menu configurable');
assert.match(read('../components/QuranIndex.js'), /\/quran\/search/, 'recherche');
assert.match(read('../app/coran/page.js'), /<QuranIndex \/>/, 'page /coran = liste des sourates');
assert.match(read('../app/coran/[n]/page.js'), /\/quran\/tafsir\//, 'tafsir');
assert.match(read('../app/coran/[n]/page.js'), /dir="rtl"/, 'texte arabe de droite à gauche');
assert.match(read('../components/QuranAdmin.js'), /raw\.githubusercontent\.com\/risan\/quran-json\/[0-9a-f]{40}\//, 'Coran complet : adresses figées sur une version précise');
assert.match(read('../app/coran/[n]/page.js'), /qr-notes/, 'notes de bas de page');
console.log('web quran OK');
assert.match(read('../lib/navcfg.js'), /pratique: \[\['prayer', 'Prière'\], \['quran', 'Coran'\]/, 'Coran dans la rubrique Pratique');
assert.match(read('../lib/navcfg.js'), /\['quranlearn', 'Coran', true\]/, 'raccourci vers l\'onglet Coran d\'Apprendre gardé (masqué par défaut)');
assert.match(read('../components/MemberShell.js'), /quranlearn: \{ key: 'quranlearn', href: '\/coran'/, 'raccourci vers l\'onglet Coran d\'Apprendre');
console.log('web quran shortcut OK');
// 45B2 : récitation, mot à mot, tajwid
const page = read('../app/coran/[n]/page.js');
assert.match(page, /qr-play/, 'bouton ▶ par verset'); assert.match(page, /\/quran\/reciters/, 'récitateurs chargés'); assert.match(page, /reciterUrl\(reciter\.urlTemplate/, 'adresse du verset construite (lib/quranAudio)');
assert.match(page, /qs\.set\('words', w\)/, 'mot à mot demandé à la demande (langue)'); assert.match(page, /tajweed', '1'/, 'tajwid demandé à la demande'); assert.match(page, /toks\.length === words\.length/, 'mot à mot seulement si le nombre de mots correspond');
assert.match(read('../middleware.js'), /CSP_MEDIA_ORIGINS/, 'origines audio autorisées par la CSP');
assert.match(read('../components/QuranAdmin.js'), /QuranReciters/, 'récitateurs dans Admin → Coran');
for (const k of ['qrReciter', 'qrWbw', 'qrWbwLang', 'qrTajweed', 'qrListen', 'qrAudioErr', 'qrRcTitle']) assert.equal((read('../lib/i18n.js').match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web quran 45B2 OK');
const lp = read('../app/(module-learning)/learning/page.js');
assert.doesNotMatch(lp, /id: 'quran'/, 'le Coran n’est plus un onglet d’Apprendre : il est dans Pratique (/coran)');
assert.match(lp, /feat\('quran'\) && <p className="lg-quran"><Link className="btn ghost" href="\/coran">/, 'écran verrouillé : lien vers le Coran gratuit');
assert.equal((read('../lib/i18n.js').match(/lgQuran:/g) || []).length, 3, 'lgQuran en fr/en/ar');
console.log('web quran lien Apprendre OK');

// Étape A1 / A1 bis : {ayahg}, mot à mot selon la langue, CSP des récitateurs, catalogue dans l'admin.
const qa = await import('../lib/quranAudio.js');
assert.equal(qa.SURA_VERSES.reduce((a, b) => a + b, 0), 6236, '6236 versets');
assert.equal(qa.globalAyah(2, 255), 262, 'Ayat al-Kursi = verset 262');
assert.equal(qa.reciterUrl('https://cdn.islamic.network/quran/audio/128/ar.alafasy/{ayahg}.mp3', 114, 6), 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/6236.mp3', '{ayahg}');
assert.equal(qa.reciterUrl('http://x/{ayahg}.mp3', 1, 1), null, 'https seulement');
assert.equal(qa.wordsParam('ar', { wbw: true, wbwLang: '' }), '', 'arabe : aucun sens par défaut');
assert.equal(qa.wordsParam('ar', { wbwLang: 'en' }), 'en', 'arabe : langue choisie');
assert.equal(qa.wordsParam('fr', { wbw: true }), 'fr', 'français : suit la langue');
assert.equal(qa.wordsParam('en', { wbw: false }), '', 'option décochée');
const { SURA_VERSES: API } = await import('../../api/src/modules/quran/juz.js');
assert.deepEqual(qa.SURA_VERSES, API, 'même table que l’API');
// La CSP se lit dans le source (le middleware dépend de next/server, absent hors du serveur Next).
const mwSrc = read('../middleware.js');
assert.match(mwSrc, /RECITER_ORIGINS = \['https:\/\/everyayah\.com', 'https:\/\/cdn\.islamic\.network'\]/, 'CSP : serveurs des deux catalogues autorisés');
assert.match(mwSrc, /'media-src': \[\.\.\.new Set\(\["'self'", 'blob:', \.\.\.stor, \.\.\.RECITER_ORIGINS, \.\.\.media/, 'CSP : media-src avec récitateurs');
assert.match(mwSrc, /\/quran\/reciters/, 'CSP : récitateurs proposés lus sur l’API');
assert.match(mwSrc, /media: await reciterOrigins\(\)/, 'CSP : origines passées à buildCsp');
assert.deepEqual(qa.reciterOriginsOf([{ urlTemplate: 'https://a.example/x/{sura3}{aya3}.mp3' }, { urlTemplate: 'https://a.example/y/{ayahg}.mp3' }, { urlTemplate: 'http://b.example/{ayahg}.mp3' }, {}]), ['https://a.example'], 'origines des récitateurs (https, sans doublon)');
assert.match(page, /qrWbwLang/, 'option « Sens des mots » en arabe');
const adm = read('../components/QuranReciters.js');
assert.match(adm, /reciter-catalog\?source=/, 'catalogue dans l’admin'); assert.match(adm, /enabled: false/, 'ajoutés non proposés');
console.log('test_quran_web A1 OK');
