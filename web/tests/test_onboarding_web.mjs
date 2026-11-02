// Étape B2 — « Par quoi commencer ? » et visite guidée : composants, place sur l'accueil, menu du compte, textes FR/EN/AR.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const c = read('components/Onboarding.js');
assert.match(c, /user\.onboarded !== false \|\| !feat\('onboarding'\)/, 'écran seulement pour un nouveau compte, fonction activée');
assert.match(c, /\/me\/onboarding/, 'marqué vu côté serveur'); assert.match(c, /\.slice\(0, 3\)/, '3 cartes au plus');
assert.match(c, /'\/\?tour=1'/, 'bouton visite guidée'); assert.match(c, /e\.key === 'Escape'/, 'Échap ferme la visite');
assert.match(c, /aria-modal="true"/, 'bulle accessible (dialogue)'); assert.match(c, /hd-burger/, 'téléphone : bouton du menu éclairé');
assert.match(c, /dir === 'rtl'/, 'flèches inversées en arabe');
const home = read('app/page.js');
assert.match(home, /\{browsing && <StartCards \/>\}/, 'accueil d’origine'); assert.match(home, /<StartCards \/><TodayBlock \/>/, 'accueil en blocs');
assert.equal((home.match(/\{tour\}/g) || []).length, 2, 'visite sur les deux accueils'); assert.match(home, /sp\.get\('tour'\) === '1'/, 'visite par ?tour=1');
assert.equal((read('components/Header.js').match(/href="\/\?tour=1"/g) || []).length, 2, 'menu du compte et menu téléphone');
assert.match(read('components/Providers.js'), /patchUser:/, 'mise à jour locale du compte');
const i18n = read('lib/i18n.js');
for (const k of ['obTitle', 'obIntro', 'obTalk', 'obTalkTx', 'obQuran', 'obQuranTx', 'obAthkar', 'obAthkarTx', 'obRamadan', 'obRamadanTx', 'obLearnBadge', 'obTourBtn', 'obLater', 'obAria',
  'tourOf', 'tourPrev', 'tourNext', 'tourEnd', 'tourSkip', 'tourMenu', 'tourAria', 'tourToday_t', 'tourToday', 'tourLearn_t', 'tourLearn', 'tourQuran_t', 'tourQuran',
  'tourSearch_t', 'tourSearch', 'tourAccount_t', 'tourAccount', 'tourBurger_t', 'tourBurger']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web onboarding OK');
