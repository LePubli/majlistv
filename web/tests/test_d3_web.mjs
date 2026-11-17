// Étape D3 (17/11/2026) — thème « Mejliss bleu » en version streaming bleu nuit : accueil (une plein écran, rangées, univers),
// vignettes (affiche de secours propre à chaque vidéo), page vidéo (étiquettes, trois cartes « Apprendre avec cette vidéo »).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('app/skin-bleu.css');
const glob = read('app/globals.css');

// Accueil : l'ordre « streaming » n'existe que pour le thème bleu ; l'accueil d'origine reste en place pour les autres thèmes.
const home = read('app/page.js');
assert.match(home, /if \(skin === 'bleu'\) \{/);
assert.match(home, /<main className="st-home">/);
const st = home.slice(home.indexOf("if (skin === 'bleu')"), home.indexOf('  return (\n    <main>'));
const order = ['<HomeHero', 'row-continue', 'row-later', 'rows.slice(0, 1)', 'st-univ', '<StartCards', 'rows.slice(1, 3)', '<KidsBand', 'rows.slice(3)', 'st-learn', '<EventsBand', '<CitationCard'];
let at = -1;
for (const k of order) { const i = st.indexOf(k); assert.ok(i > at, `ordre de l'accueil : ${k}`); at = i; }
// À la une : vidéos choisies dans Admin, à défaut les 5 plus récentes (jamais de contenu inventé).
assert.match(st, /const auto = rows0\(home\)\.slice\(0, 5\);/);
assert.match(st, /home\?\.hero\?\.mode === 'text' && auto\.length \? \{ mode: 'featured', items: auto \} : home\?\.hero/);
// Univers : thèmes réels (rangées par catégorie), image = première vidéo du thème, nombre réel de vidéos.
assert.match(st, /rows\.filter\(\(r\) => r\.categoryId != null && r\.talks\?\.length\)/);
assert.match(st, /href=\{`\/catalogue\?cat=\$\{r\.categoryId\}`\}/);
assert.match(st, /<span>\{r\.total\}<\/span>/);
assert.match(glob, /\.wb-chips \{ display: none; \}/); assert.match(glob, /\.ph-t \{ display: none; \}/);

// Une : bouton « Ma liste » réel (même fonction que les vignettes), image haute définition seulement si elle existe.
const hero = read('components/HomeHero.js');
assert.match(hero, /toggleMyList\(x\.id\)/); assert.match(hero, /if \(!user\) \{ router\.push\('\/login'\); return; \}/);
assert.match(hero, /aria-pressed=\{mine\}/);
assert.match(hero, /img\.naturalWidth > 320/); assert.match(hero, /'maxresdefault'/);
assert.match(hero, /className="banner-dots" role="group"/);
assert.match(css, /\.st-home > \.hero\.banner \{ margin-top: calc\(-1 \* var\(--hd-h\)\);/);
assert.match(css, /linear-gradient\(90deg, rgba\(6, 16, 34, \.96\) 0%/, 'dégradé sombre à gauche');
assert.match(css, /html\[data-skin="bleu"\]\[dir="rtl"\] \.hero\.banner \.banner-shade/, 'dégradé inversé en arabe');
assert.match(css, /prefers-reduced-motion: reduce/);

// Ordinateur : plus de menu latéral dans ce thème ; téléphone : la barre du bas reste.
assert.match(css, /@media \(min-width: 901px\) \{\s*html\[data-skin="bleu"\] \.ms \{ display: block; \}\s*html\[data-skin="bleu"\] \.ms-side \{ display: none; \}/);

// Vignettes : affiche de secours propre à la vidéo (teinte tirée de l'identifiant + titre), pas une image commune.
const card = read('components/TalkCard.js');
assert.match(read('lib/thumb.js'), /export const posterHue = /);
assert.match(card, /\{!thumb && <span className="ph-t" aria-hidden="true">\{talk\.title\}<\/span>\}/);
assert.match(read('components/SeriesCard.js'), /posterHue\(series\.id\)/);
const hue = (id) => { let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return 195 + (h % 70); };
assert.notEqual(hue('a1'), hue('b2')); assert.ok(hue('x') >= 195 && hue('x') < 265, 'teintes dans les bleus et violets');
assert.match(css, /\.thumb\.no-img \{ background: radial-gradient/);

// Page vidéo : étiquettes (durée, langue, sous-titres, quiz, accès) et trois cartes distinctes.
const talk = read('app/talks/[id]/TalkClient.js');
assert.match(talk, /<ul className="wb-chips" aria-label=\{t\('wbInfos'\)\}>/);
assert.match(talk, /\{quizOn && <li>\{t\('wbQuizChip'\)\.replace\('\{n\}', talk\.quiz\.count\)\}<\/li>\}/);
for (const s of ['quiz', 'revision', 'practice']) { assert.ok(talk.includes(`data-step="${s}"`)); assert.ok(css.includes(`.wb-step[data-step="${s}"] .wb-num`), `carte ${s}`); }
assert.match(talk, /'--amb': `url\(\$\{thumbOf\(talk\)\}\)`/);
// Textes dans les trois langues.
const i18n = read('lib/i18n.js');
for (const k of ['hmUniverses', 'hmLearnBand', 'wbInfos', 'wbSubs', 'wbQuizChip']) assert.equal((i18n.match(new RegExp(`\\n {4}${k}: `, 'g')) || []).length, 3, `${k} en fr/en/ar`);
// Logo : variante pour fond sombre partout.
assert.match(read('components/BrandImg.js'), /-bleu-s`;/);
console.log('test_d3_web OK');
