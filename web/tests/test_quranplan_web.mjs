// Étape 45E — lecture du Coran en 30 jours : carte en haut de la page Coran, textes dans les trois langues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const c = read('components/QuranPlan.js'); const i18n = read('lib/i18n.js');
assert.match(read('components/QuranIndex.js'), /feat\('quranplan'\) && <QuranPlan \/>/, 'carte en haut de la page Coran (et de l’onglet Coran d’Apprendre)');
assert.match(c, /\/quran\/plan\/start/, 'commencer'); assert.match(c, /\/quran\/plan\/juz\/\$\{/, 'cocher un juz'); assert.match(c, /\/quran\/plan\/prefs/, 'rappel');
assert.match(c, /<InviteCard context="quran" next="\/coran" \/>/, 'visiteur : invitation (inscription ou connexion) puis retour à la page Coran');
assert.match(c, /\/coran\/\$\{today\.start\.sura\}#v\$\{today\.start\.aya\}/, 'lien vers le début du juz du jour');
for (const k of ['khTitle', 'khIntro', 'khStart', 'khDay', 'khToday', 'khMark', 'khRemind', 'khRestart', 'khStop', 'khFinished']) assert.equal((i18n.match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web quran plan OK');
