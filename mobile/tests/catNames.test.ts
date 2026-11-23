import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeCatNames } from '../src/lib/catNames';
import { createApi } from '../src/lib/api';

const card = () => ({ id: 1, category: 'Le Coran › Tajwid', categoryTr: { en: 'The Quran › Tajwid', ar: 'القرآن › التجويد' } });

test('noms de catégories : langue de l’utilisateur, repli sur le français', () => {
  assert.equal(localizeCatNames(card(), 'en', '/talks').category, 'The Quran › Tajwid');
  assert.equal(localizeCatNames(card(), 'ar', '/talks').category, 'القرآن › التجويد');
  assert.equal(localizeCatNames(card(), 'fr', '/talks').category, 'Le Coran › Tajwid');
  assert.equal(localizeCatNames({ category: 'Seul', categoryTr: { en: ' ' } }, 'en', '/talks').category, 'Seul');
  assert.equal(localizeCatNames({ category: 'Seul' }, 'en', '/talks').category, 'Seul');
  const home = { rows: [{ items: [card()] }], hero: card() };
  localizeCatNames(home, 'en', '/home');
  assert.ok(home.rows[0].items[0].category.startsWith('The Quran') && home.hero.category.startsWith('The Quran'));
  assert.equal(localizeCatNames(card(), 'en', '/admin/x').category, 'Le Coran › Tajwid');
});

test('le client d’API applique la langue courante', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify([card()]), { status: 200 })) as unknown as typeof fetch;
  let loc = 'en';
  const api = createApi({ baseUrl: 'http://x', getToken: () => null, getLocale: () => loc, fetchImpl });
  assert.equal((await api.get<any[]>('/talks'))[0].category, 'The Quran › Tajwid');
  loc = 'fr';
  assert.equal((await api.get<any[]>('/talks'))[0].category, 'Le Coran › Tajwid');
});
