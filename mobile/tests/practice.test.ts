// Navigation de novembre 2026 (lot G) — onglet « Pratique » : cartes selon les fonctions, mêmes cinq onglets que le site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { practiceCards, practiceOn } from '../src/lib/practice';
import { SCREENS } from '../src/lib/menus';
import { DICT } from '../src/lib/i18n';

test('cartes de Pratique : selon les fonctions et la connexion', () => {
  assert.deepEqual(practiceCards(() => true, true).map((c) => c.key), ['prayer', 'quran', 'athkar', 'ramadan']);
  assert.deepEqual(practiceCards(() => true, false).map((c) => c.key), ['prayer', 'quran', 'ramadan'], 'adhkar : compte nécessaire');
  assert.deepEqual(practiceCards((id) => id === 'quran', true).map((c) => c.pathname), ['/quran']);
  assert.deepEqual(practiceCards(() => false, true), []);
  assert.equal(practiceOn(() => false), false);
  assert.equal(practiceOn((id) => id === 'ramadan'), true);
  for (const c of practiceCards(() => true, true)) assert.ok(!('feat' in c) && !('member' in c), 'aucun champ interne ne sort');
});

test('textes de Pratique dans les trois langues', () => {
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['pqHub', 'pqHubIntro', 'pqHubPrayerTx', 'pqHubQuranTx', 'pqHubAthkarTx', 'pqHubRamadanTx', 'pqNav', 'qrNav', 'atTab', 'rzNav'] as const) assert.ok((DICT[l] as Record<string, string>)[k], `${k} (${l})`);
});

test('barre du bas : Accueil, Catalogue, Apprendre, Pratique, Mon compte ; bibliothèque hors de la barre (13/11)', () => {
  const src = readFileSync(new URL('../src/app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  // Hors de la barre = sans bouton (tabBarButton: () => null) ; « href: null » ne doit plus servir (redirection vers l'accueil, 13/11).
  const names = [...src.matchAll(/<Tabs\.Screen name="(\w+)" options=\{\{([^\n]*)\}\} \/>/g)].map((m) => [m[1], /tabBarButton: \(\) => null/.test(m[2])] as const);
  assert.deepEqual(names.map((n) => n[0]), ['index', 'talks', 'learn', 'practice', 'library', 'account']);
  assert.deepEqual(names.filter((n) => n[1]).map((n) => n[0]), ['library'], 'seule la bibliothèque est hors de la barre (menu ☰)');
  assert.equal(SCREENS.practice.pathname, '/practice', 'écran « Pratique » proposé dans Admin → Menus');
});
