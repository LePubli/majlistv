// Lot B : modèles enregistrés et sections globales
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanContent, BLOCK_TYPES, ZONES, TYPE_ORDER } from '../lib/blocks.js';
import { reidBlocks } from '../lib/editorOps.js';

assert.deepEqual(ZONES.global, ['main']);
assert.ok(BLOCK_TYPES.global && TYPE_ORDER.includes('global'));
const g = (ref) => ({ zones: { main: [{ id: 'gg000001', type: 'global', props: { ref }, show: {}, style: {} }] } });
assert.equal(Object.keys(cleanContent(g('bandeau-ramadan'), 'custom').errors).length, 0, 'référence valide');
assert.ok(Object.keys(cleanContent(g('Pas Valide'), 'custom').errors).length, 'nom invalide refusé');
assert.ok(Object.keys(cleanContent(g('x'), 'global').errors).length, 'une section globale ne contient pas de section globale');
// copie profonde avec identifiants neufs
let n = 0;
const src = [{ id: 'a', type: 'columns', props: { count: '2' }, cols: [[{ id: 'b', type: 'text', props: {} }], [{ id: 'c', type: 'text', props: {} }]] }];
const out = reidBlocks(src, () => `n${n++}`);
const ids = JSON.stringify(out).match(/"id":"[^"]+"/g);
assert.equal(new Set(ids).size, 3);
assert.ok(ids.every((i) => i.startsWith('"id":"n')), 'tous les identifiants sont neufs');
assert.equal(src[0].id, 'a', 'l’original n’est pas modifié');

const ed = fs.readFileSync(new URL('../components/editor/SiteEditor.js', import.meta.url), 'utf8');
for (const k of ['/admin/page-templates', 'saveBlockTemplate', 'makeGlobal', 'savePageTemplate', 'GlobalsContext.Provider', 'templateId', "kind: 'global'"]) assert.ok(ed.includes(k), k);
const pb = fs.readFileSync(new URL('../components/PageBlocks.js', import.meta.url), 'utf8');
assert.ok(pb.includes('function GlobalBlock') && pb.includes("case 'global'") && pb.includes('/_global/'), 'rendu des sections globales');
const pf = fs.readFileSync(new URL('../components/PageFields.js', import.meta.url), 'utf8');
assert.ok(pf.includes('GlobalRefField') && pf.includes("case 'slug'"), 'sélecteur de section globale');
console.log('OK lot B : modèles et sections globales');
