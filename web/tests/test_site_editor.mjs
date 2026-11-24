// Éditeur visuel (étape 2) : opérations sur les blocs (insertion, déplacement, copie, suppression), cible de dépôt sous le pointeur,
// annuler / rétablir.   node web/tests/test_site_editor.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getList, zoneDepth, blockHeight, canPlace, isColZone, findBlock, insertBlock, removeBlock, moveBlock, nudgeBlock, duplicateBlock, dropTarget, newHistory, pushHistory, undoHistory, redoHistory } from '../lib/editorOps.js';

const B = (id) => ({ id, type: 'text', props: {}, show: { devices: ['mobile', 'tablet', 'desktop'], audience: 'all' }, style: {} });
const page = () => ({ meta: {}, zones: { before: [B('a'), B('b'), B('c')], after: [B('x')] } });
const ids = (c, z) => c.zones[z].map((b) => b.id).join('');

// Insertion
assert.equal(ids(insertBlock(page(), 'before', 1, B('n')), 'before'), 'anbc');
assert.equal(ids(insertBlock(page(), 'before', 99, B('n')), 'before'), 'abcn');
assert.equal(ids(insertBlock(page(), 'after', 0, B('n')), 'after'), 'nx');
assert.equal(insertBlock(page(), 'before', 0, B('n'), 3), null, 'zone pleine');
const p0 = page(); insertBlock(p0, 'before', 0, B('n')); assert.equal(ids(p0, 'before'), 'abc', 'le contenu d\'origine n\'est pas modifié');

// Suppression, recherche
assert.equal(ids(removeBlock(page(), 'b'), 'before'), 'ac');
assert.deepEqual({ ...findBlock(page(), 'x'), block: undefined }, { zone: 'after', index: 0, block: undefined });
assert.equal(findBlock(page(), 'zzz'), null);

// Déplacement : « avant le bloc n° i » (index avant retrait)
assert.equal(ids(moveBlock(page(), 'a', 'before', 3), 'before'), 'bca', 'a à la fin');
assert.equal(ids(moveBlock(page(), 'c', 'before', 0), 'before'), 'cab', 'c au début');
assert.equal(ids(moveBlock(page(), 'a', 'before', 2), 'before'), 'bac', 'a avant c');
assert.equal(ids(moveBlock(page(), 'b', 'before', 2), 'before'), 'abc', 'b juste avant c = ne bouge pas');
assert.equal(moveBlock(page(), 'b', 'before', 1) === undefined, false);
const m = moveBlock(page(), 'b', 'after', 0); assert.equal(ids(m, 'before'), 'ac'); assert.equal(ids(m, 'after'), 'bx', 'changement de zone');
assert.equal(moveBlock(page(), 'b', 'after', 0, 1), null, 'zone d\'arrivée pleine');

// Un cran
assert.equal(ids(nudgeBlock(page(), 'b', -1), 'before'), 'bac');
assert.equal(ids(nudgeBlock(page(), 'a', -1), 'before'), 'abc', 'déjà en haut');
assert.equal(ids(nudgeBlock(page(), 'c', 1), 'before'), 'abc', 'déjà en bas');

// Copie
const d = duplicateBlock(page(), 'b', 'b2'); assert.equal(ids(d.content, 'before'), 'abb2c'); assert.equal(d.id, 'b2');
assert.notEqual(d.content.zones.before[1], d.content.zones.before[2], 'copie profonde');
assert.equal(duplicateBlock(page(), 'b', 'b2', 3), null);

// Cible de dépôt
const rects = [{ id: 'a', zone: 'before', y: 100, h: 100 }, { id: 'b', zone: 'before', y: 200, h: 100 }, { id: 'x', zone: 'after', y: 500, h: 80 }];
const zones = [{ zone: 'before', y: 80, h: 240 }, { zone: 'after', y: 480, h: 120 }, { zone: 'empty', y: 700, h: 60 }];
assert.deepEqual(dropTarget(rects, zones, 110), { zone: 'before', index: 0, lineY: 100 });
assert.deepEqual(dropTarget(rects, zones, 160), { zone: 'before', index: 1, lineY: 200 });
assert.deepEqual(dropTarget(rects, zones, 290), { zone: 'before', index: 2, lineY: 300 });
assert.equal(dropTarget(rects, zones, 520).zone, 'after');
assert.equal(dropTarget(rects, zones, 705).zone, 'empty');
assert.equal(dropTarget(rects, zones, 705).index, 0);
assert.equal(dropTarget(rects, zones, 400).zone, 'before', 'entre deux zones : la plus proche');
assert.equal(dropTarget([], [], 10), null);

// Annuler / rétablir
let h = newHistory(); let cur = 'v0';
h = pushHistory(h, cur, null, 1000); cur = 'v1';
h = pushHistory(h, cur, null, 2000); cur = 'v2';
let u = undoHistory(h, cur); assert.equal(u.state, 'v1'); h = u.history; cur = u.state;
u = undoHistory(h, cur); assert.equal(u.state, 'v0'); h = u.history; cur = u.state;
assert.equal(undoHistory(h, cur), null, 'rien à annuler');
let r = redoHistory(h, cur); assert.equal(r.state, 'v1'); h = r.history; cur = r.state;
h = pushHistory(h, cur, null, 3000); cur = 'v3'; assert.equal(redoHistory(h, cur), null, 'une nouvelle modification efface le « rétablir »');
// Frappe au clavier : une seule étape
let k = newHistory(); let t = 'a';
k = pushHistory(k, t, 'champ', 1000); t = 'ab';
k = pushHistory(k, t, 'champ', 1300); t = 'abc';
k = pushHistory(k, t, 'champ', 1600); t = 'abcd';
assert.equal(k.past.length, 1, 'frappes rapprochées = une étape'); assert.equal(undoHistory(k, t).state, 'a');
k = pushHistory(k, t, 'champ', 5000); assert.equal(k.past.length, 2, 'pause = nouvelle étape');
assert.equal(newHistory(3).limit, 3);
let l = newHistory(3); for (let i = 0; i < 6; i++) l = pushHistory(l, 's' + i, null, i * 5000); assert.equal(l.past.length, 3, 'taille limitée');

// ---- Étape 3 : colonnes (zone « idBloc:n »)
{
  const C = { id: 'col1', type: 'columns', props: { count: '2' }, cols: [[B('x1')], [B('x2'), B('x3')]], show: {}, style: {} };
  const c0 = { meta: {}, zones: { main: [B('a'), C, B('b')] } };
  assert.ok(isColZone('col1:1') && !isColZone('main'));
  assert.deepEqual(getList(c0, 'col1:1').map((b) => b.id), ['x2', 'x3']);
  assert.deepEqual(findBlock(c0, 'x3'), { zone: 'col1:1', index: 1, block: c0.zones.main[1].cols[1][1] });
  // insertion dans une colonne
  const c1 = insertBlock(c0, 'col1:0', 1, B('n1'));
  assert.deepEqual(getList(c1, 'col1:0').map((b) => b.id), ['x1', 'n1']);
  assert.deepEqual(c0.zones.main[1].cols[0].map((b) => b.id), ['x1'], 'pas de modification en place');
  // colonnes dans colonnes : deux niveaux au plus (étape 6)
  const nest = insertBlock(c0, 'col1:0', 0, { ...C, id: 'col2', cols: [[], []] });
  assert.ok(nest, 'un second niveau de colonnes est accepté');
  assert.equal(zoneDepth(nest, 'col2:0'), 2, 'profondeur de la colonne imbriquée');
  assert.equal(insertBlock(nest, 'col2:0', 0, { ...C, id: 'col3', cols: [[], []] }), null, 'pas de troisième niveau');
  assert.equal(moveBlock(c0, 'col1', 'col1:0', 0), null, 'un bloc Colonnes ne va pas dans ses colonnes');
  assert.equal(moveBlock(nest, 'col1', 'col2:0', 0), null, 'ni dans les colonnes de ses colonnes');
  assert.equal(blockHeight(nest.zones.main[1]), 2, 'hauteur d\'un bloc Colonnes qui en contient un autre');
  assert.equal(canPlace(nest, nest.zones.main[1], 'col1:0'), false, 'un bloc de hauteur 2 ne se met pas dans une colonne');
  const dupN = duplicateBlock(nest, 'col1', 'copy', 20, (() => { let i = 0; return () => `n${i++}`; })());
  const idsN = JSON.stringify(dupN.content).match(/"id":"[^"]+"/g);
  assert.equal(new Set(idsN).size, idsN.length, 'copie profonde : identifiants tous uniques');
  assert.deepEqual(getList(nest, 'col2:1'), []);
  // déplacement page → colonne → page
  const c2 = moveBlock(c0, 'a', 'col1:1', 1);
  assert.deepEqual(getList(c2, 'col1:1').map((b) => b.id), ['x2', 'a', 'x3']);
  assert.deepEqual(c2.zones.main.map((b) => b.id), ['col1', 'b']);
  const c3 = moveBlock(c2, 'x1', 'main', 0);
  assert.deepEqual(c3.zones.main.map((b) => b.id), ['x1', 'col1', 'b']);
  assert.deepEqual(getList(c3, 'col1:0'), []);
  // monter / supprimer / dupliquer dans une colonne
  assert.deepEqual(getList(nudgeBlock(c0, 'x3', -1), 'col1:1').map((b) => b.id), ['x3', 'x2']);
  assert.deepEqual(getList(removeBlock(c0, 'x2'), 'col1:1').map((b) => b.id), ['x3']);
  const d = duplicateBlock(c0, 'col1', 'col9', 60);
  assert.equal(d.content.zones.main[2].id, 'col9');
  const ids = d.content.zones.main[2].cols.flat().map((b) => b.id);
  assert.ok(ids.every((i) => !['x1', 'x2', 'x3'].includes(i)) && new Set(ids).size === 3, 'copie : nouveaux identifiants');
  // cible de dépôt : la colonne sous le pointeur l'emporte sur la zone de la page
  const zones = [{ zone: 'main', x: 0, w: 1000, y: 0, h: 800 }, { zone: 'col1:0', x: 0, w: 500, y: 100, h: 300 }, { zone: 'col1:1', x: 500, w: 500, y: 100, h: 300 }];
  const rects = [{ id: 'x1', zone: 'col1:0', y: 100, h: 100 }, { id: 'x2', zone: 'col1:1', y: 100, h: 80 }, { id: 'x3', zone: 'col1:1', y: 180, h: 80 }];
  assert.deepEqual(dropTarget(rects, zones, 150, 700).zone, 'col1:1');
  assert.equal(dropTarget(rects, zones, 150, 700).index, 1);
  assert.equal(dropTarget(rects, zones, 700, 700).zone, 'main');
  assert.equal(dropTarget(rects, zones, 150, 700, false).zone, 'main', 'colonnes non proposées pour un bloc Colonnes');
}

console.log('OK éditeur : opérations sur les blocs, cible de dépôt, historique');
