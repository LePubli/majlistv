// Collections dans l'application (25/11) : rangée d'accueil, accès Catalogue, écrans immersifs, application TV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WEB } from '../src/lib/webTexts';
import { totalTime } from '../src/lib/media';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

test('textes des collections dans les 3 langues', () => {
  for (const l of ['fr', 'en', 'ar'] as const) {
    for (const k of ['colNav', 'colKind_cycle', 'colKind_speaker', 'colKind_theme', 'colPinned', 'colNone', 'pmColVideos', 'pmColVideo', 'pmColPlayAll', 'pmColIn', 'pmColMore', 'pmColsOpen', 'pmColsPl_cycle', 'pmColsPl_speaker', 'pmColsPl_theme']) {
      assert.ok((WEB[l] as Record<string, string>)[k], `${l} ${k}`);
    }
  }
});

test('durée totale : minutes ou heures', () => {
  assert.equal(totalTime([], 'min'), '');
  assert.equal(totalTime([{ durationSeconds: 600 }, { durationSeconds: 1800 }], 'min'), '40 min');
  assert.equal(totalTime([{ durationSeconds: 3600 }, { durationSeconds: 900 }], 'min'), '1 h 15');
  assert.equal(totalTime([{ durationSeconds: null }, {}], 'min'), '');
});

test('téléphone : rangée d\'accueil, accès Catalogue, écrans immersifs', () => {
  const home = read('src/app/(tabs)/index.tsx');
  assert.match(home, /feat\('collections'\)/, 'rangée seulement si la fonction est activée');
  assert.match(home, /<HomeSpot c=/, 'sélections en grand cadre comme le site');
  assert.match(home, /\/collections\/home/, 'mêmes collections que le site');
  assert.match(read('src/app/(tabs)/talks.tsx'), /router\.push\('\/collections'\)/, 'accès depuis le Catalogue');
  const list = read('src/app/collections/index.tsx');
  assert.match(list, /ImmersiveHero/); assert.match(list, /kindPlural/); assert.match(list, /featured/);
  const det = read('src/app/collections/[id].tsx');
  assert.match(det, /ImmersiveHero/); assert.match(det, /pmColPlayAll/); assert.match(det, /numbered/);
  assert.match(read('src/components/ImmersiveHero.tsx'), /accessibilityRole|IconButton/, 'bouton retour');
});

test('télé : menu, accueil, liste et détail', () => {
  assert.match(read('src/components/tv/TvShell.tsx'), /href: '\/tv\/collections'.*feat\('collections'\)/, 'entrée de menu liée à la fonction');
  assert.match(read('src/app/tv/index.tsx'), /<TvCollectionRow title=\{t\('colNav'\)\}/);
  for (const f of ['src/app/tv/collections/index.tsx', 'src/app/tv/collections/[id].tsx', 'src/components/tv/TvCollectionCard.tsx']) assert.ok(existsSync(join(__dirname, '..', f)), f);
  const card = read('src/components/tv/TvCollectionCard.tsx');
  assert.match(card, /<Focusable/, 'focus télécommande'); assert.match(card, /pathname: '\/tv\/collections\/\[id\]'/);
  assert.match(read('src/app/tv/collections/[id].tsx'), /first label=\{t\('pmColPlayAll'\)\}/, 'focus initial sur Commencer');
});
