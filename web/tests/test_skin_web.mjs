// Thème « Nuit et or » en plus du thème classique : choix du visiteur (cookie), réglage par défaut, feuille de style, ornements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lay = read('app/layout.js');
assert.match(lay, /import '\.\/skin-nuit\.css'/, 'feuille du thème chargée'); assert.match(lay, /@fontsource\/marcellus/, 'police Marcellus auto-hébergée'); assert.match(lay, /@fontsource\/amiri/, 'police Amiri auto-hébergée');
assert.match(lay, /cookies\(\)\.get\('skin'\)/, 'choix du visiteur lu par le serveur (pas de clignotement)');
assert.match(lay, /skinCfg\?\.choice === true && \(wanted === 'nuit' \|\| wanted === 'classique'\) \? wanted : skinDef/, 'par défaut (et API muette) : thème choisi par l’administrateur, cookie du visiteur ignoré');
assert.match(lay, /data-skin=\{skin\}/, 'attribut data-skin sur <html>');
const css = read('app/skin-nuit.css');
assert.ok(!/^:root|^body \{/m.test(css), 'le thème classique n’est jamais modifié (tout est sous html[data-skin="nuit"])');
for (const f of ['tile', 'frieze', 'rosette', 'rinceau', 'star', 'tile-card']) { assert.ok(fs.existsSync(new URL(`../public/skin/${f}.svg`, import.meta.url)), `ornement ${f}.svg`); }
assert.match(css, /\[dir="rtl"\] \.hero::after/, 'rosace placée à gauche en arabe');
const sp = read('components/SkinPicker.js');
assert.match(sp, /if \(!skinChoice\) return null/, 'sélecteur masqué si le choix est fermé'); assert.match(sp, /aria-pressed=\{cur === id\}/, 'état du bouton annoncé');
assert.match(read('components/Footer.js'), /<SkinPicker \/>/, 'sélecteur dans le pied de page');
assert.equal((read('components/Header.js').match(/<SkinPicker \/>/g) || []).length, 2, 'menu du compte et menu du téléphone');
const i18n = read('lib/i18n.js');
for (const k of ['skLabel', 'skClassic', 'skNight']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web skin OK');
// Correctifs 02/11 (retours d'Epok sur téléphone)
{
  const g = read('app/globals.css'); const c = read('app/skin-nuit.css'); const h = read('components/Header.js');
  assert.match(g, /\.hd \.hd-el:has\(> \.btn\), \.hd \.hd-el > \.btn \{ display: none; \}/, 'aucun bouton dans l’en-tête sur téléphone');
  assert.match(g, /html, body \{ overflow-x: clip; \}/, 'la page ne peut plus être plus large que l’écran');
  assert.match(c, /\.hero:not\(\.banner\) > \* \{ position: relative/, 'bandeau avec photo : calques intacts (photo visible)');
  assert.doesNotMatch(c, /html\[data-skin="nuit"\] \.hero \{ background: transparent/, 'la photo du bandeau n’est plus effacée');
  assert.ok(h.indexOf('<AppPromo variant="drawer" />') > h.indexOf('<SkinPicker />'), 'menu du téléphone : promotion de l’application après tous les liens');
  console.log('web skin correctifs OK');
}
