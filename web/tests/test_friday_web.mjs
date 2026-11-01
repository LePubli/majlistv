// Étape 45C — vendredi : carte d'accueil, admin, textes dans les trois langues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const i18n = read('lib/i18n.js');
assert.match(read('components/FridayBand.js'), /\/friday\?lang=/, 'carte lue sur /friday');
assert.match(read('components/FridayBand.js'), /\/coran\/\$\{f\.kahf\.n\}/, 'lien vers la sourate Al-Kahf');
assert.match(read('components/FridayBand.js'), /ready &&/, 'bouton Al-Kahf seulement si le lecteur est prêt');
assert.match(read('app/page.js'), /<FridayBand \/>/, 'carte sur l’accueil');
assert.match(read('app/admin/page.js'), /tab === 'friday' && <FridayAdmin/, 'onglet Admin → Vendredi');
assert.match(read('app/admin/page.js'), /friday: 'Vendredi'/, 'titre de l’onglet');
assert.match(read('components/AdminShell.js'), /\['friday', t\('fdAdminNav'\)/, 'menu Admin');
for (const k of ['fdTitle', 'fdKahf', 'fdRow', 'fdAdminNav']) assert.equal((i18n.match(new RegExp(k + ':', 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web friday OK');
