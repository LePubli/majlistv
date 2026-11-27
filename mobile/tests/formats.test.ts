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
