// Images des catégories (Explorer) : adresse relative au site → adresse utilisable par l'appli ; textes Explorer présents en 3 langues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catImageUrl, catFallback } from '../src/lib/catImage';
const API_URL = 'https://api.test', SITE_URL = 'https://site.test';
import { DICT } from '../src/lib/i18n';

test('catImageUrl', () => {
  assert.equal(catImageUrl(null, API_URL, SITE_URL), null);
  assert.equal(catImageUrl('', API_URL, SITE_URL), null);
  assert.equal(catImageUrl('https://x.test/a.jpg', API_URL, SITE_URL), 'https://x.test/a.jpg');
  assert.equal(catImageUrl('/api/catalogue/category-image/12/image?v=5', API_URL, SITE_URL), `${API_URL}/catalogue/category-image/12/image?v=5`);
  assert.equal(catImageUrl('/premium/coran-large.webp', API_URL, SITE_URL), `${SITE_URL}/premium/coran-large.webp`);
  assert.equal(catImageUrl('relatif.jpg', API_URL, SITE_URL), null);
});

test('dégradé de secours stable', () => {
  assert.deepEqual(catFallback(7), catFallback(7));
  assert.equal(catFallback(3).length, 2);
});

test('Explorer : textes en fr / en / ar et branchement des écrans', () => {
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['navExplorer', 'ex.count', 'ex.back', 'tv.backExplore', 'tv.catalog']) assert.ok((DICT[l] as Record<string, string>)[k], `${k} (${l})`);
  const tabs = readFileSync(new URL('../src/app/(tabs)/talks.tsx', import.meta.url), 'utf8');
  assert.match(tabs, /<ExploreTiles onPick=/);
  assert.match(tabs, /navExplorer/);
  assert.match(readFileSync(new URL('../src/app/(tabs)/_layout.tsx', import.meta.url), 'utf8'), /navExplorer/);
  const tv = readFileSync(new URL('../src/app/tv/catalog.tsx', import.meta.url), 'utf8');
  assert.match(tv, /\/catalogue\/categories/);
  assert.match(tv, /tv\.backExplore/);
});
