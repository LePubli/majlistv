import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFormatName } from '../src/lib/formatPick';

const list = [{ id: 1, slug: 'conference', nameFr: 'Conférence', nameEn: 'Talk', nameAr: 'محاضرة', count: 3 }];
test('nom du format selon la langue', () => {
  assert.equal(pickFormatName(list, 'conference', 'fr'), 'Conférence');
  assert.equal(pickFormatName(list, 'conference', 'en'), 'Talk');
  assert.equal(pickFormatName(list, 'conference', 'ar'), 'محاضرة');
  assert.equal(pickFormatName(list, 'inconnu', 'fr'), '');
  assert.equal(pickFormatName(list, null, 'fr'), '');
});

import { menuLabel } from '../src/lib/menus';
test('menu : l\'ancien nom « Catalogue » devient Explorer', () => {
  const it = { id: 'a', kind: 'appscreen', screen: 'talks', label: { fr: 'Catalogue', en: 'Catalogue' } };
  assert.equal(menuLabel(it, 'fr'), 'Explorer');
  assert.equal(menuLabel(it, 'en'), 'Explore');
  assert.equal(menuLabel({ ...it, label: { fr: 'Mes conférences' } }, 'fr'), 'Mes conférences');
  assert.equal(menuLabel({ ...it, screen: 'learn' }, 'fr'), 'Catalogue');
});
