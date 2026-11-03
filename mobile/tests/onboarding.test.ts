// M6 : premiers pas (cartes, visite guidée), parrainage, cartes cadeaux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GIFT_MONTHS, GIFT_STATE, TOUR_STEPS, cleanCode, codeOk, giftCode, redeemLink, referralLink, showStart, startCards, tourSteps } from '../src/lib/onboarding';
import { DICT } from '../src/lib/i18n';

test('« Par quoi commencer ? » : 3 cartes selon les fonctions, une seule fois', () => {
  assert.deepEqual(startCards(() => true).map((c) => c.id), ['talk', 'quran', 'athkar']);
  assert.deepEqual(startCards((id) => id !== 'quranplan').map((c) => c.id), ['talk', 'athkar', 'ramadan']);
  assert.deepEqual(startCards(() => false).map((c) => c.id), ['talk']);
  assert.equal(startCards(() => true)[2].badge, 'obLearnBadge');
  assert.equal(showStart({ onboarded: false }, () => true), true);
  assert.equal(showStart({ onboarded: true }, () => true), false);
  assert.equal(showStart({}, () => true), false, 'profil pas encore relu : rien');
  assert.equal(showStart({ onboarded: false }, (id) => id !== 'onboarding'), false, 'fonction coupée');
  assert.equal(showStart(null, () => true), false);
});

test('visite guidée : étapes selon les fonctions', () => {
  assert.equal(tourSteps(() => true).length, TOUR_STEPS.length);
  assert.deepEqual(tourSteps((id) => id !== 'quran').map((s) => s.id), ['today', 'learn', 'menu', 'search', 'account']);
});

test('parrainage : lien du site, code de 8 caractères lisibles', () => {
  assert.equal(referralLink('https://site.example/', 'ABCD2345'), 'https://site.example/register?ref=ABCD2345');
  assert.equal(cleanCode('ab cd-23 45'), 'ABCD2345');
  assert.equal(codeOk('ABCD-2345'), true);
  assert.equal(codeOk('ABC'), false);
  assert.equal(codeOk('ABCD2340'), false, '0 exclu (comme le serveur)');
});

test('cartes cadeaux : code à 12 caractères, lien d\'activation, états', () => {
  assert.equal(giftCode('abcd efgh jklm'), 'ABCD-EFGH-JKLM');
  assert.equal(giftCode('ABCD-EFGH'), null);
  assert.equal(redeemLink('https://site.example', 'ABCD-EFGH-JKLM'), 'https://site.example/redeem?code=ABCD-EFGH-JKLM');
  assert.equal(GIFT_MONTHS[12], 'gfM12'); assert.equal(GIFT_STATE.redeemed, 'gfRedeemed');
});

test('textes des premiers pas, du parrainage et des cartes cadeaux dans les trois langues', () => {
  const keys = ['obTitle', 'obIntro', 'obTalk', 'obTalkTx', 'obQuran', 'obQuranTx', 'obAthkar', 'obAthkarTx', 'obRamadan', 'obRamadanTx', 'obLearnBadge', 'obTourBtn', 'obLater', 'obAria',
    'tourOf', 'tourPrev', 'tourNext', 'tourEnd', 'tourSkip', 'tourMenu', 'tourAria', ...TOUR_STEPS.flatMap((s) => [s.title, s.text]),
    'refTab', 'refTitle', 'refIntro', 'refLink', 'refCode', 'refShareText', 'refInvited', 'refInvited2', 'refRewarded', 'refPending', 'refEarned', 'refCap', 'refYou', 'refRules', 'refMonth', 'refMonths',
    'gfAccount', 'gfNone', 'gfSentTo', 'gfCode', 'gfGiveLink', 'gfOffer', 'gfM1', 'gfM3', 'gfM12', 'gfPaid', 'gfRedeemed', 'gfVoid', 'rdTitle', 'rdLead', 'rdCode', 'rdBtn', 'rdOk', 'rdSub', 'shareBtn', 'submit', 'esFindTalk', 'lrNoCommit'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
});
