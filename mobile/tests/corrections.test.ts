// Amélioration 4.1 : proposer une correction d'une phrase de la transcription.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSend, canSuggest, errorKey, keyOf } from '../src/lib/corrections';

test('canSuggest : membre connecté, fonction active, vidéo déverrouillée, jeton', () => {
  assert.equal(canSuggest({ loggedIn: true, featureOn: true, hasToken: true }), true);
  assert.equal(canSuggest({ loggedIn: false, featureOn: true, hasToken: true }), false);
  assert.equal(canSuggest({ loggedIn: true, featureOn: false, hasToken: true }), false);
  assert.equal(canSuggest({ loggedIn: true, featureOn: true, locked: true, hasToken: true }), false);
  assert.equal(canSuggest({ loggedIn: true, featureOn: true, hasToken: false }), false);
});
test('canSend : refuse vide et identique (espaces ignorés)', () => {
  assert.equal(canSend('Bonjour à tous', 'Bonjour  à   tous '), false);
  assert.equal(canSend('Bonjour', '   '), false);
  assert.equal(canSend('Bonjour', 'Bonsoir'), true);
});
test('errorKey : codes connus et repli', () => {
  assert.equal(errorKey('same'), 'corErrSame');
  assert.equal(errorKey('daily_limit'), 'corErrDaily');
  assert.equal(errorKey('already_pending'), 'corErrPending');
  assert.equal(errorKey('inconnu'), 'corErr');
  assert.equal(errorKey(undefined), 'corErr');
});
test('keyOf', () => { assert.equal(keyOf('fr', 3), 'fr:3'); });
