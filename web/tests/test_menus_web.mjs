// Projet Menus (étape 1) — branchement du site : menus affectés lus par l'en-tête, le menu latéral, la barre du bas et le pied de page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const pages = read('lib/pages.js');
assert.match(pages, /\/menus\/resolved/, 'le site lit les menus résolus de l’API');
assert.match(pages, /menus \? \{ \.\.\.\(base/, 'les menus sont ajoutés à l’objet « layout »');
assert.match(pages, /if \(!res\.ok\) return null/, 'fonction coupée ou API en difficulté : menus d’origine');

const hd = read('components/Header.js');
assert.match(hd, /layout\?\.menus\?\.web_top/, 'en-tête : emplacement « menu du haut »');
assert.match(hd, /<MenuDropdown /, 'en-tête : sous-menu déroulant');
assert.match(hd, /<MenuAccordion /, 'tiroir ☰ : accordéon');
assert.match(hd, /resolveList\(nav\?\.menus\?\.main/, 'menu d’origine conservé sans affectation');

const ms = read('components/MemberShell.js');
assert.match(ms, /layout\?\.menus\?\.web_side/, 'menu latéral');
assert.match(ms, /layout\?\.menus\?\.web_bar/, 'barre du bas');
assert.match(ms, /\.slice\(0, 5\)/, 'barre du bas : 5 liens au plus');
assert.match(ms, /resolveList\(cfg\?\.side\?\.\[g\]/, 'menu latéral d’origine conservé');

const ft = read('components/Footer.js');
assert.match(ft, /layout\?\.menus\?\.web_footer/, 'pied de page');
assert.match(ft, /required: MENUS\.footer\.required/, 'liens légaux obligatoires');

const dd = read('components/MenuDropdown.js');
assert.match(dd, /aria-expanded=\{open\}/, 'accessibilité : aria-expanded');
assert.match(dd, /aria-haspopup="true"/, 'accessibilité : aria-haspopup');
assert.match(dd, /key === 'Escape'/, 'Échap ferme le sous-menu');
assert.match(dd, /mousedown/, 'clic ailleurs ferme le sous-menu');
assert.match(dd, /rel="noopener noreferrer"/, 'liens externes sans fuite');

const ad = read('components/MenusAdmin.js');
for (const k of ['/admin/menus/lookup', '/admin/menus/locations', "method: 'PATCH'", "method: 'DELETE'", 'copy:', 'current:']) assert.ok(ad.includes(k), `écran Menus : ${k}`);
assert.match(read('app/admin/page.js'), /tab === 'menus' && <MenusAdmin \/>/, 'onglet Admin → Menus');
assert.match(read('components/AdminShell.js'), /\['menus', 'Menus'/, 'entrée du menu Admin');
assert.match(read('components/AdminShell.js'), /menus: 'menus'/, 'écran masqué si la fonction « menus » est coupée');
const css = read('app/globals.css');
for (const k of ['.mn-dd-list', '.mn-acc-list', '.mn-row', '.ms-side a.ms-sub']) assert.ok(css.includes(k), `style ${k}`);
console.log('web menus OK');
