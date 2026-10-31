// Étape 44 : textes dans les 3 langues, écran Admin relié (avec son titre), page Abonnement avec choix du pays, liste de pays.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const KEYS = ['payCountry', 'payCountryPick', 'payRegionNote', 'paySepa', 'regAdmin', 'regTitle', 'regIntro', 'regName', 'regCountries', 'regPM', 'regPY', 'regPLM', 'regPLY', 'regEnabled',
  'regSave', 'regNew', 'regEdit', 'regDelete', 'regConfirmDelete', 'regNone', 'regSaved', 'regCancel', 'regLearnNote'];
for (const lang of ['fr', 'en', 'ar']) {
  const line = i18n.split('\n').find((l) => l.startsWith(`  ${lang}: {`));
  assert.ok(line, `langue ${lang}`);
  for (const k of KEYS) assert.ok(new RegExp(`(^|[ ,{])${k}:`).test(line), `${lang} : clé ${k}`);
}
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const admin = read('../app/admin/page.js');
assert.match(admin, /PricingRegionsAdmin/, 'écran Admin → Tarifs par pays');
assert.match(admin, /regions: 'Tarifs par pays'/, "titre de l'écran (sinon le tableau de bord s'affiche à la place)");
assert.match(read('../components/AdminShell.js'), /'regions'/, 'menu Admin');
const pricing = read('../app/pricing/page.js');
assert.match(pricing, /billing\/plans\$\{country/, 'tarif lu pour le pays choisi');
assert.match(pricing, /info\.regionalPricing && country \? \{ country \}/, 'pays envoyé au paiement');
assert.match(pricing, /info\.wallets/, 'Apple Pay / Google Pay annoncés sur demande');
const { COUNTRY_CODES, countryName } = await import('../lib/countries.js');
assert.ok(COUNTRY_CODES.every((c) => /^[A-Z]{2}$/.test(c)) && new Set(COUNTRY_CODES).size === COUNTRY_CODES.length, 'codes pays valides et uniques');
for (const c of ['FR', 'MA', 'DZ', 'TN', 'SN', 'BE', 'CA', 'US']) assert.ok(COUNTRY_CODES.includes(c), `pays ${c} présent`);
assert.equal(countryName('FR', 'fr'), 'France');
console.log('web regions OK');
