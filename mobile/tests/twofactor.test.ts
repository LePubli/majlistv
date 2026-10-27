// Étape 31 : connexion en deux temps dans l'application (lecture de la réponse du serveur, messages d'erreur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readLogin, verifyErrorKey } from '../src/lib/twoFactor';
import { DICT } from '../src/lib/i18n';

const user = { id: 'u1', email: 'a@b.c', name: 'A', role: 'user', locale: 'fr' } as never;

test('réponse avec jeton : session', () => {
  assert.deepEqual(readLogin({ token: 't', user }), { kind: 'session', token: 't', user });
});
test('réponse avec défi : étape du code', () => {
  assert.deepEqual(readLogin({ twoFactor: true, challenge: 'abc' }), { kind: 'challenge', challenge: 'abc' });
});
test('réponse inattendue : erreur (jamais une fausse connexion)', () => {
  assert.throws(() => readLogin({}));
  assert.throws(() => readLogin(null));
  assert.throws(() => readLogin({ twoFactor: true }));
  assert.throws(() => readLogin({ token: 't' }));
});
test('erreurs de vérification', () => {
  assert.deepEqual(verifyErrorKey(401, 'bad_code'), { key: 'auth.2fa.bad', expired: false });
  assert.deepEqual(verifyErrorKey(401, 'challenge_expired'), { key: 'auth.2fa.expired', expired: true });
  assert.deepEqual(verifyErrorKey(429, 'locked'), { key: 'auth.2fa.locked', expired: true });
  assert.deepEqual(verifyErrorKey(429), { key: 'auth.2fa.locked', expired: true });
  assert.deepEqual(verifyErrorKey(0), { key: 'auth.network', expired: false });
  assert.deepEqual(verifyErrorKey(403), { key: 'auth.suspended', expired: true });
});
test('textes présents en français, anglais et arabe', () => {
  for (const l of ['fr', 'en', 'ar'] as const) {
    for (const k of ['auth.2fa.title', 'auth.2fa.help', 'auth.2fa.code', 'auth.2fa.verify', 'auth.2fa.back', 'auth.2fa.bad', 'auth.2fa.expired', 'auth.2fa.locked'] as const) {
      assert.ok(DICT[l][k] && DICT[l][k].length > 3, `${l} ${k}`);
    }
  }
});
