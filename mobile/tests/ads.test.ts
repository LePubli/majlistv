// Publicité au lancement (étape 24c) : lecture sûre de la réponse, lien, règles d'affichage, compte à rebours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adAllowed, adRatio, parseAds, safeLink, skipRemaining, tooLate } from '../src/lib/ads';

const good = { id: 'a1', advertiser: 'Miel & Co', title: 'Le miel', sentence: '-10 %', cta: 'Voir', linkUrl: 'https://miel.fr/x', mediaKind: 'image', mediaUrl: 'https://s3/x.jpg' };

test('safeLink : http(s) seulement', () => {
  assert.equal(safeLink('https://exemple.fr/a?b=1'), 'https://exemple.fr/a?b=1');
  assert.equal(safeLink(' http://exemple.fr '), 'http://exemple.fr');
  for (const bad of ['javascript:alert(1)', 'intent://x#Intent;end', 'tel:+33123', 'exemple.fr', '', null, 5, 'https://a b.fr']) assert.equal(safeLink(bad), null, String(bad));
});

test('parseAds : garde les publicités complètes, ignore le reste, ne plante jamais', () => {
  const r = parseAds({ ads: [good, { ...good, id: 'a2', mediaKind: 'video' }, { ...good, id: 'bad1', linkUrl: 'javascript:x' }, { ...good, id: 'bad2', mediaUrl: '' }, { ...good, id: 'bad3', mediaKind: 'audio' }, { ...good, id: 'bad4', title: '' }, null, 7], skipSeconds: 5, imageSeconds: 6 });
  assert.deepEqual(r.ads.map((a) => a.id), ['a1', 'a2']);
  assert.equal(r.ads[1].mediaKind, 'video');
  assert.deepEqual(parseAds(null), { ads: [], skipSeconds: 5, imageSeconds: 6 });
  assert.deepEqual(parseAds('x').ads, []);
  assert.deepEqual(parseAds({ ads: 'non' }).ads, []);
});

test('parseAds : valeurs par défaut et bornes des durées', () => {
  const { ads, skipSeconds, imageSeconds } = parseAds({ ads: [{ ...good, cta: '', sentence: undefined, advertiser: undefined }], skipSeconds: 99, imageSeconds: 1 });
  assert.equal(ads[0].cta, 'En savoir plus');
  assert.equal(ads[0].sentence, '');
  assert.equal(skipSeconds, 15);
  assert.equal(imageSeconds, 3);
  assert.equal(parseAds({ skipSeconds: 'x' }).skipSeconds, 5);
  assert.equal(parseAds({ skipSeconds: 0 }).skipSeconds, 0);
});

test('adAllowed : jamais pour un enfant, ni pendant la prière, ni fonction coupée', () => {
  assert.equal(adAllowed({ featureOn: true, isKid: false, inPrayer: false }), true);
  assert.equal(adAllowed({ featureOn: false, isKid: false, inPrayer: false }), false);
  assert.equal(adAllowed({ featureOn: true, isKid: true, inPrayer: false }), false);
  assert.equal(adAllowed({ featureOn: true, isKid: false, inPrayer: true }), false);
});

test('tooLate, skipRemaining, adRatio', () => {
  assert.equal(tooLate(5999), false);
  assert.equal(tooLate(6001), true);
  assert.equal(tooLate(3000, 2000), true);
  assert.equal(skipRemaining(0, 5), 5);
  assert.equal(skipRemaining(3.2, 5), 2);
  assert.equal(skipRemaining(5, 5), 0);
  assert.equal(skipRemaining(9, 5), 0);
  assert.equal(skipRemaining(0, 0), 0);
  assert.equal(adRatio(3, 6), 0.5);
  assert.equal(adRatio(9, 6), 1);
  assert.equal(adRatio(1, 0), 0);
  assert.equal(adRatio(NaN, 6), 0);
});
