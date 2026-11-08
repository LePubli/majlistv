// Amélioration 7.2 (étape 3) : tests A/B dans l'application — règles pures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VISITOR_RE, newVisitorId, pickExperiment, validVisitor, variantText } from '../src/lib/experiments';
import { DICT } from '../src/lib/i18n';

test('identifiant de visiteur : aléatoire, valide pour le serveur, jamais deux fois le même', () => {
  const a = newVisitorId(); const b = newVisitorId();
  assert.match(a, VISITOR_RE); assert.notEqual(a, b);
  assert.equal(validVisitor(a), a);
  assert.equal(validVisitor('court'), null); assert.equal(validVisitor(null), null); assert.equal(validVisitor('x'.repeat(65)), null);
});

test('test en cours pour la zone, sinon rien', () => {
  const list = [{ id: '1', zone: 'pricing', variant: 'B' }, { id: '2', zone: 'mobile_register', variant: 'B' }];
  assert.equal(pickExperiment(list, 'mobile_register')?.id, '2');
  assert.equal(pickExperiment(list, 'autre'), null);
  assert.equal(pickExperiment(null, 'x'), null); assert.equal(pickExperiment(undefined, 'x'), null);
});

test('texte de la variante dans la langue de l\'appli, sinon l\'original', () => {
  const exp = { id: '2', zone: 'mobile_register', variant: 'B', texts: { fr: { 'auth.register': 'Rejoindre' }, en: { 'auth.register': '' } } };
  assert.equal(variantText(exp, 'fr', 'auth.register', 'Créer un compte'), 'Rejoindre');
  assert.equal(variantText(exp, 'en', 'auth.register', 'Create an account'), 'Create an account', 'vide = original');
  assert.equal(variantText(exp, 'ar', 'auth.register', 'x'), 'x');
  assert.equal(variantText(null, 'fr', 'auth.register', 'Créer un compte'), 'Créer un compte');
});

test('les clés testables existent dans les trois langues (accroche vide par défaut)', () => {
  for (const l of ['fr', 'en', 'ar'] as const) {
    for (const k of ['auth.register', 'auth.toRegister', 'auth.pitch'] as const) assert.equal(typeof DICT[l][k], 'string', `${l} ${k}`);
    assert.equal(DICT[l]['auth.pitch'], '');
  }
});
