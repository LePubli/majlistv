// Références citées (application) : affichage conditionnel, crédit, texte absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditLine, hasNoText, showReferences } from '../src/lib/references';

test('showReferences : fonction activée, vidéo déverrouillée, au moins une référence validée', () => {
  assert.equal(showReferences({ references: { available: true } }, true), true);
  assert.equal(showReferences({ references: { available: false } }, true), false);
  assert.equal(showReferences({}, true), false, 'ancienne API sans le champ : rien');
  assert.equal(showReferences({ locked: true, references: { available: true } }, true), false, 'vidéo verrouillée : rien');
  assert.equal(showReferences({ references: { available: true } }, false), false, 'fonction coupée : rien');
});
test('creditLine : traduction puis degré, sans trou', () => {
  const g = (x: string) => `Degré : ${x}`;
  assert.equal(creditLine({ credit: 'Hamidullah', grade: '' }, g), 'Hamidullah');
  assert.equal(creditLine({ credit: 'Sahih al-Boukhari', grade: 'Sahih' }, g), 'Sahih al-Boukhari · Degré : Sahih');
  assert.equal(creditLine({ credit: '', grade: '' }, g), '');
});
test('hasNoText : source dite sans texte = on le dit ; hadith sans source = pas ce message', () => {
  assert.equal(hasNoText({ ar: '', fr: '', unidentified: false }), true);
  assert.equal(hasNoText({ ar: '', fr: '', unidentified: true }), false);
  assert.equal(hasNoText({ ar: 'x', fr: '' }), false);
});
