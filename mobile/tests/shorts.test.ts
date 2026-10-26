// Shorts de l'application (étape 24b) : liste lisible, pages sans doublon, reste-t-il des shorts, progression.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMore, mergeShorts, playableList, shortRatio } from '../src/lib/shorts';
import type { Short } from '../src/lib/types';

const mk = (id: string, videoUrl: string | null = 'https://s3/x.mp4'): Short => ({
  id, title: 'T' + id, duration: 40, views: 0, publishedAt: '2026-10-26', videoUrl, posterUrl: null, talk: { id: 't' + id, title: 'Conf', premium: false }, channel: null,
});

test('playableList : écarte ce qui n’est pas lisible, sans planter sur un contenu inattendu', () => {
  assert.deepEqual(playableList([mk('a'), mk('b', null), mk('c', '')]).map((s) => s.id), ['a']);
  assert.deepEqual(playableList(null), []);
  assert.deepEqual(playableList({ error: 'x' }), []);
  assert.deepEqual(playableList([null, 3, { id: 'z', videoUrl: 'u' }]), []); // sans conférence : écarté
});

test('mergeShorts : la page suivante s’ajoute sans doublon, l’ordre est gardé', () => {
  const out = mergeShorts([mk('a'), mk('b')], [mk('b'), mk('c')]);
  assert.deepEqual(out.map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(mergeShorts([], [mk('a')]).map((s) => s.id), ['a']);
});

test('hasMore : une page pleine annonce une suite', () => {
  assert.equal(hasMore(12, 12), true);
  assert.equal(hasMore(11, 12), false);
  assert.equal(hasMore(0, 12), false);
});

test('shortRatio : bornée entre 0 et 1', () => {
  assert.equal(shortRatio(10, 40), 0.25);
  assert.equal(shortRatio(50, 40), 1);
  assert.equal(shortRatio(-3, 40), 0);
  assert.equal(shortRatio(5, 0), 0);
  assert.equal(shortRatio(NaN, 40), 0);
});
