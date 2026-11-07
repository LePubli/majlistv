// Audyn (étape 3) : logique du lecteur du site + branchements. node tests/test_audyn_player.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../lib/audyn.js';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ch = (id, playable = true, d = 600) => ({ id, title: id, durationSeconds: d, playable });

assert.equal(A.fmtClock(125), '2:05'); assert.equal(A.fmtClock(3725), '1:02:05'); assert.equal(A.fmtClock(NaN), '0:00');
assert.equal(A.fmtLong(5400), '1 h 30'); assert.equal(A.fmtLong(1500), '25 min'); assert.equal(A.fmtLong(7200), '2 h');
assert.deepEqual(A.decodeResume(A.encodeResume({ cid: 'c', pos: 12.4, at: 3 })), { cid: 'c', pos: 12, at: 3 });
for (const bad of [null, '', 'x', '{}', '[1,2]', '["a",-1]']) assert.equal(A.decodeResume(bad), null);
const list = [ch('a'), ch('b'), ch('c', false)];
assert.deepEqual(A.resumePoint(list, null), { index: 0, pos: 0 });
assert.deepEqual(A.resumePoint(list, { cid: 'b', pos: 100 }), { index: 1, pos: 97 });
assert.deepEqual(A.resumePoint(list, { cid: 'b', pos: 3 }), { index: 1, pos: 0 });
assert.deepEqual(A.resumePoint(list, { cid: 'b', pos: 597 }), { index: 1, pos: 0 });
assert.deepEqual(A.resumePoint(list, { cid: 'c', pos: 100 }), { index: 0, pos: 0 });
assert.deepEqual(A.resumePoint(list, { cid: 'zzz', pos: 100 }), { index: 0, pos: 0 });
assert.equal(A.nextPlayable(list, 1), -1); assert.equal(A.prevPlayable(list, 1), 0);
const t0 = 1e6, tm = A.startSleep(10, t0);
assert.equal(tm.endAt, t0 + 600000); assert.equal(A.sleepTick(tm, t0 + 570000, 1).volume, 1);
assert.ok(Math.abs(A.sleepTick(tm, t0 + 585000, 1).volume - 0.5) < 1e-9);
assert.equal(A.sleepTick(tm, t0 + 600000, 1).stop, true);
assert.deepEqual(A.startSleep(0, 0), { endAt: null, endOfChapter: true });
assert.ok(A.sleepTick({ endAt: null, endOfChapter: true }, 0, 4).volume < 1);
assert.deepEqual(A.startSleep(-1, 0), A.NO_TIMER);
assert.equal(A.nextSpeed(2), 0.8); assert.equal(A.seekTarget(95, 15, 100), 100); assert.equal(A.seekTarget(5, -15, 100), 0);

// Branchements
const prov = r('../components/Providers.js'); assert.match(prov, /<AudynPlayerProvider t=\{t\} call=\{call\}>/);
const pl = r('../components/AudynPlayer.js');
for (const re of [/mediaSession/, /setActionHandler\('seekforward'/, /setActionHandler\('nexttrack'/, /quran\.stop\(\)/, /sleepTick/, /URL_LIFETIME_MS/, /localStorage/, /createObjectURL/]) assert.match(pl, re);
assert.match(r('../components/MemberShell.js'), /audyn: \{ key: 'audyn', href: '\/audyn'/);
assert.equal(r('../lib/navcfg.js'), readFileSync(new URL('../../api/src/navcfg.js', import.meta.url), 'utf8'), 'navcfg identique côté API et site');
assert.match(r('../lib/navcfg.js'), /\['audyn', 'Audyn'\]/);

// Textes aw* présents en fr / en / ar
const i18n = r('../lib/i18n.js'); const keys = new Set();
for (const f of ['../components/AudynPlayer.js', '../components/AudynControls.js', '../app/audyn/page.js', '../app/audyn/[id]/page.js']) for (const m of r(f).matchAll(/\bt\('(aw[A-Za-z0-9]+)'\)/g)) keys.add(m[1]);
keys.add('awNav');
assert.ok(keys.size >= 30, `${keys.size} textes`);
for (const k of keys) assert.equal(i18n.split(` ${k}:`).length - 1, 3, `texte ${k} manquant en fr / en / ar`);
// Histoires du soir (étape 4)
for (const re of [/b\.kids \? '\/kids\/stories' : '\/audyn'/, /\/kids\/stories\/ping/, /book\.kids && book\.autoStopMin/, /resumeId/, /\/kids\/histoires\//]) assert.match(pl, re);
const ctl = r('../components/AudynControls.js');
assert.match(ctl, /!kids \|\| au\.book\.timerAllowed/); assert.doesNotMatch(r('../app/(module-kids)/kids/histoires/[id]/page.js') + r('../app/(module-kids)/kids/histoires/page.js'), /pricing/);
assert.match(ctl, /awkPreviewEnded/);
assert.match(r('../components/KidsControls.js'), /\/stories`/); assert.match(r('../components/KidsHome.js'), /\/kids\/histoires/);
for (const f of ['../app/(module-kids)/kids/histoires/page.js', '../app/(module-kids)/kids/histoires/[id]/page.js', '../components/KidsControls.js', '../components/KidsHome.js', '../components/AudynControls.js'])
  for (const m of r(f).matchAll(/\bt\('(awk[A-Za-z0-9]+)'\)/g)) assert.equal(i18n.split(` ${m[1]}:`).length - 1, 3, `texte ${m[1]} manquant en fr / en / ar`);
console.log('OK test_audyn_player');
