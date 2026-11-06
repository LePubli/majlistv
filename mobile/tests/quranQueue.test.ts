// Récitation continue : nouvelles tentatives, enchaînement, titre de la notification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RETRY, afterError, followingAya, nowPlayingTitle, retryDelay } from '../src/lib/quranQueue';

test('afterError : on retente deux fois puis on abandonne', () => {
  assert.equal(MAX_RETRY, 2);
  assert.equal(afterError(0), 'retry');
  assert.equal(afterError(1), 'retry');
  assert.equal(afterError(2), 'fail');
});
test('retryDelay : attente croissante', () => {
  assert.equal(retryDelay(0), 800);
  assert.equal(retryDelay(1), 1600);
});
test('followingAya : enchaîne dans la sourate, s’arrête à la fin ou sans enchaînement', () => {
  assert.equal(followingAya([1, 2, 3], 2, true), 3);
  assert.equal(followingAya([1, 2, 3], 3, true), null);
  assert.equal(followingAya([1, 2, 3], 1, false), null);
});
test('nowPlayingTitle', () => {
  assert.equal(nowPlayingTitle('Al-Kahf', 3, 'Verset'), 'Al-Kahf — Verset 3');
});
