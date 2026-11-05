// Amélioration 4.1 : règles pures des corrections (sans base).  node tests/test_corrections_lib.mjs
import assert from 'node:assert/strict';
import { normalizeText, cleanSuggestion, wordDiff } from '../src/modules/corrections/lib.js';

assert.equal(normalizeText('  a \n\t b​  '), 'a b');
assert.equal(normalizeText(null), '');
assert.deepEqual(cleanSuggestion('Bonjour', 'Bonjour  '), { error: 'La correction est identique à la phrase actuelle', code: 'same' });
assert.equal(cleanSuggestion('Bonjour', '').code, 'empty');
assert.equal(cleanSuggestion('Bonjour', '   \n ').code, 'empty');
assert.deepEqual(cleanSuggestion('Bonjour à tous', ' Bonjour   à toutes\net tous '), { text: 'Bonjour à toutes et tous' });
assert.equal(cleanSuggestion('Salut', 'a'.repeat(300)).code, 'too_long');
assert.equal(cleanSuggestion('Salut', 'Voir www.example.com').code, 'link');
assert.equal(cleanSuggestion('Salut', 'Voir HTTPS://x.y').code, 'link');
assert.equal(cleanSuggestion('Voir www.example.com', 'Voir www.example.org').text, 'Voir www.example.org'); // le lien existait déjà
assert.equal(cleanSuggestion('أهلا', 'أهلًا وسهلًا').text, 'أهلًا وسهلًا');                                // arabe accepté

const kinds = (a, b) => wordDiff(a, b).map((w) => `${w.kind[0]}:${w.t}`).join(' ');
assert.equal(kinds('le prophete a dit', 'le prophète a dit'), 's:le d:prophete a:prophète s:a s:dit');
assert.equal(kinds('a b c', 'a b c'), 's:a s:b s:c');
assert.equal(kinds('a b', 'a b c'), 's:a s:b a:c');
assert.equal(kinds('', 'x'), 'a:x');
assert.equal(wordDiff('x '.repeat(600), 'y '.repeat(600)).length, 1200); // phrase démesurée : diff grossier, sans calcul coûteux
console.log('OK   test_corrections_lib : 17 contrôles');
