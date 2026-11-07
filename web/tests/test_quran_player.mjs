// Récitation continue (site) : règles pures + câblage du lecteur global.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_RETRY, afterError, followingAya, nowPlayingTitle, retryDelay } from '../lib/quranQueue.js';
assert.equal(MAX_RETRY, 2);
assert.equal(afterError(0), 'retry'); assert.equal(afterError(1), 'retry'); assert.equal(afterError(2), 'fail');
assert.equal(retryDelay(0), 800); assert.equal(retryDelay(1), 1600);
assert.equal(followingAya([1, 2, 3], 2, true), 3); assert.equal(followingAya([1, 2, 3], 3, true), null); assert.equal(followingAya([1, 2, 3], 1, false), null);
assert.equal(nowPlayingTitle('Al-Kahf', 3, 'Verset'), 'Al-Kahf — Verset 3');
const prov = readFileSync(new URL('../components/Providers.js', import.meta.url), 'utf8');
assert.match(prov, /<QuranPlayerProvider t=\{t\}>.*\{children\}.*<\/QuranPlayerProvider>/, 'lecteur monté dans Providers (survit aux changements de page)');
const pl = readFileSync(new URL('../components/QuranPlayer.js', import.meta.url), 'utf8');
for (const k of ['mediaSession', "setActionHandler('pause'", "setActionHandler('nexttrack'", 'qpl-bar', "addEventListener('ended'"]) assert.ok(pl.includes(k), k);
const page = readFileSync(new URL('../app/coran/[n]/page.js', import.meta.url), 'utf8');
assert.ok(!/<audio/.test(page), 'la page ne possède plus de lecteur (il survit à la page)');
assert.match(page, /useQuranPlayer\(\)/);
assert.ok(!/useEffect\(\(\) => \(\) => \{ const a = audioRef/.test(page), "pas d'arrêt au démontage");
console.log('OK test_quran_player');
