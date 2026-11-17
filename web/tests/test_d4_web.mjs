// Étape D4 (17/11/2026) — Catalogue du thème « Mejliss bleu » : titre et recherche, filtres, mosaïque « À la une », toutes les vidéos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const cp = read('app/catalogue/page.js');
const css = read('app/skin-bleu.css');

// Recherche : un vrai formulaire, l'adresse garde la recherche, champ vide = retour au Catalogue ; l'API filtre (GET /talks?q=).
assert.match(cp, /<form className="cg-search" role="search" onSubmit=\{go\}>/);
assert.match(cp, /router\.push\(v \? `\/catalogue\?q=\$\{encodeURIComponent\(v\)\}` : '\/catalogue'\)/);
assert.match(cp, /const q = \(sp\.get\('q'\) \|\| ''\)\.trim\(\)\.slice\(0, 80\);/);
assert.match(cp, /const params = new URLSearchParams\(\{ q \}\);/);
assert.match(cp, /search !== null \? t\('cgNoResult'\) : t\('noTalks'\)/, 'message quand rien ne correspond');
assert.match(cp, /aria-label=\{t\('cgSearchClear'\)\}/);
const api = fs.readFileSync(new URL('../../api/src/routes/talks.js', import.meta.url), 'utf8');
assert.match(api, /t\.title ILIKE '%' \|\| \$1 \|\| '%' OR t\.speaker ILIKE/, 'la recherche porte sur le titre et l’intervenant');
assert.match(api, /t\.transcript_text ILIKE/, '… et sur la transcription');

// Page du thème bleu : pas de deuxième bannière d'accueil, mais une mosaïque (1 grande + 4 petites au plus) puis la grille complète.
const st = cp.slice(cp.indexOf("if (skin === 'bleu')"));
assert.ok(st.indexOf('<SearchBox') < st.indexOf('<CatalogueFilters />') && st.indexOf('<CatalogueFilters />') < st.indexOf('cg-mosaic') && st.indexOf('cg-mosaic') < st.indexOf('cg-all'), 'ordre : recherche, filtres, à la une, tout');
assert.match(st, /feat\.slice\(0, 5\)\.map\(\(x, i\) => <FeatureCard key=\{x\.id\} x=\{x\} t=\{t\} big=\{i === 0\} \/>\)/);
assert.match(st, /data\.rows\.filter\(\(r\) => r\.format\)/, 'rangées par format seulement (les nouveautés sont dans la grille)');
assert.match(st, /<Grid params=\{new URLSearchParams\(\)\} t=\{t\} call=\{call\} bare \/>/);
assert.match(cp, /if \(bare\) return body;/);
// Les autres thèmes gardent la page d'origine (bannière + filtres + rangées).
assert.match(cp, /<HomeHero hero=\{hero\}[^\n]*\/>\n\s*<CatalogueFilters \/>/);
// Carte à la une : image de la vidéo, sinon affiche de secours propre à la vidéo.
assert.match(cp, /style=\{img \? \{ backgroundImage: `url\(\$\{img\}\)` \} : \{ '--ph-h': posterHue\(x\.id\) \}\}/);
for (const c of ['.cg-search', '.cg-mosaic', '.cg-feat', '.cg-chips a.on']) assert.ok(css.includes(c), `style ${c}`);
assert.match(css, /\.cg-search:focus-within/); assert.match(css, /\.cg-feat:hover, html\[data-skin="bleu"\] \.cg-feat:focus-visible/);
const i18n = read('lib/i18n.js');
for (const k of ['cgSearchPh', 'cgSearchClear', 'cgResults', 'cgNoResult', 'cgFeatured', 'cgAll', 'cgTitle']) assert.equal((i18n.match(new RegExp(`\\n {4}${k}: `, 'g')) || []).length, 3, `${k} en fr/en/ar (une seule fois par langue)`);
console.log('test_d4_web OK');
