// Lot T : le kit est à jour (annuaires, guide), l'exemple est valide et reproductible, le filtre CSS refuse les astuces.
// Lancement depuis la racine du dépôt : node api/tests/test_theme_kit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { scanRoutes, scanCss } from '../theme-kit/scan.mjs';
import { buildGuide, buildExampleZip } from '../src/themeKit.js';
import { parsePack, sanitizeCss } from '../src/themePack.js';
import { readZip, writeZip } from '../src/zip.js';
import { TOKENS } from '../src/themeCss.js';
import { BLOCK_TYPES, SITE_PAGES } from '../src/blocks.js';
import { FEATURES } from '../src/featuresList.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const json = (f) => JSON.parse(fs.readFileSync(new URL('../theme-kit/' + f, import.meta.url), 'utf8'));

// --- Annuaires à jour : si ce test échoue → node api/theme-kit/scan.mjs
ok(JSON.stringify(scanRoutes()) === JSON.stringify(json('routes.json')), 'routes.json = routes du site (web/app) : sinon lancez node api/theme-kit/scan.mjs');
ok(JSON.stringify(scanCss()) === JSON.stringify(json('css-hooks.json')), 'css-hooks.json = classes CSS du site');
ok(fs.readFileSync(new URL('../theme-kit/GUIDE-IA.md', import.meta.url), 'utf8') === buildGuide(), 'GUIDE-IA.md à jour');

// --- Le guide n'oublie rien
const g = buildGuide();
const routes = json('routes.json');
ok(routes.length > 90, `annuaire : ${routes.length} routes`);
ok(routes.every((r) => g.includes('`' + r.path + '`')), 'chaque route du site est dans le guide');
ok(SITE_PAGES.every(([, items]) => items.every(([p]) => g.includes('`' + p + '`'))), 'chaque page qui accepte des blocs est dans le guide');
ok(Object.keys(BLOCK_TYPES).every((t) => g.includes('#### `' + t + '`')), `chaque type de bloc (${Object.keys(BLOCK_TYPES).length}) est décrit`);
ok(TOKENS.every((t) => g.includes('`' + t.id + '`')), `chaque réglage de style (${TOKENS.length}) est décrit`);
ok(FEATURES.every((f) => g.includes('`' + f.id + '`')), `chaque fonction (${FEATURES.length}) est listée`);
ok(routes.filter((r) => r.area === 'public' || r.area === 'kids').every((r) => g.includes('- [ ] `' + r.path + '`')), 'la checklist reprend chaque page publique');
ok(routes.some((r) => r.area === 'kids') && routes.some((r) => r.area === 'studio') && routes.some((r) => r.area === 'admin'), 'Kids, Studio et administration sont dans l\'annuaire');
const cls = Object.values(json('css-hooks.json')).flat();
ok(cls.includes('pb-hero') && g.includes('.pb-hero'), 'classes CSS en annexe');

// --- L'exemple
const zip = buildExampleZip();
const p = parsePack(zip);
ok(p.ok && p.errors.length === 0, 'thème d\'exemple valide');
ok(p.summary.pages >= 7 && p.summary.globals >= 1 && p.summary.templates >= 2 && p.fonts.length === 1, 'exemple complet : pages, section globale, modèles, police');
ok(Buffer.compare(zip, buildExampleZip()) === 0, 'zip reproductible');
const names = readZip(zip).map((e) => e.name);
ok(names.includes('GUIDE-IA.md') && names.includes('theme.json') && names.includes('assets/preview.png'), 'zip : guide, manifeste, aperçu');
ok(p.warnings.length === 0, 'aucun avertissement sur l\'exemple');

// --- Filtre CSS
const bad = (css, re, label) => { const r = sanitizeCss(css, 'x'); ok(r.errors.length > 0 && r.css === '' && (!re || r.errors.some((e) => re.test(e))), 'refusé : ' + label); };
bad('@import "x.css";', /@import/, '@import');
bad('@IMPORT url(a.css);', /@import/, '@IMPORT en capitales');
bad('@\\69mport "x";', /@import/, '@import échappé');
bad('a{background:url(http://x/y.png)}', /url/, 'url http');
bad('a{background:url(//x/y.png)}', /url/, 'url //');
bad('a{background:url("javascript:alert(1)")}', null, 'url javascript');
bad('a{background:url(data:text/html;base64,AAAA)}', /url/, 'url data:text/html');
bad('a{background:url(assets/../../x.png)}', /url/, 'url avec ..');
bad('a{width:expression(1)}', /expression/, 'expression');
bad('a{behavior:url(x.htc)}', null, 'behavior');
bad('a{-moz-binding:url(x)}', null, '-moz-binding');
bad('</style><script>x</script>', null, 'balises');
bad('a{color:red', /Accolades/, 'accolade manquante');
bad('}a{color:red}', /Accolades|équilibr/, 'accolade en trop');
bad('a{color:red}'.repeat(40000), /trop gros/, 'CSS trop gros');
const good = sanitizeCss('/* url(http://x) dans un commentaire */ a{background:url("assets/a.webp")} @font-face{src:url(fonts/f.woff2)} b{background:url(data:image/png;base64,iVBORw0KGgo=)}', 'aurore');
ok(good.errors.length === 0 && good.css.includes('/api/theme-pack/aurore/assets/a.webp') && good.css.includes('/api/theme-pack/aurore/fonts/f.woff2') && !good.css.includes('commentaire'), 'url() du thème réécrits, commentaire retiré');
ok(sanitizeCss('a{background:url(assets/a.webp)}', 'x', new Map()).errors.length === 1, 'fichier cité mais absent du .zip : erreur');

// --- Zip
const rt = readZip(writeZip([{ name: 'theme.json', data: Buffer.from('{}') }]));
ok(rt.length === 1 && rt[0].name === 'theme.json', 'aller-retour zip');
console.log(`\n${fails} échec(s)`); process.exit(fails ? 1 : 0);
