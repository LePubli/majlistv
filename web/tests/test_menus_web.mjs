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
assert.match(hd, /defaultList\(withHid\(MENUS\.main\.builtin, mainD\)\)/, 'menu d’origine conservé sans affectation');

const ms = read('components/MemberShell.js');
assert.match(ms, /layout\?\.menus\?\.web_side/, 'menu latéral');
assert.match(ms, /layout\?\.menus\?\.web_bar/, 'barre du bas');
assert.match(ms, /\.slice\(0, 5\)/, 'barre du bas : 5 liens au plus');
assert.match(ms, /defaultList\(withHid\(MENUS\.side\.builtin\[g\], sideD\)\)/, 'menu latéral d’origine conservé');

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
const css = (read('app/globals.css') + read('app/back.css'));
for (const k of ['.mn-dd-list', '.mn-acc-list', '.mn-row', '.ms-side a.ms-sub']) assert.ok(css.includes(k), `style ${k}`);
console.log('web menus OK');
// Audit 11/2026 : l'ancien éditeur ne règle plus les menus (double emploi avec Admin → Menus) ; il garde l'en-tête et le pied de page.
{
  const na = read('components/NavAdmin.js');
  assert.match(na, /href="\/admin\?tab=menus"/, 'lien vers Admin → Menus');
  assert.doesNotMatch(na, /MenuList|nav\.menus|Menu latéral/, 'plus de réglage des menus dans Admin → Pages');
  assert.match(na, /ZonesEditor def=\{HEADER\}/, 'en-tête toujours réglable');
  assert.match(na, /ZonesEditor def=\{FOOTER\}/, 'pied de page toujours réglable');
  for (const f of ['components/Header.js', 'components/Footer.js', 'components/MemberShell.js']) assert.doesNotMatch(read(f), /nav\?\.menus|resolveList/, `${f} : plus d'anciens réglages de menus`);
  assert.match(read('components/PagesAdmin.js'), /href="\/admin\?tab=menus"/, 'Admin → Pages renvoie vers Admin → Menus');
  console.log('web menus : ancien éditeur réduit OK');
}
