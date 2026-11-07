import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtClock, fmtLong, resumeKey, encodeResume, decodeResume, resumePoint, nextPlayable, prevPlayable,
  startSleep, fadeVolume, audynBase, audynResumeId, canSetTimer, STORY_PING_MS, sleepTick, nextSpeed, seekTarget, shouldSaveResume, NO_TIMER, type AudynChapter,
} from '../src/lib/audyn';

const ch = (id: string, playable = true, d = 600): AudynChapter => ({ id, title: id, durationSeconds: d, playable });

test('formats de durée', () => {
  assert.equal(fmtClock(125), '2:05'); assert.equal(fmtClock(3725), '1:02:05'); assert.equal(fmtClock(-4), '0:00'); assert.equal(fmtClock(NaN), '0:00');
  assert.equal(fmtLong(5400), '1 h 30'); assert.equal(fmtLong(1500), '25 min'); assert.equal(fmtLong(7200), '2 h'); assert.equal(fmtLong(0), '0 min');
});

test('reprise : codage et décodage robustes', () => {
  const r = { cid: 'c1', pos: 123.6, at: 5 };
  assert.deepEqual(decodeResume(encodeResume(r)), { cid: 'c1', pos: 124, at: 5 });
  for (const bad of [null, undefined, '', 'x', '{}', '[1,2]', '["a",-1,0]', '["a","b"]']) assert.equal(decodeResume(bad as never), null);
  assert.match(resumeKey('a/b c'), /^audyn\.pos\.a_b_c$/);
});

test('reprise : point de reprise', () => {
  const list = [ch('a'), ch('b'), ch('c', false)];
  assert.deepEqual(resumePoint(list, null), { index: 0, pos: 0 });
  assert.deepEqual(resumePoint(list, { cid: 'b', pos: 100, at: 0 }), { index: 1, pos: 97 });
  assert.deepEqual(resumePoint(list, { cid: 'b', pos: 3, at: 0 }), { index: 1, pos: 0 });           // début : reste au début
  assert.deepEqual(resumePoint(list, { cid: 'b', pos: 597, at: 0 }), { index: 1, pos: 0 });         // quasi fini : repart du début
  assert.deepEqual(resumePoint(list, { cid: 'c', pos: 100, at: 0 }), { index: 0, pos: 0 });         // chapitre non jouable (aperçu)
  assert.deepEqual(resumePoint(list, { cid: 'zzz', pos: 100, at: 0 }), { index: 0, pos: 0 });        // chapitre supprimé
  assert.deepEqual(resumePoint([ch('a', false), ch('b')], null), { index: 1, pos: 0 });             // premier jouable
});

test('chapitre suivant / précédent jouable', () => {
  const list = [ch('a'), ch('b', false), ch('c')];
  assert.equal(nextPlayable(list, 0), 2); assert.equal(nextPlayable(list, 2), -1);
  assert.equal(prevPlayable(list, 2), 0); assert.equal(prevPlayable(list, 0), -1);
});

test('minuteur : durée fixe, fondu de 30 s puis arrêt', () => {
  const t0 = 1_000_000;
  const tm = startSleep(10, t0);
  assert.equal(tm.endAt, t0 + 600000);
  assert.deepEqual(sleepTick(tm, t0, 300), { volume: 1, stop: false, remainingMs: 600000 });
  assert.equal(sleepTick(tm, t0 + 570000, 300).volume, 1);             // 30 s restantes : début du fondu
  const mid = sleepTick(tm, t0 + 585000, 300);                         // 15 s restantes
  assert.ok(Math.abs(mid.volume - 0.5) < 1e-9 && !mid.stop);
  const end = sleepTick(tm, t0 + 600000, 300);
  assert.equal(end.volume, 0); assert.equal(end.stop, true);
  assert.equal(sleepTick(tm, t0 + 700000, 300).stop, true);            // dépassé : coupe quand même
});

test('minuteur : fin du chapitre et absence de minuteur', () => {
  const tm = startSleep(0, 0);
  assert.deepEqual(tm, { endAt: null, endOfChapter: true });
  assert.equal(sleepTick(tm, 0, 120).volume, 1);
  assert.ok(sleepTick(tm, 0, 4).volume < 1 && sleepTick(tm, 0, 4).volume > 0);
  assert.equal(sleepTick(tm, 0, null).volume, 1);
  assert.deepEqual(sleepTick(NO_TIMER, 0, 10), { volume: 1, stop: false, remainingMs: null });
  assert.deepEqual(startSleep(-5, 0), NO_TIMER); assert.deepEqual(startSleep(NaN, 0), NO_TIMER);
});

test('fondu : bornes', () => {
  assert.equal(fadeVolume(0), 0); assert.equal(fadeVolume(-5), 0); assert.equal(fadeVolume(1e9), 1); assert.equal(fadeVolume(NaN), 1);
});

test('vitesse, saut et fréquence d\'enregistrement', () => {
  assert.equal(nextSpeed(1), 1.25); assert.equal(nextSpeed(2), 0.8); assert.equal(nextSpeed(3), 0.8);
  assert.equal(seekTarget(10, -15, 100), 0); assert.equal(seekTarget(95, 15, 100), 100); assert.equal(seekTarget(50, 15, 0), 65);
  assert.equal(shouldSaveResume(0, 5), false); assert.equal(shouldSaveResume(0, 10), true); assert.equal(shouldSaveResume(NaN, 1), true);
});

test('histoires du soir : adresses, reprise propre à l\'enfant, minuteur selon l\'autorisation du parent', () => {
  assert.equal(audynBase({}), '/audyn'); assert.equal(audynBase({ kids: true }), '/kids/stories');
  assert.equal(audynResumeId({ id: 'b1' }), 'b1'); assert.equal(audynResumeId({ id: 'b1', resumeId: 'kid-p1-b1' }), 'kid-p1-b1');
  assert.notEqual(resumeKey(audynResumeId({ id: 'b1', resumeId: 'kid-p1-b1' })), resumeKey(audynResumeId({ id: 'b1', resumeId: 'kid-p2-b1' }))); // deux enfants, deux reprises
  assert.equal(canSetTimer({}), true);                                   // adulte : toujours
  assert.equal(canSetTimer({ kids: true }), false);                      // enfant : interdit par défaut
  assert.equal(canSetTimer({ kids: true, timerAllowed: true }), true);   // enfant : si le parent l'accorde
  assert.equal(STORY_PING_MS, 30000);
});
