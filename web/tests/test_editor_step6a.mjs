// Étape 6a : style par élément + colonnes imbriquées (validation, rendu des classes)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanContent, STYLE_ELEMENTS } from '../lib/blocks.js';

const mk = (style) => ({ zones: { main: [{ id: 'aaaa0001', type: 'heading', props: { title: { fr: 'Titre' }, level: 'h2' }, show: {}, style }] } });
const run = (style) => cleanContent(mk(style), 'custom', false);
const ok = run({ elTitleColor: '#FFD700', elTitleSize: 40, elTitleWeight: 700, elTextColor: '@text', elTextSize: 18, elBtnBg: '#112233', elBtnColor: '#ffffff', elBtnRadius: 999, elImgRadius: 24 });
assert.ok(ok && !Object.keys(ok.errors).length, 'réglages valides acceptés');
const st = ok.value.zones.main[0].style;
assert.equal(st.elTitleSize, 40); assert.equal(st.elTitleWeight, 700); assert.equal(st.elBtnRadius, 999);
for (const bad of [{ elTitleSize: 5 }, { elTitleSize: 500 }, { elTitleWeight: 650 }, { elTextColor: 'rouge' }, { elBtnRadius: -1 }, { elImgRadius: 'a' }, { elFoo: 1 }]) {
  const r = run(bad);
  assert.ok(Object.keys(r.errors).length, `refusé : ${JSON.stringify(bad)}`);
}
assert.equal(Object.keys(STYLE_ELEMENTS).length, 9);
const pb = fs.readFileSync(new URL('../components/PageBlocks.js', import.meta.url), 'utf8');
assert.ok(pb.includes("'--el-tc'") && pb.includes('nested />'), 'rendu : variables par élément + colonnes imbriquées');
const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
for (const c of ['.pb.el-tc', '.pb.el-ts', '.pb.el-tw', '.pb.el-xc', '.pb.el-xs', '.pb.el-bb', '.pb.el-bc', '.pb.el-br', '.pb.el-ir']) assert.ok(css.includes(c), c);
console.log('OK étape 6a : style par élément');
