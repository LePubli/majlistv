// Étape 6b : fiche vidéo en blocs (sections « Fiche : … »)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanContent, watchTemplate, WATCH_TYPES, ZONES, BLOCK_TYPES, TYPE_ORDER } from '../lib/blocks.js';

assert.deepEqual(WATCH_TYPES, ['w_stage', 'w_notices', 'w_grid', 'w_next', 'w_books']);
assert.deepEqual(ZONES.watch, ['main']);
for (const t of WATCH_TYPES) { assert.ok(BLOCK_TYPES[t], t); assert.ok(TYPE_ORDER.includes(t), `${t} dans la palette`); }
const tpl = watchTemplate();
assert.deepEqual(tpl.zones.main.map((b) => b.type), WATCH_TYPES, 'modèle : 5 sections dans l’ordre d’origine');
const ok = cleanContent(tpl, 'watch');
assert.equal(Object.keys(ok.errors).length, 0, 'le modèle est valide');
const bad = cleanContent(tpl, 'custom');
assert.ok(Object.keys(bad.errors).length, 'sections de la fiche refusées sur une page libre');
const g = structuredClone(tpl); g.zones.main[2].props = { side: 'left' }; g.zones.main[3].props = { max: 4 };
assert.equal(Object.keys(cleanContent(g, 'watch').errors).length, 0, 'parcours à gauche, 4 vidéos');
g.zones.main[2].props = { side: 'haut' };
assert.ok(Object.keys(cleanContent(g, 'watch').errors).length, 'place inconnue refusée');

const tc = fs.readFileSync(new URL('../app/talks/[id]/TalkClient.js', import.meta.url), 'utf8');
for (const k of ['w_stage', 'w_notices', 'w_grid', 'w_next', 'w_books', "/pages/view?path=%2F_watch", 'WatchCtx.Provider', "side !== 'hidden'", 'watch-blocks']) assert.ok(tc.includes(k), k);
// la fiche d'origine garde les mêmes sections, dans le même ordre
const i = (k) => tc.lastIndexOf(k);
assert.ok(i('{stageSec}') < i('{noticesSec}') && i('{noticesSec}') < i('{gridSec()}') && i('{gridSec()}') < i('{extra}') && i('{extra}') < i('{nextSec(pm ? 3 : 8)}') && i('{nextSec(pm ? 3 : 8)}') < i('{booksSec}'), 'ordre d’origine conservé');
const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
for (const c of ['.wb-side-left', '.wb-side-below', '.wb-side-hidden', '.pb-placeholder']) assert.ok(css.includes(c), c);
const ed = fs.readFileSync(new URL('../components/editor/SiteEditor.js', import.meta.url), 'utf8');
assert.ok(ed.includes("create({ kind: 'watch' })") && ed.includes("pageKind === 'watch'"), 'éditeur : création et palette de la fiche vidéo');
console.log('OK étape 6b : fiche vidéo en blocs');
