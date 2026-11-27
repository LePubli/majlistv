// Réorganisation des vidéos (collections) : déplacement d'une ligne et tri « naturel » des titres.
import { moveItem, byTitle } from '../lib/sortOrder.js';
import assert from 'node:assert/strict';
const ids = (a) => a.map((x) => x.id).join('');
const L = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
assert.equal(ids(moveItem(L, 3, 0)), 'dabc');
assert.equal(ids(moveItem(L, 0, 2)), 'bcad');
assert.equal(ids(moveItem(L, 1, 99)), 'acdb');
assert.equal(ids(moveItem(L, 9, 0)), 'abcd');
assert.equal(ids(L), 'abcd', 'le tableau d\'origine n\'est pas modifié');
const T = ['Omar – Épisode 10', 'Omar – Épisode 2', 'Omar – Épisode 1', 'Omar – Épisode 21'].map((title) => ({ title })).sort(byTitle).map((x) => x.title);
assert.deepEqual(T, ['Omar – Épisode 1', 'Omar – Épisode 2', 'Omar – Épisode 10', 'Omar – Épisode 21']);
console.log('OK : test_sortable');
