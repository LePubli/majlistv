// Éditeur visuel, étape 5 : polices, survol, animations, réglages par appareil, droits des modérateurs (câblage du site).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STYLE_FONTS, STYLE_HOVER, STYLE_ANIM, PAD_DEVICE_KEYS, fontCss, cleanContent } from '../lib/blocks.js';
import { BUILTIN_FONTS } from '../lib/themeCss.js';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Les polices proposées par bloc sont exactement celles livrées avec le site.
assert.deepEqual([...STYLE_FONTS].sort(), [...BUILTIN_FONTS].sort(), 'STYLE_FONTS = BUILTIN_FONTS');
assert.equal(fontCss('Poppins'), '"Poppins", system-ui, sans-serif');
assert.match(fontCss('Serif'), /Georgia/);
assert.match(fontCss('Système'), /system-ui/);
assert.equal(fontCss('Comic Sans'), null);
assert.equal(fontCss(undefined), null);

// Validation (même code que l'API) : réglages valides conservés, invalides refusés.
const mk = (style) => cleanContent({ meta: {}, zones: { main: [{ id: 'abcdef123', type: 'divider', props: {}, show: { devices: ['m', 't', 'd'], audience: 'all' }, style }] } }, 'custom');
const good = { font: 'Lora Variable', hover: 'glow', hoverBg: '#101010', anim: 'zoom', animDelay: 150, padTopT: 12, padBottomM: 0, minHeightM: 100, alignM: 'end' };
const r = mk(good);
assert.deepEqual(r.errors || {}, {}, 'réglages valides');
assert.equal(r.value.zones.main[0].style.font, 'Lora Variable');
assert.equal(r.value.zones.main[0].style.padBottomM, 0);
for (const bad of [{ font: 'X' }, { hover: 'x' }, { anim: 'x' }, { animDelay: 2001 }, { padTopT: 241 }, { alignM: 'justify' }]) {
  assert.ok(Object.keys(mk(bad).errors || {}).length > 0, `refusé : ${JSON.stringify(bad)}`);
}
assert.ok(STYLE_HOVER.length >= 4 && STYLE_ANIM.length >= 6 && PAD_DEVICE_KEYS.length === 4);

// Câblage : rendu, éditeur, styles.
const pb = read('components/PageBlocks.js');
for (const t of ['fontCss(st.font)', 'pbh-', 'pb-anim', 'IntersectionObserver', 'prefers-reduced-motion', '--pt-m', 'al-m-']) assert.ok(pb.includes(t), `PageBlocks : ${t}`);
assert.ok(pb.includes('st.anim && !preview'), 'pas d\'animation dans l\'aperçu de l\'éditeur');
const pf = read('components/PageFields.js');
for (const t of ['Police de ce bloc', 'Survol (souris)', 'Animation d’apparition', 'Tablette et téléphone']) assert.ok(pf.includes(t), `PageFields : ${t}`);
const css = read('app/globals.css');
for (const t of ['.pb.pbh-lift:hover', '.pb-anim.pb-armed', '@keyframes pb-appear-up', '.pb.pt-m', '.pb.al-m-center', '.pe-sub']) assert.ok(css.includes(t), `globals.css : ${t}`);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^}]*\.pb-anim/, 'animations coupées si « réduire les animations »');
const ed = read('components/editor/SiteEditor.js');
for (const t of ["user?.role === 'moderator'", 'isAdmin', 'denied', 'un administrateur publie']) assert.ok(ed.includes(t), `SiteEditor : ${t}`);
assert.ok(/isAdmin \? \[\['style', 'Style'\]\]/.test(ed), 'onglet Style (thème) réservé à l\'administrateur');
console.log('test_editor_step5 OK');
