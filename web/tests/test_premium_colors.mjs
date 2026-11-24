// Thème Premium réglable (étape 1 de l'éditeur visuel) : classement des couleurs en rôles, décalage de teinte, et garde-fous
// sur les feuilles de style (aucune couleur écrite en dur, chaque variable a son repli d'origine).  node web/tests/test_premium_colors.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PREMIUM_BASES } from '../lib/premiumBases.js';
import { PM_ROLES, roleOf, premiumOverrides, shiftColor, hexToRgb, rgbToHsl } from '../lib/premiumColors.js';
import { buildCss, cleanValues } from '../lib/themeCss.js';

// 1. Chaque rôle a une couleur d'origine qui retombe dans son propre rôle, et des couleurs à suivre.
const count = {};
for (const b of PREMIUM_BASES) { const r = roleOf(b); if (r) count[r] = (count[r] || 0) + 1; }
for (const r of PM_ROLES) {
  assert.equal(roleOf(r.anchor.slice(1)), r.id, `${r.id} : la couleur d'origine n'est pas dans son rôle`);
  assert.ok((count[r.id] || 0) >= 10, `${r.id} : trop peu de couleurs rattachées (${count[r.id]})`);
  assert.equal(shiftColor(r.anchor.slice(1), r.id, r.anchor), r.anchor, `${r.id} : un décalage nul doit rendre la couleur d'origine`);
}

// 2. Aucun réglage = aucune variable publiée ; un rôle laissé à l'origine ne publie rien.
assert.deepEqual(premiumOverrides({}), {});
assert.deepEqual(premiumOverrides({ pmPrimary: '#087cff', pmBg: '#061325' }), {});
assert.ok(!/--c-|--pm-/.test(buildCss({})), 'le thème d\'origine ne publie rien de Premium');
assert.deepEqual(premiumOverrides({ pmPrimary: 'rouge', pmBg: '#abc' }), {}, 'valeur non #RRGGBB ignorée');

// 3. Le bleu principal choisi devient exactement la couleur choisie ; les nuances suivent (même teinte que le choix).
const ov = premiumOverrides({ pmPrimary: '#16a34a' });
assert.equal(ov['--c-087cff'], '#16a34a');
const roleBases = PREMIUM_BASES.filter((b) => roleOf(b) === 'pmPrimary');
assert.equal(Object.keys(ov).length, roleBases.length, 'toutes les couleurs du rôle sont republiées, et elles seules');
const [h1] = rgbToHsl(...hexToRgb('#16a34a'));
let off = 0;
for (const b of roleBases) { const [h, s] = rgbToHsl(...hexToRgb(ov[`--c-${b}`].slice(1))); if (s > 10 && Math.abs(h - h1) > 25) off++; }
assert.ok(off / roleBases.length < 0.1, `les nuances du rôle gardent la teinte choisie (${off}/${roleBases.length} hors teinte)`);

// 4. Texte : le blanc pur prend la teinte choisie (rôle texte).
assert.match(premiumOverrides({ pmText: '#ffe9b0' })['--c-ffffff'], /^#ff[e-f][0-9a-f]{3}$/);

// 5. Polices : seulement si choisies ; pile arabe ; nom inconnu refusé.
const css = buildCss({ pmFontBody: 'Poppins', pmFontTitle: 'Inter Variable' });
assert.match(css, /--pm-font-body:'Poppins','Noto Sans Arabic Variable'/);
assert.match(css, /--pm-font-title:'Inter Variable'/);
assert.ok(!css.includes('--pm-font-bo:'), 'police non choisie : rien');
assert.match(css, /:root:lang\(ar\)\{--pm-font-body:'Noto Sans Arabic Variable','Poppins'/);
assert.ok(cleanValues({ pmFontBody: 'Inconnue' }).errors.pmFontBody);
assert.deepEqual(cleanValues({ pmFontBody: '' }).values, {});

// 6. Feuilles de style : plus aucune couleur en dur (hors url, chaînes, var()) ; chaque --c-xxxxxx a son repli d'origine
//    et sa base est dans premiumBases.js.
const FILES = ['web/public/premium/v20.css', 'web/public/premium/bo-mock.css', 'web/app/skin-premium.css', 'web/app/skin-premium-admin.css'];
const known = new Set(PREMIUM_BASES);
const problems = [];
for (const f of FILES) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/var\(--c-([0-9a-f]{6}),(#[0-9a-f]{6})\)/g)) {
    if (`#${m[1]}` !== m[2]) problems.push(`${f} : repli différent de la variable (${m[0]})`);
    if (!known.has(m[1])) problems.push(`${f} : couleur absente de premiumBases.js (${m[1]}) — relancer web/scripts/themeify-premium-css.py`);
  }
  for (const m of src.matchAll(/\{([^{}]*)\}/g)) {
    const decl = m[1].replace(/url\([^)]*\)/gi, '').replace(/(["'])(?:(?!\1).)*\1/g, '').replace(/var\((?:[^()]|\([^()]*\))*\)/g, '');
    const hit = decl.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|(?<![\w#-])(?:white|black)(?![\w-])/);
    if (hit) problems.push(`${f} : couleur écrite en dur « ${hit[0]} » dans ${m[1].slice(0, 80)} — relancer web/scripts/themeify-premium-css.py`);
  }
}
assert.deepEqual(problems.slice(0, 10), [], problems.slice(0, 10).join('\n'));
console.log(`OK premium colors : ${PREMIUM_BASES.length} couleurs, ${Object.keys(count).length} rôles`);
