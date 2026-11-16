// Étape N4 (16/11) — Catalogue : filtres en puces (formats, thèmes, sous-thèmes) qui se combinent, une seule grille par thème
// (celle du Catalogue) ; l'accueil y renvoie et l'ancienne adresse /?cat=12 aussi.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Fonctions pures du composant, vérifiées telles qu'elles sont écrites dans le fichier
const cf = read('components/CatalogueFilters.js');
const pure = (name) => {
  const start = cf.indexOf(`export const ${name} =`);
  const end = cf.indexOf('\n};\n', start) + 3;
  return new Function(`${cf.slice(start, end).replace('export const', 'const')}; return ${name};`)();
};
const catalogueHref = pure('catalogueHref');
const rootOf = pure('rootOf');
assert.equal(catalogueHref('', ''), '/catalogue');
assert.equal(catalogueHref('cours', ''), '/catalogue?format=cours');
assert.equal(catalogueHref('', 12), '/catalogue?cat=12');
assert.equal(catalogueHref('cours', '12'), '/catalogue?format=cours&cat=12', 'les deux filtres se combinent');
const cats = [{ id: 1, parentId: null }, { id: 2, parentId: 1 }, { id: 3, parentId: null }];
assert.equal(rootOf(cats, 2), 1, 'sous-thème → thème principal');
assert.equal(rootOf(cats, '3'), 3);
assert.equal(rootOf(cats, 99), null);

// Composant : lignes affichées seulement avec au moins deux choix, liens accessibles
assert.match(cf, /call\('\/formats\?used=1', \{\}, null\)/, 'seulement les formats qui ont des contenus');
assert.match(cf, /if \(formats\.length < 2 && roots\.length < 2\) return null;/);
assert.match(cf, /<nav className="cg-chips" aria-label=\{t\('cgByFormat'\)\}>/);
assert.match(cf, /<nav className="cg-chips" aria-label=\{t\('cgByTheme'\)\}>/);
assert.match(cf, /\{subs\.length > 0 && \(\n\s*<nav className="cg-chips cg-subs" aria-label=\{t\('cgBySub'\)\}>/);
assert.match(cf, /aria-current=\{on \? 'true' : undefined\}/);

// Page Catalogue : filtres sous la bannière et en haut de chaque grille ; grille format + thème
const cp = read('app/catalogue/page.js');
assert.match(cp, /<HomeHero hero=\{hero\}[^\n]*\/>\n\s*<CatalogueFilters \/>/);
assert.match(cp, /<CatalogueFilters format=\{format\} cat=\{cat\} \/>/);
assert.match(cp, /if \(fmt\) params\.set\('format', fmt\);\n\s*if \(cat\) params\.set\('category', cat\);/);
assert.match(cp, /\.filter\(Boolean\)\.join\(' · '\)/, 'titre « Format · Thème »');
assert.doesNotMatch(cp, /call\('\/categories'/, 'catégories prises dans le contexte du site');
assert.match(cp, /allCats: cats/); assert.match(cf, /allCats: cats/, 'sous-catégories comprises');
const pv = read('components/Providers.js');
assert.match(pv, /const cats = useMemo\(\(\) => allCats\.filter\(\(x\) => x\.parentId == null\), \[allCats\]\);/, 'menus : toujours les catégories principales');
assert.match(pv, /value=\{\{ formats, formatName, cats, allCats, features,/);

// Accueil : plus de grille par thème
const hp = read('app/page.js');
assert.match(hp, /useEffect\(\(\) => \{ if \(cat\) router\.replace\(`\/catalogue\?cat=\$\{cat\}`\); \}, \[cat, router\]\);/);
assert.match(hp, /onSeeAll=\{r\.categoryId && r\.total > r\.talks\.length \? \(\) => router\.push\(`\/catalogue\?cat=\$\{r\.categoryId\}`\) : undefined\}/);
assert.doesNotMatch(hp, /setCat|catName|TalkCard|'\/categories'/);
assert.match(read('components/HomeBlocks.js'), /router\.push\(`\/catalogue\?cat=\$\{r\.categoryId\}`\)/);

const i18n = read('lib/i18n.js');
for (const k of ['cgByFormat', 'cgByTheme', 'cgBySub', 'cgAllFormats', 'cgAllThemes', 'cgAllOfTheme'])
  assert.equal((i18n.match(new RegExp(`^    ${k}:`, 'gm')) || []).length, 3, `${k} fr/en/ar`);
assert.match(read('app/globals.css'), /\.cg-chips \{ display: flex; flex-wrap: nowrap;/);
console.log('test_n4_web : OK');
