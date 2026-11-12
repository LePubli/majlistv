// Audyn — « Continuer l'écoute » : règles (livres commencés, pas finis, les plus récents d'abord) et rangée de la page Audyn.
// node web/tests/test_audyn_continue_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { continueCandidates, listenState, CONTINUE_MAX } from '../lib/audyn.js';

const ch = [{ id: 'a', playable: true, durationSeconds: 600 }, { id: 'b', playable: true, durationSeconds: 1200 }, { id: 'c', playable: true, durationSeconds: 300 }];
assert.equal(listenState(ch, null), null);
assert.equal(listenState(ch, { cid: 'a', pos: 3, at: 1 }), null, 'à peine commencé : pas dans la rangée');
assert.deepEqual(listenState(ch, { cid: 'a', pos: 60, at: 1 }), { index: 0, count: 3, left: 2040, pct: 60 / 2100 });
const mid = listenState(ch, { cid: 'b', pos: 600, at: 1 });
assert.equal(mid.index, 1); assert.equal(mid.left, 900); assert.ok(Math.abs(mid.pct - 1200 / 2100) < 1e-9);
assert.ok(listenState(ch, { cid: 'b', pos: 1199, at: 1 }), 'fin d\'un chapitre qui n\'est pas le dernier : encore à continuer');
assert.equal(listenState(ch, { cid: 'c', pos: 280, at: 1 }), null, 'fin du dernier chapitre : fini');
assert.ok(listenState(ch, { cid: 'c', pos: 200, at: 1 }), 'dernier chapitre pas fini');
assert.equal(listenState(ch, { cid: 'zz', pos: 200, at: 1 }), null, 'chapitre disparu (redécoupé) : pas dans la rangée');
assert.equal(listenState([{ id: 'p', playable: false, durationSeconds: 100 }, ...ch], { cid: 'p', pos: 50, at: 1 }), null, 'chapitre non jouable');
assert.equal(listenState(ch, { cid: 'b', pos: 99999, at: 1 }).left, 300, 'position au-delà de la durée : bornée');

const items = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
const store = { 1: { cid: 'a', pos: 10, at: 100 }, 2: null, 3: { cid: 'a', pos: 10, at: 300 }, 4: { cid: 'a', pos: 10, at: 0 } };
assert.deepEqual(continueCandidates(items, (id) => store[id]).map((x) => x.item.id), ['3', '1'], 'plus récent d\'abord ; sans date ignoré');
assert.equal(continueCandidates(Array.from({ length: 20 }, (_, i) => ({ id: String(i) })), () => ({ cid: 'a', pos: 9, at: 5 })).length, CONTINUE_MAX);
assert.deepEqual(continueCandidates(null, () => null), []);

const web = fileURLToPath(new URL('..', import.meta.url));
const page = fs.readFileSync(join(web, 'app/audyn/page.js'), 'utf8');
assert.match(page, /const full = Boolean\(d && !d\.off && !q\.trim\(\) && !cat\)/, 'rangée seulement sur la liste complète');
assert.match(page, /continueCandidates\(d\.items, au\.savedFor\)/); assert.match(page, /listenState\(r\.data\.chapters, saved\)/);
assert.match(page, /await au\.openResume\(book\); router\.push\(`\/audyn\/\$\{book\.id\}`\)/, '« Reprendre » relance au bon endroit');
assert.match(page, /role="progressbar"/);
const i18n = fs.readFileSync(join(web, 'lib/i18n.js'), 'utf8');
for (const k of ['awContinue', 'awChapterOf', 'awLeft', 'awListenBar']) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, k);
console.log('OK — Audyn : continuer l\'écoute');
