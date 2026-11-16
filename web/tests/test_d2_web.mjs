// Étape D2 (16/11/2026) — thème « Mejliss bleu » (nouvelle charte de la planche D1-bis), activable et réversible.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));

const css = read('app/skin-bleu.css');
const lay = read('app/layout.js');
assert.match(lay, /import '\.\/skin-bleu\.css';/, 'feuille du thème chargée');
assert.match(lay, /import '@fontsource-variable\/inter';/, 'police Inter auto-hébergée');
assert.match(read('package.json'), /"@fontsource-variable\/inter": "5\.2\.8"/, 'version figée');
// Tout est sous html[data-skin="bleu"] : les thèmes Classique et Nuit et or ne bougent pas.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter((r) => r.includes('{'));
for (const r of rules) {
  const sel = r.slice(0, r.indexOf('{')).trim();
  const parts = []; let depth = 0; let cur = '';
  for (const ch of sel) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  assert.ok(parts.every((x) => /^\s*html(\[data-skin="bleu"\]|:not\(\[data-skin="bleu"\]\))/.test(x)), `règle limitée au thème bleu : ${sel}`);
}
// Charte : couleurs et polices de la planche.
for (const c of ['#004283', '#1677E8', '#071426', '#F4F7FC', '#182334', '#5F6F86', '#EAF3FF']) assert.ok(css.includes(c), `couleur ${c}`);
assert.match(css, /--font-body: 'Inter Variable'/); assert.match(css, /--font-title: 'Montserrat Variable'/);
assert.match(css, /color-scheme: light;/);
// Kids garde son ciel de nuit ; zones sombres (héros, lecteur, pied de page) redéfinies en texte clair.
assert.match(css, /html\[data-skin="bleu"\]:has\(> body\.kd-theme\) \{ background: var\(--kids-bg\); color-scheme: dark; \}/);
assert.match(css, /body:not\(\.kd-theme\) \{/);
for (const z of ['.site-footer', '.player-wrap', '.hero', '.wb-hero', '.lg-resume']) assert.ok(css.includes(z), `zone sombre ${z}`);
assert.match(css, /url\('\/brand\/scene-nuit\.svg'\)/, 'scène de nuit dessinée pour le héros sans image');
assert.ok(exists('public/brand/scene-nuit.svg'));
// Logo : même dessin recoloré, les deux versions dans la page, la bonne affichée par le thème.
for (const f of ['emblem-bleu-s', 'emblem-bleu-clair-s', 'wordmark-bleu-s', 'wordmark-bleu-clair-s']) assert.ok(exists(`public/brand/${f}.png`), f);
const bi = read('components/BrandImg.js');
assert.match(bi, /sk-classic/); assert.match(bi, /sk-bleu/);
assert.match(css, /html:not\(\[data-skin="bleu"\]\) \.sk-bleu \{ display: none !important; \}/);
assert.match(css, /html\[data-skin="bleu"\] \.sk-classic \{ display: none !important; \}/);
for (const f of ['Header', 'Footer', 'ManageShell', 'AppPromo']) assert.match(read(`components/${f}.js`), /<BrandImg /, `${f} : logo selon le thème`);
assert.doesNotMatch(read('components/Header.js'), /src="\/brand\/(emblem|wordmark)-s\.png"/, 'plus de logo doré écrit en dur dans l’en-tête');
// Choix du thème : réglage et sélecteur.
assert.match(read('components/SkinPicker.js'), /\['bleu', 'skBlue'\]/);
const i18n = read('lib/i18n.js');
assert.equal((i18n.match(/\n {4}skBlue: /g) || []).length, 3, 'skBlue en fr/en/ar');
const settings = fs.readFileSync(new URL('../../api/src/settings.js', import.meta.url), 'utf8');
assert.match(settings, /key: 'skin_default', group: 'general', type: 'select', options: \['classique', 'nuit', 'bleu'\]/);
assert.match(fs.readFileSync(new URL('../../api/src/index.js', import.meta.url), 'utf8'), /\['nuit', 'bleu'\]\.includes\(await getSetting\('skin_default'\)\)/);
console.log('test_d2_web OK');
